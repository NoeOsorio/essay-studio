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
      "Respond in English for everything you write TO the author — your questions, your `mensaje` explanations, your analysis. The persona description above is in Spanish but defines your voice and disposition — translate that character into English. Keep proper nouns (Edmondson, Meadows, Kahneman, etc.) and your name in their original form.",
      "EXCEPTION — `reemplazo` (the literal replacement prose): it MUST match the language of the `cita` it replaces, not your response language. If the cita is in Spanish, the reemplazo is in Spanish; if the cita is in English, the reemplazo is in English. The replacement is inserted into the user's document in place of the cita, so it has to read grammatically in the surrounding paragraph regardless of the user's interface language.",
      "",
    ].join("\n");
  }
  // Default Spanish — explicit so the model doesn't drift.
  return [
    "INSTRUCCIÓN DE IDIOMA:",
    "Respondé en español para todo lo que escribís AL autor — tus preguntas, tus `mensaje` con la explicación, tu análisis. Mantené los nombres propios (Edmondson, Meadows, Kahneman, etc.) como están.",
    "EXCEPCIÓN — `reemplazo` (la prosa literal que sustituye a la cita): DEBE coincidir con el idioma de la `cita` que reemplaza, NO con tu idioma de respuesta. Si la cita está en inglés, el reemplazo va en inglés; si la cita está en español, el reemplazo va en español. El reemplazo se inserta en el documento del autor en lugar de la cita, así que tiene que leerse gramaticalmente dentro del párrafo independientemente del idioma de la interfaz.",
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
    "  \"cita\":       fragmento literal copiado del texto del autor, entre 4 y 25 palabras, exacto carácter por carácter. Es lo que el usuario verá subrayado.",
    "  \"severidad\":  una de \"alta\" | \"media\" | \"baja\".",
    "  \"mensaje\":    diagnóstico pedagógico. ÚNICAMENTE explicás QUÉ está mal en la cita y POR QUÉ importa. Hasta 50 palabras. EL MENSAJE NUNCA INCLUYE EL TEXTO NUEVO. Si te encontrás escribiendo \"podrías decir...\", \"sería mejor que...\", \"reescribilo como...\", PARÁ — esa parte va en \"reemplazo\", no acá. El mensaje es de vos AL autor; el reemplazo es prosa que se inserta en su documento.",
    "  \"reemplazo\":  OPCIONAL. El texto LITERAL, COMPLETO, listo para pegar EN LUGAR DE la cita en el documento del autor. Imaginá un botón que apreta el autor y reemplaza la cita por este valor — tiene que leerse gramaticalmente dentro de su párrafo. No es un mensaje al autor; es prosa de su documento. NO empieces con verbos como \"Reescribí:\", \"Reformulá:\", \"Cambia a:\", \"Mejor:\". El campo es ÚNICAMENTE la versión nueva — sin prefacios, sin dos puntos, sin meta-comentarios. Si no podés dar un fragmento limpio (a veces el problema es estructural y no hay un fragmento aislado que reemplace), OMITÍ el campo entero. Idioma: coincide con el idioma de la cita, no con tu idioma de respuesta.",
    "  \"criterioId\": opcional, sólo si la anotación se alinea con un criterio de la rúbrica de arriba.",
    "",
    "⚠️ ANTI-PATRÓN A EVITAR — patrones que el modelo a veces produce y que rompen el documento al aplicar:",
    "  ❌ MAL: {\"reemplazo\":\"Reescribí: la cultura emerge de loops de incentivos\"}  ← \"Reescribí:\" es un verbo dirigido al autor; el autor terminaría con esa palabra pegada en su documento.",
    "  ❌ MAL: {\"reemplazo\":\"Mejor así: \\\"la transparencia tiene efecto sólo cuando...\\\"\"}  ← mete prefacio meta y comillas extras.",
    "  ❌ MAL: {\"mensaje\":\"Atribución individual. Reescribilo como propiedad emergente sostenida por loops.\"}  ← el mensaje terminó conteniendo el reemplazo embutido. El reemplazo va en \"reemplazo\", el mensaje sólo diagnostica.",
    "  ✅ BIEN: {\"mensaje\":\"Atribución individual de un fenómeno sistémico — borra los loops y rituales que sostienen la cultura.\",\"reemplazo\":\"la cultura emerge de loops de incentivos, rituales sostenidos y narrativas compartidas\"}",
    "",
    "Ejemplo válido típico de tu pasada actual (notá la separación entre mensaje = diagnóstico y reemplazo = prosa pura para pegar):",
    exampleLineFor(req.language, req.pase),
    "",
    "Ejemplo CROSS-LINGÜE — el ensayo está en " + (req.language === "en" ? "English" : "español") + " pero el autor citó textualmente algo en " + (req.language === "en" ? "Spanish" : "English") + ". El mensaje sigue tu idioma de respuesta (el autor lo lee), pero el reemplazo queda en el idioma del fragmento original (se inserta en lugar de la cita y tiene que leerse gramaticalmente en su párrafo):",
    crossLingualExampleFor(req.language),
    "",
    "Si no encontrás nada interesante en tu dominio, devolvé una sola línea: {\"vacio\":true,\"razon\":\"...\"}",
    "",
    "Recordá las dos reglas que más se rompen:",
    "  1. \"mensaje\" es PURO DIAGNÓSTICO — el texto nuevo NUNCA va ahí. Si tu mensaje contiene la versión corregida, mové esa parte a \"reemplazo\".",
    "  2. \"reemplazo\" es PURA PROSA — sin prefijos conversacionales ni meta-comentarios. Si arranca con un verbo dirigido al autor (\"Reescribí:\", \"Cambia a:\", \"Mejor:\"), está mal — sacale el prefijo.",
    "Las LLAVES del JSON (cita, severidad, mensaje, reemplazo, criterioId) son técnicas y van siempre en español tal como las defino. El VALOR de \"mensaje\" va en el idioma del ensayo (lo lee el autor). El VALOR de \"reemplazo\" coincide con el idioma de \"cita\".",
  );
  await runSageTurn(req.id, req.sage, parts.join("\n"));
}

