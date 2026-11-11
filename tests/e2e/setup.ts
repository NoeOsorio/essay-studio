import { expect, type Page } from "@playwright/test";

/**
 * Inject a fake `window.__TAURI_INTERNALS__` BEFORE the app boots, so
 * `invoke()` calls succeed against an in-memory stub instead of
 * throwing. Essays live in a Map keyed by id; the stub mimics the
 * shape of our Rust commands.
 *
 * The stub also implements the Tauri event-plugin protocol so
 * `listen('sage://event', cb)` works end-to-end against a faked sage
 * sidecar (no Anthropic credits burned).
 */
export async function installTauriStub(page: Page) {
  // A moving note must never cover a button in a test.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    type EssayLike = {
      id: string;
      title: string;
      content: unknown;
      board?: unknown;
      interrogatorios?: unknown[];
      findings?: unknown[];
      mode: string;
      wordCount: number;
      createdAt: string;
      updatedAt: string;
    };

    // Requests the stub keeps open on purpose (`hold`), by request id.
    const held = new Set<string>();

    const essays = new Map<string, EssayLike>();
    // Sesión 12: in-memory history per essay. Mirrors what `history.rs`
    // persists: append-only list of full Snapshot objects, keyed by
    // essay id. The stub's history_append also implements the retention
    // rule (20 newest autos + all explicit kinds).
    type SnapshotLike = {
      takenAt: string;
      kind: string;
      essay: EssayLike;
    };
    const histories = new Map<string, SnapshotLike[]>();
    const MAX_AUTO = 20;
    const pruneHistory = (id: string) => {
      const list = histories.get(id);
      if (!list) return;
      const autos = list.filter((s) => s.kind === "auto");
      if (autos.length <= MAX_AUTO) return;
      const dropCount = autos.length - MAX_AUTO;
      // Drop the oldest autos by takenAt ASC.
      const sortedAutos = [...autos].sort((a, b) =>
        a.takenAt.localeCompare(b.takenAt),
      );
      const dropSet = new Set(sortedAutos.slice(0, dropCount).map((s) => s.takenAt));
      histories.set(
        id,
        list.filter((s) => !dropSet.has(s.takenAt)),
      );
    };
    const callbacks = new Map<number, (msg: unknown) => void>();
    let callbackId = 0;
    // event name -> set of {id, handlerId} subscriptions
    const eventSubs = new Map<string, Set<number>>();
    let eventId = 0;
    // eventId -> { name, handlerId }
    const eventIndex = new Map<number, { name: string; handlerId: number }>();

    function dispatchEvent(name: string, payload: unknown) {
      const subs = eventSubs.get(name);
      if (!subs) return;
      for (const subId of subs) {
        const entry = eventIndex.get(subId);
        if (!entry) continue;
        const cb = callbacks.get(entry.handlerId);
        if (cb) cb({ event: name, id: subId, payload });
      }
    }

    const win = window as unknown as {
      __TAURI_INTERNALS__: unknown;
      __TAURI_EVENT_PLUGIN_INTERNALS__: unknown;
      __E2E_ESSAYS__: Map<string, EssayLike>;
      __E2E_HISTORIES__: Map<string, SnapshotLike[]>;
      __E2E_DISPATCH: (name: string, payload: unknown) => void;
    };
    win.__E2E_ESSAYS__ = essays;
    win.__E2E_HISTORIES__ = histories;
    win.__E2E_DISPATCH = dispatchEvent;

    // Tauri's event package uses this side-namespace for direct
    // unlisten — it's NOT routed through invoke().
    win.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (event: string, subId: number) => {
        eventSubs.get(event)?.delete(subId);
        eventIndex.delete(subId);
      },
    };

    win.__TAURI_INTERNALS__ = {
      transformCallback: (cb: (msg: unknown) => void) => {
        const id = ++callbackId;
        callbacks.set(id, cb);
        return id;
      },
      unregisterCallback: (id: number) => {
        callbacks.delete(id);
      },
      // Some Tauri versions reference this name instead; keep both.
      unregisterListener: (id: number) => {
        callbacks.delete(id);
      },
      callbacks,
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { windowLabel: "main", label: "main" },
      },
      invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
        switch (cmd) {
          case "essay_list": {
            const out = Array.from(essays.values()).map((e) => ({
              id: e.id,
              title: e.title,
              mode: e.mode,
              wordCount: e.wordCount,
              createdAt: e.createdAt,
              updatedAt: e.updatedAt,
            }));
            out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
            return out;
          }
          case "library_list": {
            // Same shape as the Rust index: the six meta fields, an excerpt,
            // the file time and the review inputs when there are any.
            type Node = { type?: string; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: Node[] };
            const deny = ["mensaje", "reemplazo", "sugerencia", "evidence", "provenance"];
            const out = Array.from(essays.values()).map((e) => {
              const texts: string[] = [];
              // Blocks holding an annotation mark, text intact, annotation marks only.
              const slim = (m: { type: string; attrs?: Record<string, unknown> }) => {
                const attrs: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(m.attrs ?? {})) if (!deny.includes(k)) attrs[k] = v;
                return { type: m.type, attrs };
              };
              const prune = (n: Node): Node | null => {
                const kids = n.content ?? [];
                if (kids.length === 0) return null;
                if (kids.some((c) => c.type === "text")) {
                  let any = false;
                  const kept = kids.map((c) => {
                    const o: Node = { type: c.type, text: c.text };
                    const ms = (c.marks ?? []).filter((m) => m.type === "annotation").map(slim);
                    if (c.type === "text" && ms.length > 0) { any = true; o.marks = ms; }
                    return o;
                  });
                  return any ? { type: n.type, content: kept } : null;
                }
                const kept = kids.map(prune).filter((x): x is Node => x !== null);
                return kept.length > 0 ? { type: n.type, content: kept } : null;
              };
              const marks = ((e.content as Node).content ?? []).map(prune).filter((x): x is Node => x !== null);
              const walk = (n: Node, top: boolean) => {
                if (n.type === "text" && typeof n.text === "string") texts.push(n.text);
                for (const c of n.content ?? []) walk(c, false);
                if (!top && n.type === "paragraph") texts.push(" ");
              };
              walk(e.content as Node, true);
              const body = texts.join("").replace(/\s+/g, " ").trim();
              const meta = (e as { evaluacionMeta?: Record<string, unknown> }).evaluacionMeta;
              const recs = (e.findings ?? []) as Record<string, unknown>[];
              const entry: Record<string, unknown> = {
                id: e.id,
                title: e.title,
                mode: e.mode,
                wordCount: e.wordCount,
                createdAt: e.createdAt,
                updatedAt: e.updatedAt,
                excerpt: body.slice(0, 320),
                fileModifiedMs: Date.parse(e.updatedAt) || 0,
              };
              if (meta || recs.length > 0 || marks.length > 0) {
                const review: Record<string, unknown> = { blocks: marks };
                if (recs.length > 0) {
                  review.findings = recs.map((r) => ({
                    id: r.id, sage: r.sage, pase: r.pase, severidad: r.severidad,
                    criterioId: r.criterioId, status: r.status,
                  }));
                }
                if (meta) {
                  const { reviewerRuns: _drop, ...rest } = meta;
                  void _drop;
                  review.evaluacionMeta = rest;
                }
                const rub = (e as { rubrica?: { criterios?: unknown[] } }).rubrica;
                if (rub?.criterios) review.rubrica = { criterios: rub.criterios };
                entry.review = review;
              }
              return entry as { updatedAt: string; id: string; title: string; excerpt: string };
            });
            out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
            return out;
          }
          case "library_search": {
            const clean = (t: string) =>
              t.toLowerCase().normalize("NFD").replace(/n\u0303/g, "\u00f1").replace(/[\u0300-\u036f]/g, "");
            const words = clean(String(args.query ?? "")).split(/\s+/).filter(Boolean);
            if (words.length === 0) return { hits: [] };
            type Node = { type?: string; text?: string; content?: Node[] };
            const bodyOf = (e: EssayLike) => {
              const parts: string[] = [];
              const walk = (n: Node) => {
                if (n.type === "text" && typeof n.text === "string") parts.push(n.text);
                for (const c of n.content ?? []) walk(c);
                if (n.type === "paragraph") parts.push(" ");
              };
              walk(e.content as Node);
              return parts.join("").replace(/\s+/g, " ").trim();
            };
            const segs = (text: string) => {
              // Fold is one character to one character, so offsets line up.
              const f = clean(text);
              const mark = new Array<boolean>(text.length).fill(false);
              for (const w of words) {
                let i = f.indexOf(w);
                while (i >= 0) {
                  for (let k = i; k < i + w.length; k++) mark[k] = true;
                  i = f.indexOf(w, i + 1);
                }
              }
              const out: { text: string; hit: boolean }[] = [];
              for (let i = 0; i < text.length; i++) {
                const last = out[out.length - 1];
                if (last && last.hit === mark[i]) last.text += text[i];
                else out.push({ text: text[i], hit: mark[i] });
              }
              return out;
            };
            const hits: { id: string; rank: string; title: unknown; snippet?: unknown; updatedAt: string }[] = [];
            for (const e of essays.values()) {
              const t = clean(e.title);
              const b = clean(bodyOf(e));
              if (!words.every((w) => t.includes(w) || b.includes(w))) continue;
              const inTitle = words.every((w) => t.includes(w));
              const hit: { id: string; rank: string; title: unknown; snippet?: unknown; updatedAt: string } = {
                id: e.id, rank: inTitle ? "title" : "body", title: segs(e.title), updatedAt: e.updatedAt,
              };
              if (!inTitle) {
                const body = bodyOf(e);
                const at = Math.max(0, clean(body).indexOf(words.find((w) => b.includes(w)) ?? ""));
                const start = Math.max(0, at - 40);
                const piece = body.slice(start, start + 120);
                hit.snippet = segs((start > 0 ? "\u2026" : "") + piece + (start + 120 < body.length ? "\u2026" : ""));
              }
              hits.push(hit);
            }
            hits.sort((a, b) =>
              a.rank === b.rank ? b.updatedAt.localeCompare(a.updatedAt) : a.rank === "title" ? -1 : 1,
            );
            return { hits: hits.map(({ updatedAt: _u, ...h }) => { void _u; return h; }) };
          }
          case "essay_read": {
            const id = String(args.id);
            const e = essays.get(id);
            if (!e) throw new Error(`essay not found: ${id}`);
            return e;
          }
          case "essay_write": {
            const e = args.essay as EssayLike;
            essays.set(e.id, e);
            return null;
          }
          case "essay_delete": {
            const id = String(args.id);
            essays.delete(id);
            histories.delete(id);
            return null;
          }
          case "history_list": {
            const id = String(args.id);
            const list = histories.get(id) ?? [];
            return [...list]
              .map((s) => ({
                takenAt: s.takenAt,
                kind: s.kind,
                wordCount: s.essay.wordCount,
                title: s.essay.title,
              }))
              .sort((a, b) => b.takenAt.localeCompare(a.takenAt));
          }
          case "history_read": {
            const id = String(args.id);
            const takenAt = String(args.takenAt);
            const list = histories.get(id) ?? [];
            const found = list.find((s) => s.takenAt === takenAt);
            if (!found) throw new Error(`snapshot not found: ${takenAt}`);
            return found;
          }
          case "history_append": {
            const snap = args.snapshot as SnapshotLike;
            const id = snap.essay.id;
            const cur = histories.get(id) ?? [];
            // Idempotent on takenAt — same as Rust.
            if (cur.some((s) => s.takenAt === snap.takenAt)) return null;
            histories.set(id, [...cur, snap]);
            pruneHistory(id);
            return null;
          }
          case "plugin:event|listen": {
            const name = String(args.event);
            const handlerId = Number(args.handler);
            const subId = ++eventId;
            if (!eventSubs.has(name)) eventSubs.set(name, new Set());
            eventSubs.get(name)!.add(subId);
            eventIndex.set(subId, { name, handlerId });
            return subId;
          }
          case "plugin:event|unlisten": {
            const name = String(args.event);
            const subId = Number(args.eventId);
            eventSubs.get(name)?.delete(subId);
            eventIndex.delete(subId);
            return null;
          }
          case "sage_interrogate": {
            const id = String(args.id);
            const sage = String(args.sage);
            const language = args.language as string | undefined;
            // Surface the language to tests for assertion.
            const winx2 = window as unknown as {
              __E2E_LAST_INTERROGATE__?: Map<
                string,
                { sage: string; language?: string }
              >;
            };
            if (!winx2.__E2E_LAST_INTERROGATE__)
              winx2.__E2E_LAST_INTERROGATE__ = new Map();
            winx2.__E2E_LAST_INTERROGATE__.set(sage, { sage, language });
            // Per-sage canned answers so the test can assert which
            // sage produced the questions without burning credits.
            const fakeAnswers: Record<string, string[]> = {
              em: [
                "1. ¿En qué muestra se midió ese efecto y con qué N?",
                "2. ¿La cita de Edmondson es del estudio original o de una review?",
                "3. ¿Qué instrumento medible reemplazaría la frase \"rituales sostienen seguridad\"?",
              ],
              sis: [
                "1. ¿Qué loop de retroalimentación sostiene este comportamiento?",
                "2. ¿Estás explicando una dinámica estructural con causas individuales?",
                "3. ¿Dónde está el punto de apalancamiento implícito?",
              ],
              pra: [
                "1. ¿Qué cambiaría un manager el lunes si esto fuera verdad?",
                "2. ¿Quién implementa esto y qué se lo impide?",
                "3. ¿Cuál es el primer paso accionable concreto?",
              ],
              cri: [
                "1. ¿Cuál sería el steelman del lado opuesto?",
                "2. ¿Quién no aparece en esta historia?",
                "3. ¿Qué supuestos ideológicos asume el autor sin examinar?",
              ],
            };
            const fakeAnswer = fakeAnswers[sage] ?? fakeAnswers.em;
            // Per-agent behavior, set by a spec before the run:
            //   hold       stays open until sage_cancel ends it with CANCELLED
            //   malformed  ends with NO_QUESTIONS, like prose with no numbers
            const interrogateBehavior = (
              window as unknown as {
                __E2E_INTERROGATE_BEHAVIOR__?: Record<string, string>;
              }
            ).__E2E_INTERROGATE_BEHAVIOR__?.[sage];
            if (interrogateBehavior === "hold") {
              held.add(id);
              queueMicrotask(() => {
                dispatchEvent("sage://event", { id, type: "started" });
              });
              return id;
            }
            if (interrogateBehavior === "malformed") {
              queueMicrotask(() => {
                dispatchEvent("sage://event", { id, type: "started" });
                dispatchEvent("sage://event", {
                  id,
                  type: "error",
                  message: "no usable questions",
                  code: "NO_QUESTIONS",
                });
              });
              return id;
            }
            // Emit after a microtask so the renderer has time to wire
            // its listener before the first event arrives.
            queueMicrotask(() => {
              dispatchEvent("sage://event", { id, type: "started" });
              for (const line of fakeAnswer) {
                dispatchEvent("sage://event", {
                  id,
                  type: "token",
                  delta: line + "\n",
                });
              }
              fakeAnswer.forEach((line, index) => {
                dispatchEvent("sage://event", {
                  id,
                  type: "question",
                  index,
                  text: line.replace(/^\d+\.\s+/, ""),
                });
              });
              dispatchEvent("sage://event", {
                id,
                type: "complete",
                result: fakeAnswer.join("\n"),
                costUsd: 0.0023,
              });
            });
            return id;
          }
          case "sage_ask": {
            const id = String(args.id);
            const winAsk = window as unknown as {
              __E2E_LAST_ASK__?: {
                sage: string;
                text: string;
                question: string;
                language?: string;
              };
            };
            winAsk.__E2E_LAST_ASK__ = {
              sage: String(args.sage),
              text: String(args.text),
              question: String(args.question),
              language: args.language as string | undefined,
            };
            queueMicrotask(() => {
              dispatchEvent("sage://event", { id, type: "started" });
              dispatchEvent("sage://event", {
                id,
                type: "complete",
                result: "Según la fuente, el efecto se midió en una muestra pequeña.",
                costUsd: 0.001,
              });
            });
            return id;
          }
          case "sage_critique": {
            const id = String(args.id);
            const sage = String(args.sage);
            const pase = String(args.pase);
            const text = String(args.text ?? "");
            // Surface the rubrica/fuentes/language payload to tests
            // so we can assert that the renderer forwarded them. Map
            // keeps the last call per pase for ergonomic lookup.
            type RubricaPayload = unknown[] | undefined;
            type FuentesPayload = unknown[] | undefined;
            const winx = window as unknown as {
              __E2E_LAST_CRITIQUE__?: Map<
                string,
                {
                  sage: string;
                  pase: string;
                  rubrica: RubricaPayload;
                  fuentes: FuentesPayload;
                  language?: string;
                }
              >;
            };
            if (!winx.__E2E_LAST_CRITIQUE__)
              winx.__E2E_LAST_CRITIQUE__ = new Map();
            winx.__E2E_LAST_CRITIQUE__.set(pase, {
              sage,
              pase,
              rubrica: args.rubrica as RubricaPayload,
              fuentes: args.fuentes as FuentesPayload,
              language: args.language as string | undefined,
            });
            // Pick three distinct anchors per pase so the three passes
            // each land on different ranges — otherwise the same span
            // would be marked three times. We carve the doc into ~9
            // slots and pick three slots per pase.
            const words = text.split(/\s+/).filter(Boolean);
            const span = (offset: number, n: number): string =>
              words.slice(offset, offset + n).join(" ");
            const slots: Record<string, [number, number][]> = {
              coherencia: [
                [0, 4],
                [Math.floor(words.length * 0.12), 4],
                [Math.floor(words.length * 0.24), 4],
              ],
              estilo: [
                [Math.floor(words.length * 0.36), 4],
                [Math.floor(words.length * 0.48), 4],
                [Math.floor(words.length * 0.6), 4],
              ],
              argumento: [
                [Math.floor(words.length * 0.72), 3],
                [Math.floor(words.length * 0.8), 3],
                [Math.floor(words.length * 0.88), 3],
              ],
              apa: [
                [Math.floor(words.length * 0.93), 3],
                [Math.floor(words.length * 0.96), 2],
                [Math.floor(words.length * 0.98), 2],
              ],
            };
            // Per-pass behavior, set by a spec before the run:
            //   fail      the request ends with an error
            //   hold      the request stays open until it is canceled
            //   unlocated one item whose quote is not in the text
            const behaviors = (
              window as unknown as {
                __E2E_CRITIQUE_BEHAVIOR__?: Record<string, string>;
              }
            ).__E2E_CRITIQUE_BEHAVIOR__;
            const behavior = behaviors?.[pase];
            if (behavior === "fail") {
              queueMicrotask(() => {
                dispatchEvent("sage://event", { id, type: "started" });
                dispatchEvent("sage://event", {
                  id,
                  type: "error",
                  message: "stub failure",
                  code: "INCOMPLETE_REVIEW",
                });
              });
              return id;
            }
            if (behavior === "hold") {
              held.add(id);
              queueMicrotask(() => {
                dispatchEvent("sage://event", { id, type: "started" });
              });
              return id;
            }
            const picks = slots[pase] ?? slots.coherencia;
            const A = span(picks[0][0], picks[0][1]) || "fragmento uno";
            const B = span(picks[1][0], picks[1][1]) || "fragmento dos";
            const C = span(picks[2][0], picks[2][1]) || "fragmento tres";
            // If a rubrica was sent, attach criterioId to one of the
            // items so tests can verify the chip renders.
            const rubricaArg = args.rubrica as
              | { id?: unknown }[]
              | undefined;
            const firstCriterio = rubricaArg?.[0];
            const linkedCriterioId =
              firstCriterio && typeof firstCriterio.id === "string"
                ? firstCriterio.id
                : undefined;
            // Canned anotaciones — una por pase por sabio. Cada una
            // es una línea JSON válida que parseAnotaciones consume.
            //
            // Sesión 16: la llave pasó de `sugerencia` a `reemplazo`.
            // El stub emite con la nueva llave para reflejar el
            // contrato del sidecar real. parseAnotaciones acepta
            // ambas por backward compat. Los reemplazos derivan de
            // la cita misma para mantener el matching de longitud
            // que las specs de aplicar esperan.
            const items: Record<string, unknown>[] = [
              {
                cita: A,
                severidad: "alta",
                mensaje: `[${sage}/${pase}] problema A — el sabio diagnostica el porqué (sin meter aquí la versión nueva).`,
                reemplazo: `${A} (referencia)`,
                ...(linkedCriterioId
                  ? { criterioId: linkedCriterioId }
                  : {}),
              },
              {
                cita: B,
                severidad: "media",
                mensaje: `[${sage}/${pase}] problema B — diagnóstico sin reemplazo concreto.`,
              },
              {
                cita: C,
                severidad: "baja",
                mensaje: `[${sage}/${pase}] problema C — diagnóstico pedagógico.`,
                reemplazo: `${C} con cita`,
              },
            ];
            if (behavior === "unlocated") {
              items.length = 0;
              items.push({
                cita: "una frase que este ensayo nunca dijo",
                severidad: "media",
                mensaje: `[${sage}/${pase}] la frase ya no está en el texto.`,
              });
            }
            queueMicrotask(() => {
              dispatchEvent("sage://event", { id, type: "started" });
              for (const it of items) {
                const line = JSON.stringify(it) + "\n";
                dispatchEvent("sage://event", {
                  id,
                  type: "token",
                  delta: line,
                });
              }
              dispatchEvent("sage://event", {
                id,
                type: "complete",
                result: items.map((it) => JSON.stringify(it)).join("\n"),
                costUsd: 0.0017,
              });
            });
            return id;
          }
          case "pdf_extract_text": {
            // The body arrives raw (the real command takes bytes, no path).
            // The "PDF" is text: `%PDF-scan` has no usable text, `%PDF-locked`
            // asks for a password, anything else is one page after the header.
            const raw = args as unknown;
            const bytes =
              raw instanceof Uint8Array
                ? raw
                : raw instanceof ArrayBuffer
                  ? new Uint8Array(raw)
                  : null;
            if (!bytes) throw new Error("expected raw bytes");
            const body = new TextDecoder().decode(bytes);
            if (!body.startsWith("%PDF-")) return { status: "unreadable" };
            if (body.startsWith("%PDF-scan"))
              return { status: "no_text", pages: 1 };
            if (body.startsWith("%PDF-locked")) return { status: "locked" };
            const newline = body.indexOf("\n");
            const page = newline >= 0 ? body.slice(newline + 1) : "";
            return { status: "ok", pages: 1, text: [page] };
          }
          case "sage_extract": {
            // Deterministic, driven by markers in the text, so existing tests
            // keep their meaning. Citation: `Title:`, `Author: Surname, Names`
            // (one per line), `Year:`, `Journal:`; the token FABRICATE_YEAR
            // adds a year that is NOT in the text (the validator must drop it).
            // Rubric: each bullet line becomes a criterion quoted from the text,
            // with a declared weight when the line has `NN%`. EXTRACT_FAIL ends
            // in an error and EXTRACT_MALFORMED returns text that is not JSON.
            const id = String(args.id);
            const task = String(args.task);
            const text = String(args.text);
            const winEx = window as unknown as {
              __E2E_LAST_EXTRACT__?: { task: string; text: string }[];
            };
            (winEx.__E2E_LAST_EXTRACT__ ??= []).push({ task, text });
            const lines = text.split("\n").map((l) => l.trim());
            const after = (re: RegExp) =>
              lines.map((l) => re.exec(l)).filter((m): m is RegExpExecArray => !!m);
            let result: string;
            if (task === "citation") {
              const out: Record<string, unknown> = {};
              const title = after(/^(?:Title|Título)\s*:\s*(.+)$/i)[0];
              if (title) out.titulo = title[1];
              const authors = after(/^(?:Author|Autor)\s*:\s*([^,]+?)\s*(?:,\s*(.+))?$/i);
              if (authors.length)
                out.autores = authors.map((m) => ({
                  apellidos: m[1],
                  ...(m[2] ? { nombres: m[2] } : {}),
                }));
              const year = after(/^(?:Year|Año|Anio)\s*:\s*(\d{4})$/i)[0];
              if (year) out.anio = year[1];
              if (text.includes("FABRICATE_YEAR")) out.anio = "2007";
              const journal = after(/^(?:Journal|Revista)\s*:\s*(.+)$/i)[0];
              if (journal) out.revista = journal[1];
              result = JSON.stringify(out);
            } else {
              const items = after(/^[-*]\s+(.+)$/).map((m) => {
                const line = m[1];
                const weight = /(\d+)\s*%/.exec(line);
                const colon = line.indexOf(":");
                return {
                  nombre: (colon > 0 ? line.slice(0, colon) : line)
                    .replace(/\s*\(?\d+\s*%\)?/, "")
                    .trim(),
                  descripcion: colon > 0 ? line.slice(colon + 1).trim() : line,
                  cita: line,
                  ...(weight
                    ? {
                        peso_declarado: weight[0],
                        peso_valor: Number(weight[1]),
                        peso_unidad: "porcentaje",
                      }
                    : {}),
                };
              });
              result = JSON.stringify(
                items.length ? { criterios: items } : { sin_criterios: true },
              );
            }
            if (text.includes("EXTRACT_MALFORMED")) result = "esto no es json";
            queueMicrotask(() => {
              dispatchEvent("sage://event", { id, type: "started" });
              if (text.includes("EXTRACT_FAIL")) {
                dispatchEvent("sage://event", {
                  id,
                  type: "error",
                  message: "stub extract failure",
                  code: "REVIEW_FAILED",
                });
                return;
              }
              dispatchEvent("sage://event", { id, type: "complete", result, costUsd: 0.0005 });
            });
            return id;
          }
          case "sage_cancel": {
            const id = String(args.id);
            const winc = window as unknown as { __E2E_CANCELED__?: string[] };
            (winc.__E2E_CANCELED__ ??= []).push(id);
            if (held.delete(id)) {
              queueMicrotask(() => {
                dispatchEvent("sage://event", {
                  id,
                  type: "error",
                  message: "cancelled",
                  code: "CANCELLED",
                });
              });
            }
            return id;
          }
          case "sage_ping":
            return String(args.id);
          case "sage_status": {
            // Default: pretend the sidecar is healthy so the
            // SidecarBanner stays hidden. The dedicated banner spec
            // (sidecar-banner.spec.ts) overrides by setting
            // `__E2E_SIDECAR_STATUS__` before the app boots.
            const winx = window as unknown as {
              __E2E_SIDECAR_STATUS__?:
                | { state: "up" }
                | { state: "unknown" }
                | { state: "down"; message: string };
            };
            return winx.__E2E_SIDECAR_STATUS__ ?? { state: "up" };
          }
          default:
            return null;
        }
      },
    };
  });
}

