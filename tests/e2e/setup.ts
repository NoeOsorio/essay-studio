import type { Page } from "@playwright/test";

/**
 * Inject a fake `window.__TAURI_INTERNALS__` BEFORE the app boots, so
 * `invoke()` calls succeed against an in-memory stub instead of
 * throwing. Essays live in a Map keyed by id; the stub mimics the
 * shape of our Rust commands.
 *
 * This must be installed via `page.addInitScript` (runs before any
 * page script), not `page.evaluate` (runs after).
 */
export async function installTauriStub(page: Page) {
  await page.addInitScript(() => {
    type EssayLike = {
      id: string;
      title: string;
      content: unknown;
      board?: unknown;
      mode: string;
      wordCount: number;
      createdAt: string;
      updatedAt: string;
    };

    const essays = new Map<string, EssayLike>();

    const win = window as unknown as {
      __TAURI_INTERNALS__: unknown;
      __E2E_ESSAYS__: Map<string, EssayLike>;
    };
    win.__E2E_ESSAYS__ = essays;
    win.__TAURI_INTERNALS__ = {
      transformCallback: (cb: unknown) => cb,
      callbacks: {},
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
          default:
            return null;
        }
      },
    };
  });
}

/** Wait until the app reaches the editor view for an essay. */
export async function openNewEssay(page: Page, mode: "academico" | "blog" = "academico") {
  await page.goto("/");
  const button =
    mode === "academico"
      ? page.getByRole("button", { name: /Nuevo académico/i })
      : page.getByRole("button", { name: /Nuevo blog/i });
  await button.click();
  // The editor view shows the breadcrumb "ensayos" + the title input.
  await page.getByRole("textbox", { name: "Título del ensayo" }).waitFor({
    state: "visible",
  });
  // Tldraw mounts via next/dynamic — wait for it before we type or click.
  await page.locator(".tl-container").first().waitFor({ state: "visible" });
  // Give tldraw a beat to finish wiring up its keyboard layer.
  await page.waitForTimeout(250);
}

/** Get the in-memory essays map as visible from the page. */
export async function dumpEssays(page: Page) {
  return page.evaluate(() => {
    const win = window as unknown as { __E2E_ESSAYS__?: Map<string, unknown> };
    if (!win.__E2E_ESSAYS__) return [];
    return Array.from(win.__E2E_ESSAYS__.values());
  });
}
