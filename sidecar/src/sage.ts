/**
 * Essay Studio · sage sidecar
 *
 * Spawned by the Tauri Rust backend. Reads JSON-lines requests from
 * stdin and writes JSON-lines events to stdout. Tauri parses each
 * line and emits the corresponding event to the renderer.
 *
 * Authentication: the Claude Agent SDK ships with its own Claude
 * Code binary, which authenticates against the user's existing OAuth
 * session (macOS Keychain on this platform). So as long as the user
 * is logged into Claude Code, usage is billed against their Agent
 * SDK monthly credit — NOT an API key.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options } from "@anthropic-ai/claude-agent-sdk";

// --------- Protocol ---------

type Sage = "em" | "sis" | "pra" | "cri";
type Pase = "coherencia" | "estilo" | "argumento" | "apa";
type Language = "es" | "en";

/** One rubric criterion. Passed verbatim into the user prompt. */
type Criterio = {
  id: string;
  nombre: string;
  peso: number;
  descripcion: string;
};

/** One saved source from the essay's library. */
type Fuente = {
  id: string;
  nombre: string;
  cita?: string;
  contenido: string;
  origen?: string;
  archivoNombre?: string;
};

type IncomingRequest =
  | {
      id: string;
      type: "interrogate";
      sage: Sage;
      text: string;
      /** Output language for the sage's response. Defaults to "es". */
      language?: Language;
    }
  | {
      id: string;
      type: "critique";
      sage: Sage;
      pase: Pase;
      text: string;
      /** Optional rubric criterios — bring them into the sage's lens. */
      rubrica?: Criterio[];
      /** Optional library of sources for this essay. */
      fuentes?: Fuente[];
      /** Output language. Defaults to "es". */
      language?: Language;
    }
  | { id: string; type: "ping" };

type OutgoingEvent =
  | { id: string; type: "started" }
  | { id: string; type: "token"; delta: string }
  | {
      id: string;
      type: "complete";
      result: string;
      usage?: unknown;
      costUsd?: number;
    }
  | { id: string; type: "error"; message: string };

function emit(event: OutgoingEvent): void {
  process.stdout.write(JSON.stringify(event) + "\n");
}

// --------- Prompt loading ---------

const SAGE_PROMPT_FILES: Record<Sage, string> = {
  em: "el-empirista.md",
  sis: "el-sistemico.md",
  pra: "el-practico.md",
  cri: "el-critico.md",
};

/**
 * Resolve the prompts directory. The sidecar is invoked from the
 * Tauri shell, which sets the cwd to the project root in dev and to
 * the bundled resources dir in production. We pass an explicit path
 * via the SAGE_PROMPTS_DIR env var; otherwise fall back to a sibling
 * `prompts/` next to this file.
 */
function promptsDir(): string {
  const env = process.env.SAGE_PROMPTS_DIR;
  if (env) return env;
  const here = fileURLToPath(import.meta.url);
  return resolve(here, "..", "..", "..", "prompts");
}

async function loadSagePrompt(sage: Sage): Promise<string> {
  const file = SAGE_PROMPT_FILES[sage];
  const path = resolve(promptsDir(), file);
  return readFile(path, "utf-8");
}

// --------- Generation helpers ---------

/**
 * Run a single agent turn for `sage` with the given user prompt and
 * stream text deltas back as `token` events. Emits `started`,
 * `token...`, then `complete` (or `error`). Used by both interrogate
 * and critique.
 */
