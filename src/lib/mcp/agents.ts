import { AGENTS, AGENT_COLOR_KEYS, AGENT_COPY, type AgentId } from "@/lib/agent-identity";
import { cancelSidecarRequest } from "@/lib/agents";
import { improveInstructions, INSTRUCTIONS_MAX } from "@/lib/agents/improve";
import { useStore } from "@/lib/store";
import type { AgentColorKey, AgentIconKey, CustomAgent, CustomAgentId } from "@/lib/storage/types";
import { ToolError, type JsonObject } from "../../../shared/mcp";

// Same limits as the form in Ajustes (AgentForm.tsx) and the native check (src-tauri/src/agents.rs).
const NAME_MAX = 40;
const DOES: readonly CustomAgent["does"][] = ["review", "ask", "both"];
const ICONS: readonly AgentIconKey[] = ["ortografia", "pluma", "libro", "cita", "lista", "chispa"];
const AGENT_ID = /^c_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** Longest wait for a rewrite; the bridge gives up on a request after 30 seconds. */
const IMPROVE_TIMEOUT_MS = 25_000;
/** Review passes each built-in agent owns. */
const BUILTIN_PASSES: Record<AgentId, string> = {
  em: "estilo in academic essays, apa",
  sis: "coherencia",
  pra: "estilo in blog posts",
  cri: "argumento",
};

const length = (value: string) => [...value.trim()].length;

function describeCustom(agent: CustomAgent): JsonObject {
  return { id: agent.id, name: agent.name, instructions: agent.instructions, does: agent.does, color: agent.color, icon: agent.icon, canPaste: agent.canPaste, defaultOn: agent.defaultOn, createdAt: agent.createdAt };
}

function customAgents(): CustomAgent[] {
  return useStore.getState().agents;
}

/** Built-ins with their fixed copy, then the writer's own agents with every field. */
export function listAgents(): JsonObject {
  return {
    builtIn: AGENTS.filter((agent) => agent.id in AGENT_COPY).map((agent) => {
      const copy = AGENT_COPY[agent.id as AgentId];
      return { id: agent.id, name: agent.name, lens: agent.lens, description: copy.description, examples: copy.examples, whenItRuns: copy.whenItRuns, passes: BUILTIN_PASSES[agent.id as AgentId] };
    }),
    custom: customAgents().map(describeCustom),
  };
}

function requireText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || length(value) < 1 || length(value) > max) throw new ToolError("INVALID_ARGUMENTS", `${label} must be 1 to ${max} characters.`);
  return value.trim();
}

function findAgent(id: unknown): CustomAgent {
  if (typeof id !== "string" || !AGENT_ID.test(id)) throw new ToolError("INVALID_ARGUMENTS", "id must be an agent id (c_<uuid>) from list_agents.");
  const found = customAgents().find((agent) => agent.id === id);
  if (!found) throw new ToolError("AGENT_NOT_FOUND", "The agent does not exist. Read list_agents.");
  return found;
}

/** Create, update or delete a custom agent through the same store actions as the form. */
export async function editAgent(args: JsonObject): Promise<JsonObject> {
  const state = useStore.getState();
  const op = args.operation as "create" | "update" | "delete";
  try {
    if (op === "delete") {
      if (args.confirm !== true) throw new ToolError("CONFIRMATION_REQUIRED", "Deleting an agent requires an explicit user request and confirm=true.");
      const agent = findAgent(args.id);
      await state.deleteAgent(agent.id);
      return { deleted: true, id: agent.id };
    }
    const base = op === "update" ? findAgent(args.id) : null;
    if (op === "create" && args.id !== undefined) throw new ToolError("INVALID_ARGUMENTS", "create generates the id; do not send one.");
    const used = customAgents().map((agent) => agent.color);
    const record: CustomAgent = {
      id: base?.id ?? (`c_${crypto.randomUUID()}` as CustomAgentId),
      createdAt: base?.createdAt ?? new Date().toISOString(),
      name: requireText(args.name ?? base?.name, "name", NAME_MAX),
      instructions: requireText(args.instructions ?? base?.instructions, "instructions", INSTRUCTIONS_MAX),
      does: (args.does ?? base?.does ?? "review") as CustomAgent["does"],
      color: (args.color ?? base?.color ?? AGENT_COLOR_KEYS.find((key) => !used.includes(key)) ?? AGENT_COLOR_KEYS[0]) as AgentColorKey,
      icon: (args.icon ?? base?.icon ?? "pluma") as AgentIconKey,
      canPaste: typeof args.canPaste === "boolean" ? args.canPaste : base?.canPaste ?? true,
      defaultOn: typeof args.defaultOn === "boolean" ? args.defaultOn : base?.defaultOn ?? true,
    };
    if (!DOES.includes(record.does) || !AGENT_COLOR_KEYS.includes(record.color) || !ICONS.includes(record.icon)) throw new ToolError("INVALID_ARGUMENTS", "Invalid does, color or icon.");
    await state.saveAgent(record);
    return { agent: describeCustom(record), created: op === "create" };
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError("SAVE_FAILED", "The agents could not be saved. Read list_agents before retrying.");
  }
}

/** The «Mejorar» rewrite. Saves nothing unless apply is true and an existing agent was named. */
export async function improveAgentInstructions(args: JsonObject): Promise<JsonObject> {
  const stored = args.id !== undefined ? findAgent(args.id) : null;
  if (args.apply === true && !stored) throw new ToolError("INVALID_ARGUMENTS", "apply needs the id of the agent to update.");
  const instructions = requireText(args.instructions ?? stored?.instructions, "instructions", INSTRUCTIONS_MAX);
  const name = typeof args.name === "string" ? args.name.trim() : stored?.name ?? "";
  if (length(name) > NAME_MAX) throw new ToolError("INVALID_ARGUMENTS", `name must be at most ${NAME_MAX} characters.`);
  const does = (args.does ?? stored?.does ?? "review") as CustomAgent["does"];
  const requestId = crypto.randomUUID();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let better: string;
  try {
    better = await Promise.race([
      improveInstructions({ name, does, instructions, requestId }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { void cancelSidecarRequest(requestId); reject(new ToolError("TIMEOUT", "The rewrite took too long and was cancelled. Nothing was saved.")); }, IMPROVE_TIMEOUT_MS); }),
    ]);
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError("IMPROVE_FAILED", "The rewrite was unusable (empty, over 2000 characters or unchanged) or the model could not run. Nothing was saved.");
  } finally { clearTimeout(timer); }
  let applied = false;
  if (args.apply === true && stored) {
    const latest = findAgent(stored.id);
    try { await useStore.getState().saveAgent({ ...latest, instructions: better }); applied = true; }
    catch { throw new ToolError("SAVE_FAILED", "The rewrite was made but could not be saved. Nothing changed; use edit_agent to save it."); }
  }
  return { instructions: better, changed: better !== instructions, applied, ...(stored ? { id: stored.id } : {}) };
}