/** Wait until the app reaches the editor view for an essay. */
export async function openNewEssay(
  page: Page,
  mode: "academico" | "blog" = "academico",
) {
  await page.goto("/");
  const button =
    mode === "academico"
      ? page.getByTestId("library-new-academico")
      : page.getByTestId("library-new-blog");
  await button.click();
  await page.getByRole("textbox", { name: "Título del ensayo" }).waitFor({
    state: "visible",
  });
  await page.locator(".tl-container").first().waitFor({ state: "visible" });
  await page.waitForTimeout(250);
}

/**
 * Open the Más panel from its trigger (idempotent). Language, type, Fuentes,
 * Rúbrica, Historial and the MCP row live inside it.
 */
export async function openMore(page: Page) {
  const panel = page.getByTestId("more-panel");
  if (await panel.isVisible().catch(() => false)) return;
  await page.getByTestId("topbar-more").click();
  await panel.waitFor({ state: "visible" });
}

/**
 * Hazme preguntas lives in the toolbar, except while the board is open and
 * empty, where the empty board carries the same call to action. This points at
 * whichever one is on screen.
 */
export function hazmeButton(page: Page) {
  return page.locator('[data-testid="topbar-hazme"]:visible, [data-testid="board-empty-cta"]:visible');
}

/**
 * Open Hazme preguntas with only one agent on. The toolbar has no avatar per
 * agent: the panel opens with the essay type's defaults, so this turns every
 * other tile off and that agent's tile on. Names: Evidencia, Sistemas,
 * Práctica, Objeciones.
 */
