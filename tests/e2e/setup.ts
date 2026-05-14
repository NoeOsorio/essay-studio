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
      __E2E_ESSAYS__: Map<string, EssayLike>;
      __E2E_DISPATCH: (name: string, payload: unknown) => void;
    };
    win.__E2E_ESSAYS__ = essays;
    win.__E2E_DISPATCH = dispatchEvent;

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
            essays.delete(String(args.id));
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
            const fakeAnswer = [
              "1. ¿En qué muestra se midió ese efecto y con qué N?",
              "2. ¿La cita de Edmondson es del estudio original o de una review?",
              "3. ¿En qué población se vuelve falso este argumento?",
              "4. ¿Qué instrumento medible reemplazaría la frase \"rituales sostienen seguridad\"?",
              "5. ¿Qué resultado te incomodaría descubrir aquí?",
            ];
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
          case "sage_ping":
            return String(args.id);
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
};

/** Get the in-memory essays map as visible from the page. */
export async function dumpEssays(page: Page): Promise<EssayDump[]> {
  return page.evaluate(() => {
    const win = window as unknown as { __E2E_ESSAYS__?: Map<string, unknown> };
    if (!win.__E2E_ESSAYS__) return [];
    return Array.from(win.__E2E_ESSAYS__.values());
  }) as Promise<EssayDump[]>;
}