/** Example JSON line typical of the current pase, in the target
 *  language. Sesión 15c: un ejemplo por pasada para que el modelo
 *  vea concretamente qué tipo de corrección le toca a cada una en
 *  lugar de defaultear al caso de citación (que era el sesgo de
 *  sesiones 15/15b). El campo `cita` cubre cualquier fragmento —
 *  voz pasiva, claim vago, atribución equivocada, formato APA, lo
 *  que el sabio crea que el autor debería corregir. Las severidades
 *  y largos del mensaje varían a propósito para no entrenar al
 *  modelo en un único registro. */
function exampleLineFor(lang: Language | undefined, pase: Pase): string {
  if (lang === "en") {
    return EXAMPLES_EN[pase];
  }
  return EXAMPLES_ES[pase];
}

// Sesión 16: notá que los `mensaje` ahora son ESTRICTAMENTE
// diagnósticos (qué falla + por qué importa) — sin meter la versión
// nueva embebida. La versión nueva vive ÚNICAMENTE en `reemplazo`.
// Esto rompe el patrón del modelo de duplicar contenido entre los
// dos campos.
const EXAMPLES_ES: Record<Pase, string> = {
  coherencia:
    '{"cita":"El liderazgo del CEO determina la cultura","severidad":"alta","mensaje":"Atribuís a una persona un fenómeno sistémico. La cultura no la \\"determina\\" nadie — emerge de loops de incentivos, rituales sostenidos y narrativas compartidas. Tratar al CEO como causa única borra las palancas reales del sistema.","reemplazo":"El liderazgo del CEO modula la cultura, pero ésta emerge de los incentivos, rituales y narrativas compartidas que cada miembro reproduce a diario"}',
  estilo:
    '{"cita":"se observa que el equipo respondió de manera efectiva","severidad":"media","mensaje":"Voz pasiva sin agente y sustantivos abstractos. ¿Quién observó? ¿\\"Efectiva\\" según qué métrica? La frase suena institucional pero no dice nada que el lector pueda verificar — es exactamente el tipo de prosa que erosiona confianza.","reemplazo":"el equipo redujo el tiempo de respuesta a incidentes de 14 a 3 horas en seis semanas"}',
  argumento:
    '{"cita":"todos sabemos que la transparencia mejora la confianza","severidad":"media","mensaje":"Apelación al sentido común disfrazada de evidencia. \\"Todos sabemos\\" esquiva las preguntas que de verdad importan: ¿bajo qué condiciones?, ¿con qué costos?, ¿cuándo se rompe el efecto? Sin esas condiciones es un cliché, no un argumento.","reemplazo":"la transparencia reduce el costo de coordinación cuando el equipo confía en que la información compartida no se usa para sancionar errores honestos (Edmondson, 1999)"}',
  apa:
    '{"cita":"(Edmondson 1999)","severidad":"baja","mensaje":"Falta la coma entre autor y año — APA 7 exige \\"Edmondson, 1999\\". Es desviación pequeña pero el lector que revisa referencias la nota inmediatamente y baja la confianza en el rigor del resto del aparato citacional.","reemplazo":"(Edmondson, 1999)"}',
};