export async function openSingleAgent(page: Page, name: string) {
  await hazmeButton(page).click();
  const ids: Record<string, string> = {
    Evidencia: "em",
    Sistemas: "sis",
    Práctica: "pra",
    Objeciones: "cri",
  };
  const want = ids[name];
  for (const id of Object.values(ids)) {
    const tile = page.getByTestId(`lectura-sage-toggle-${id}`);
    const active = (await tile.getAttribute("data-active")) === "true";
    if (active !== (id === want)) await tile.click();
  }
}

/**
 * Give Hazme preguntas a source: uploads a .txt through the drop zone, which
 * saves it to the essay's sources and selects it. Returns nothing; the panel
 * must be open.
 */
export async function pickSource(
  page: Page,
  body = "Edmondson definió la seguridad psicológica como la creencia compartida.",
  name = "fuente.txt",
) {
  await page.getByTestId("lectura-file-input").setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(body, "utf-8"),
  });
  await page
    .getByTestId("lectura-fuente-chip")
    .filter({ hasText: name.replace(/\.[^.]+$/, "") })
    .waitFor({ state: "visible" });
}

type EssayDump = {
  id: string;
  title: string;
  mode: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
  content: unknown;
  board?: unknown;
  interrogatorios?: unknown[];
  findings?: unknown[];
  rubrica?: { criterios: unknown[] };
  fuentes?: unknown[];
  evaluacionMeta?: unknown;
  language?: string;
};