async function runSageTurn(
  id: string,
  sage: Sage,
  userPrompt: string,
): Promise<void> {
  emit({ id, type: "started" });

  const systemPrompt = await loadSagePrompt(sage);

  const options: Options = {
    systemPrompt, // custom string fully replaces Claude Code's default
    allowedTools: [], // pure text generation, no Read/Edit/Bash etc.
    disallowedTools: [
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep",
      "WebSearch",
      "WebFetch",
      "Agent",
    ],
    settingSources: [], // don't inherit any user CLAUDE.md / skills
    includePartialMessages: true, // emits SDKPartialAssistantMessage stream events
    maxTurns: 1,
    stderr: (line: string) => process.stderr.write(line),
  };

  try {
    let finalText = "";
    let costUsd: number | undefined;
    let usage: unknown;

    for await (const msg of query({ prompt: userPrompt, options })) {
      switch (msg.type) {
        case "stream_event": {
          const event = msg.event;
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const delta = event.delta.text;
            if (delta) emit({ id, type: "token", delta });
          }
          break;
        }
        case "assistant": {
          for (const block of msg.message.content ?? []) {
            if (block.type === "text") finalText += block.text;
          }
          break;
        }
        case "result": {
          if (msg.subtype === "success") {
            finalText = msg.result || finalText;
            usage = msg.usage;
            costUsd = msg.total_cost_usd;
          } else {
            emit({
              id,
              type: "error",
              message: `agent result error (${msg.subtype})`,
            });
            return;
          }
          break;
        }
        default:
          break;
      }
    }

    emit({
      id,
      type: "complete",
      result: finalText.trim(),
      usage,
      costUsd,
    });
  } catch (err) {
    emit({
      id,
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// --------- Language directive ---------

/**
 * Top-of-prompt instruction that pins the output language. The persona
 * prompts themselves stay in Spanish (they encode voice and disposition,
 * not literal language) — the model translates the character into the
 * target language. Proper nouns + sage names stay as-is.
 */
function languageDirective(lang: Language | undefined): string {
  if (lang === "en") {
    return [
      "IMPORTANT LANGUAGE INSTRUCTION:",
      "Respond entirely in English. The persona description above is in Spanish but defines your voice and disposition — translate that character into English. Keep proper nouns (Edmondson, Meadows, Kahneman, etc.) and your name in their original form. All questions, anotaciones, mensajes and sugerencias must be in English.",
      "",
    ].join("\n");
  }
  // Default Spanish — explicit so the model doesn't drift.
  return [
    "INSTRUCCIÓN DE IDIOMA:",
    "Respondé enteramente en español. Mantené los nombres propios (Edmondson, Meadows, Kahneman, etc.) como están.",
    "",
  ].join("\n");
}

// --------- Interrogation ---------

async function runInterrogation(
  req: Extract<IncomingRequest, { type: "interrogate" }>,
) {
  const userPrompt = [
    languageDirective(req.language),
    "Texto a interrogar:",
    "",
    "---",
    req.text.trim(),
    "---",
    "",
    "Generá exactamente tres preguntas poderosas según las reglas de tu persona.",
  ].join("\n");
  await runSageTurn(req.id, req.sage, userPrompt);
}

// --------- Pluma Roja (critique) ---------

const PASE_INSTR: Record<Pase, string> = {
  coherencia:
    "Esta es la pasada \"coherencia\": estructura del argumento, niveles de análisis, loops, atribuciones individuales vs sistémicas, delays, intervenciones sin teoría de cambio.",
  estilo:
    "Esta es la pasada \"estilo\": registro, precisión, voz, claridad, jerga vacía, frases-comodín. Marcá fragmentos donde el estilo flaquea, no el contenido.",
  argumento:
    "Esta es la pasada \"argumento\": steelman débil, supuestos ideológicos no examinados, lo no dicho, retórica gratuita, originalidad real vs common sense disfrazado, quién no aparece.",
  apa:
    "Esta es la pasada \"APA\" (formato académico). Revisá EXCLUSIVAMENTE el formato APA 7 de las citas y referencias en el texto: paréntesis con autor y año, comas entre elementos, página obligatoria en citas textuales (p. X), \"et al.\" cuando hay 3+ autores en una cita parentética, & en lugar de \"y\" dentro del paréntesis, mayúsculas sólo donde corresponde, ausencia de números de página en citas indirectas, congruencia entre citas en el texto y la sección de referencias. NO juzgues contenido, sólo formato.",
};

/** Render the rubric as a compact block the sage can read in-prompt. */
function renderRubrica(criterios: Criterio[]): string {
  if (!criterios.length) return "";
  const lines: string[] = [
    "El usuario provee una rúbrica con criterios. Cuando una anotación se alinee con un criterio, agregá la llave \"criterioId\" con el id exacto del criterio. Si no encaja con ninguno, omití \"criterioId\".",
    "",
    "RÚBRICA:",
  ];
  for (const c of criterios) {
    lines.push(`- id=${c.id} · peso=${c.peso}/5 · ${c.nombre}: ${c.descripcion}`);
  }
  return lines.join("\n") + "\n\n";
}

/** Render the saved sources as a referenceable block. */
function renderFuentes(fuentes: Fuente[]): string {
  if (!fuentes.length) return "";
  const lines: string[] = [
    "El autor te entrega también su biblioteca: las fuentes en que apoya el borrador. Léelas como contexto y juzga el ensayo con ellas en mano (¿el autor las usa bien? ¿se contradice con lo que dicen? ¿omite algo crítico que está en estas fuentes?). En la pasada APA, además, usá las citas formales para verificar el formato de las referencias del texto.",
    "",
    "FUENTES DEL AUTOR:",
  ];
  for (const f of fuentes) {
    lines.push("");
    lines.push(`---- fuente: ${f.nombre}`);
    if (f.cita) lines.push(`cita APA: ${f.cita}`);
    lines.push("contenido:");
    lines.push(f.contenido);
    lines.push("---- fin fuente");
  }
  return lines.join("\n") + "\n\n";
}

async function runCritique(
  req: Extract<IncomingRequest, { type: "critique" }>,
) {
  const rubricaBlock = renderRubrica(req.rubrica ?? []);
  const fuentesBlock = renderFuentes(req.fuentes ?? []);
  const parts: string[] = [
    languageDirective(req.language),
    "El usuario te entrega su borrador para pluma roja.",
    "",
    PASE_INSTR[req.pase],
    "",
  ];
  if (rubricaBlock) parts.push(rubricaBlock);
  if (fuentesBlock) parts.push(fuentesBlock);
  parts.push(
    "Texto a revisar:",
    "",
    "---",
    req.text.trim(),
    "---",
    "",
    "Devolvé entre 3 y 8 anotaciones que pertenezcan a tu dominio en esta pasada.",
    "",
    "FORMATO ESTRICTO: una línea de JSON por anotación. Nada antes, nada después, sin envoltura markdown, sin numeración, sin comentarios. Cada línea es un objeto con las llaves exactas:",
    "  \"cita\":       fragmento literal copiado del texto, entre 4 y 25 palabras, exacto carácter por carácter.",
    "  \"severidad\":  una de \"alta\" | \"media\" | \"baja\".",
    "  \"mensaje\":    explicación pedagógica de qué falla y por qué importa. Hasta 50 palabras. Educa al autor — no des órdenes secas, contá el razonamiento.",
    "  \"sugerencia\": OPCIONAL — y SOLO el texto literal que reemplazaría la cita en el documento. NO uses imperativos como \"Reformula X\", \"Cita al autor\", \"Reescribe Y\" — eso va en mensaje. Si no podés dar un fragmento limpio listo para pegar, omití el campo. La interfaz tiene un botón \"Reemplazar\" que sustituye la cita literalmente por este valor, así que tiene que poder leerse bien en su lugar dentro del párrafo.",
    "  \"criterioId\": opcional, sólo si la anotación se alinea con un criterio de la rúbrica de arriba.",
    "",
    "Ejemplo de línea válida (notá cómo mensaje explica el porqué y sugerencia es texto listo para pegar, no una instrucción):",
    exampleLineFor(req.language),
    "",
    "Si no encontrás nada interesante en tu dominio, devolvé una sola línea: {\"vacio\":true,\"razon\":\"...\"}",
    "",
    "Recordá: las LLAVES del JSON (cita, severidad, mensaje, sugerencia, criterioId) son técnicas y van siempre en español tal como las defino. Los VALORES de \"mensaje\" y \"sugerencia\" van en el idioma del ensayo indicado arriba.",
  );
  await runSageTurn(req.id, req.sage, parts.join("\n"));
}

/** Example JSON line in the target language. Sesión 15: el ejemplo
 *  ahora muestra el split honesto — `mensaje` es la explicación
 *  pedagógica (el "por qué"), `sugerencia` es ÚNICAMENTE el texto
 *  que se pegaría en lugar de la cita. Antes ambos campos se
 *  confundían y la sugerencia terminaba siendo un imperativo
 *  ("Reformula X") que al "Aplicar" rompía el documento. */
function exampleLineFor(lang: Language | undefined): string {
  if (lang === "en") {
    return '{"cita":"with great power comes great responsibility","severidad":"alta","mensaje":"You are paraphrasing Uncle Ben without crediting the source. Quoting or paraphrasing famous lines without attribution is plagiarism, even when the line is iconic. Add the in-text citation right after the phrase.","sugerencia":"with great power comes great responsibility (Uncle Ben, 2002)"}';
  }
  return '{"cita":"un gran poder conlleva una gran responsabilidad","severidad":"alta","mensaje":"Estás parafraseando a Tío Ben sin citarlo. Reproducir frases icónicas sin atribución es plagio aunque la cita sea conocida — la regla académica no hace excepciones. Añadí la cita parentética justo después de la frase.","sugerencia":"un gran poder conlleva una gran responsabilidad (Tío Ben, 2002)"}';
}

// --------- stdin loop ---------

let stdinBuffer = "";

process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk: string) => {
  stdinBuffer += chunk;
  let nl: number;
  while ((nl = stdinBuffer.indexOf("\n")) !== -1) {
    const line = stdinBuffer.slice(0, nl).trim();
    stdinBuffer = stdinBuffer.slice(nl + 1);
    if (!line) continue;
    handleLine(line);
  }
});

function handleLine(line: string): void {
  let req: IncomingRequest;
  try {
    req = JSON.parse(line) as IncomingRequest;
  } catch (err) {
    emit({
      id: "<parse>",
      type: "error",
      message: `invalid JSON: ${(err as Error).message}`,
    });
    return;
  }
  if (req.type === "ping") {
    emit({ id: req.id, type: "complete", result: "pong" });
    return;
  }
  if (req.type === "interrogate") {
    void runInterrogation(req);
    return;
  }
  if (req.type === "critique") {
    void runCritique(req);
    return;
  }
  emit({
    id: (req as { id?: string }).id ?? "<unknown>",
    type: "error",
    message: "unknown request type",
  });
}

process.stdin.on("end", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
