import { extract } from "./index";

export const INSTRUCTIONS_MAX = 2000;

type Does = "review" | "ask" | "both";

/**
 * Rewrites an agent's instructions to be clearer, keeping the writer's intent.
 * The answer is checked before it is returned: it must be non-empty, fit the
 * 2,000 character limit and differ from the input, otherwise this throws.
 */
export async function improveInstructions(args: {
  name: string;
  does: Does;
  instructions: string;
  requestId?: string;
}): Promise<string> {
  const original = args.instructions.trim();
  const { result } = await extract({
    task: "instructions",
    text: JSON.stringify({ nombre: args.name, que_hace: args.does, instrucciones: args.instructions }),
    requestId: args.requestId,
  });
  let parsed: unknown;
  try {
    const start = result.indexOf("{");
    const end = result.lastIndexOf("}");
    parsed = JSON.parse(start >= 0 && end > start ? result.slice(start, end + 1) : result);
  } catch {
    throw new Error("Unusable answer.");
  }
  const value = parsed && typeof parsed === "object" ? (parsed as { instrucciones?: unknown }).instrucciones : undefined;
  if (typeof value !== "string") throw new Error("Unusable answer.");
  const text = value.trim();
  if (!text || text.length > INSTRUCTIONS_MAX || text === original) throw new Error("Unusable answer.");
  return text;
}