/** Get the in-memory essays map as visible from the page. */
export async function dumpEssays(page: Page): Promise<EssayDump[]> {
  return page.evaluate(() => {
    const win = window as unknown as { __E2E_ESSAYS__?: Map<string, unknown> };
    if (!win.__E2E_ESSAYS__) return [];
    return Array.from(win.__E2E_ESSAYS__.values());
  }) as Promise<EssayDump[]>;
}

type CritiqueCapture = {
  sage: string;
  pase: string;
  rubrica?: unknown[];
  fuentes?: unknown[];
  language?: string;
};

/** Get the latest critique invocation per pase, as seen by the stub. */
export async function dumpCritiques(
  page: Page,
): Promise<Record<string, CritiqueCapture>> {
  return page.evaluate(() => {
    const win = window as unknown as {
      __E2E_LAST_CRITIQUE__?: Map<string, CritiqueCapture>;
    };
    const out: Record<string, CritiqueCapture> = {};
    win.__E2E_LAST_CRITIQUE__?.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }) as Promise<Record<string, CritiqueCapture>>;
}

type InterrogateCapture = { sage: string; language?: string };

/** Get the latest interrogate invocation per sage, as seen by the stub. */
export async function dumpInterrogates(
  page: Page,
): Promise<Record<string, InterrogateCapture>> {
  return page.evaluate(() => {
    const win = window as unknown as {
      __E2E_LAST_INTERROGATE__?: Map<string, InterrogateCapture>;
    };
    const out: Record<string, InterrogateCapture> = {};
    win.__E2E_LAST_INTERROGATE__?.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }) as Promise<Record<string, InterrogateCapture>>;
}

