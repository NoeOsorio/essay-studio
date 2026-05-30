import type { Page } from "@playwright/test";

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
  await page.addInitScript(() => {
    type EssayLike = {
      id: string;
      title: string;
      content: unknown;
      board?: unknown;
      interrogatorios?: unknown[];
      mode: string;
      wordCount: number;
      createdAt: string;
      updatedAt: string;
    };

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
              dispatchEvent("sage://event", {
                id,
                type: "complete",
                result: fakeAnswer.join("\n"),
                costUsd: 0.0023,
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
            type RubricaPayload = { criterios: unknown[] } | undefined;
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
            const picks = slots[pase] ?? slots.coherencia;
            const A = span(picks[0][0], picks[0][1]) || "fragmento uno";
            const B = span(picks[1][0], picks[1][1]) || "fragmento dos";
            const C = span(picks[2][0], picks[2][1]) || "fragmento tres";
            // If a rubrica was sent, attach criterioId to one of the
            // items so tests can verify the chip renders.
            const rubricaArg = args.rubrica as
              | { criterios?: { id?: unknown }[] }
              | undefined;
            const firstCriterio = rubricaArg?.criterios?.[0];
            const linkedCriterioId =
              firstCriterio && typeof firstCriterio.id === "string"
                ? firstCriterio.id
                : undefined;
            // Canned anotaciones — one per pase per sage. Each is a
            // valid JSON-line so parseAnotaciones picks it up.
            const items: Record<string, unknown>[] = [
              {
                cita: A,
                severidad: "alta",
                mensaje: `[${sage}/${pase}] problema A detectado`,
                sugerencia: "Reescribe la apertura con la evidencia delante.",
                ...(linkedCriterioId
                  ? { criterioId: linkedCriterioId }
                  : {}),
              },
              {
                cita: B,
                severidad: "media",
                mensaje: `[${sage}/${pase}] problema B detectado`,
              },
              {
                cita: C,
                severidad: "baja",
                mensaje: `[${sage}/${pase}] problema C detectado`,
                sugerencia: "Especifica un caso concreto.",
              },
            ];
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
      ? page.getByRole("button", { name: /Nuevo académico/i })
      : page.getByRole("button", { name: /Nuevo blog/i });
  await button.click();
  await page.getByRole("textbox", { name: "Título del ensayo" }).waitFor({
    state: "visible",
  });
  await page.locator(".tl-container").first().waitFor({ state: "visible" });
  await page.waitForTimeout(250);
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
  rubrica?: { criterios: unknown[] };
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