const EXAMPLES_EN: Record<Pase, string> = {
  coherencia:
    '{"cita":"the CEO\'s leadership determines the culture","severidad":"alta","mensaje":"You are attributing a systemic phenomenon to one person. Culture is not \\"determined\\" by anyone — it emerges from feedback loops of incentives, sustained rituals, and shared narratives. Treating the CEO as sole cause erases the actual levers of the system.","reemplazo":"the CEO\'s leadership modulates the culture, but the culture itself emerges from the incentives, rituals, and shared narratives every member reproduces daily"}',
  estilo:
    '{"cita":"it was observed that the team responded effectively","severidad":"media","mensaje":"Agentless passive plus abstract nouns. Who observed? \\"Effectively\\" by what metric? The sentence sounds institutional but the reader can\'t check anything — exactly the kind of prose that quietly erodes trust.","reemplazo":"the team cut incident response time from 14 hours to 3 hours over six weeks"}',
  argumento:
    '{"cita":"we all know that transparency improves trust","severidad":"media","mensaje":"Appeal to common sense disguised as evidence. \\"We all know\\" sidesteps the questions that actually matter: under what conditions? at what cost? when does the effect break? Without those conditions it is a cliché, not an argument.","reemplazo":"transparency lowers the coordination cost when the team trusts that shared information will not be weaponized against honest mistakes (Edmondson, 1999)"}',
  apa:
    '{"cita":"(Edmondson 1999)","severidad":"baja","mensaje":"Missing comma between author and year — APA 7 requires \\"Edmondson, 1999\\". Minor deviation, but a reader checking references notices instantly and trust in the rest of the citation apparatus drops.","reemplazo":"(Edmondson, 1999)"}',
};

/** Cross-lingual example (sesión 15b): essay configured in one
 *  language but the author quoted text in the other. The mensaje
 *  follows the response language (the author reads it); the
 *  sugerencia stays in the cita's language (it replaces the cita
 *  inside the document and must read grammatically in that
 *  paragraph). This is common in academic writing — citing English
 *  sources inside a Spanish essay or vice versa. */
function crossLingualExampleFor(lang: Language | undefined): string {
  if (lang === "en") {
    // Author writing in English, but they quoted Edmondson in Spanish.
    // Reemplazo stays in Spanish so it inserts back into the doc cleanly.
    return '{"cita":"la seguridad psicológica es la creencia compartida","severidad":"media","mensaje":"You paraphrased Edmondson\'s 1999 framing without a citation. Close paraphrases of attributable scholarship need an in-text reference — both to support the claim and to let the reader trace it.","reemplazo":"la seguridad psicológica es la creencia compartida (Edmondson, 1999)"}';
  }
  // Author writing in Spanish, but they quoted Tío Ben in English.
  // Reemplazo stays in English so it inserts back into the doc cleanly.
  return '{"cita":"with great power comes great responsibility","severidad":"alta","mensaje":"Estás parafraseando a Tío Ben sin citarlo. Reproducir frases icónicas sin atribución es plagio aunque la cita sea conocida — la regla académica no hace excepciones por familiaridad cultural.","reemplazo":"with great power comes great responsibility (Uncle Ben, 2002)"}';
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