/**
 * Run a review from the Revisar ensayo panel and wait until the findings
 * have landed in the text. `skip` turns agents off before starting.
 * The panel closes on its own when the review lands.
 */
export async function runReview(
  page: Page,
  opts: { skip?: string[] } = {},
): Promise<void> {
  await page.getByTestId("topbar-pluma-roja").click();
  for (const pase of opts.skip ?? []) {
    await page.getByTestId(`pluma-pase-toggle-${pase}`).click();
  }
  await page.getByTestId("pluma-start").click();
  await expect(page.locator(".tiptap-content .anno").first()).toBeVisible();
  await expect(page.getByTestId("pluma-overlay")).toHaveCount(0);
}

/** Open the report card behind the stamp. */
export async function openReport(page: Page): Promise<void> {
  await page.getByTestId("scorebar").click();
  await expect(page.getByTestId("report-card")).toBeVisible();
}

/** Open Correcciones with every finding, through the report card. */
export async function openAllCorrections(page: Page): Promise<void> {
  await openReport(page);
  await page.getByTestId("stamp-all-corrections").click();
  await expect(page.getByTestId("corrections-panel")).toBeVisible();
}

/** Mark every open correction as not applicable, one by one. */
export async function dismissAllCorrections(page: Page): Promise<void> {
  const cards = page.getByTestId("finding-not-applicable");
  for (;;) {
    const n = await cards.count();
    if (n === 0) break;
    await cards.first().click();
    await expect(cards).toHaveCount(n - 1);
  }
}
