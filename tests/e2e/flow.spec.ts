import { test, expect } from "@playwright/test";
import { installTauriStub, dumpEssays } from "./setup";

/**
 * Sanity checks on the list ↔ editor flow and that the autosave
 * pipeline reaches our (stubbed) Tauri storage.
 */

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

test("creating an essay puts an entry in the storage stub", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Nuevo académico/i }).click();
  await page.getByRole("textbox", { name: "Título del ensayo" }).waitFor();

  const essays = await dumpEssays(page);
  expect(essays.length).toBe(1);
  expect(essays[0]).toMatchObject({ mode: "academico", title: "Sin título" });
});

test("typing into the title and body autosaves under the same id", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Nuevo académico/i }).click();

  await page.getByRole("textbox", { name: "Título del ensayo" }).click();
  await page.keyboard.type("Edmondson revisada", { delay: 5 });

  await page.locator(".tiptap-content").click();
  await page.keyboard.type("La seguridad psicológica no es ausencia de conflicto.", {
    delay: 5,
  });

  // Autosave debounce is 800ms — give it some buffer.
  await page.waitForTimeout(1200);
  const essays = await dumpEssays(page);
  expect(essays.length).toBe(1);
  expect(essays[0].title).toBe("Edmondson revisada");
  expect(essays[0].wordCount).toBeGreaterThan(0);
});

test("editor + board pane fill the viewport height (no dead empty space below)", async ({
  page,
}) => {
  // Sesión 13b: con grid-rows + null-rendering siblings, CSS Grid
  // auto-placement metía main en el track equivocado y el editor sólo
  // ocupaba ~430px de los 900px del viewport. Pasamos a flexbox columna
  // donde flex-1 siempre aplica a main sin importar cuántos siblings
  // (SidecarBanner, Scorebar, overlays) rendericen null. Este test
  // asserta que main ocupa al menos el 80% de la altura del viewport.
  await page.goto("/");
  await page.getByRole("button", { name: /Nuevo académico/i }).click();
  await page.getByRole("textbox", { name: "Título del ensayo" }).waitFor();

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");

  const mainBox = await page.locator("main").first().boundingBox();
  if (!mainBox) throw new Error("main has no box");

  // En 900px de viewport con Topbar ~70px, main debería ser >= ~720px.
  // Usamos 80% como umbral generoso para no ser frágil con Topbars
  // ligeramente más altos en el futuro.
  const minExpected = viewport.height * 0.8;
  if (mainBox.height < minExpected) {
    throw new Error(
      `main fills only ${Math.round(mainBox.height)}px of ${viewport.height}px viewport ` +
        `(expected >= ${Math.round(minExpected)}px). Likely a CSS Grid auto-placement ` +
        `regression — see page.tsx and the sesión 13b commit.`,
    );
  }
});

test("topbar toggle hides and re-shows the board pane", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Nuevo académico/i }).click();
  await page.getByRole("textbox", { name: "Título del ensayo" }).waitFor();
  // Board starts visible.
  await expect(page.locator(".tl-container")).toBeVisible();

  // Click "Ocultar tablero" — board disappears.
  await page.getByRole("button", { name: /Ocultar tablero/ }).click();
  await expect(page.locator(".tl-container")).toHaveCount(0);

  // Now the toggle is in "show" state — click again and the board comes back.
  await page.getByRole("button", { name: /Mostrar tablero/ }).click();
  await expect(page.locator(".tl-container")).toBeVisible();
});

test("reopening an essay does NOT auto-select a note (no rogue context panel)", async ({
  page,
}) => {
  // Create an essay, drop a sage note on the board (which will be
  // selected after creation by tldraw), close, reopen.
  await page.goto("/");
  await page.getByRole("button", { name: /Nuevo académico/i }).click();
  await page.getByRole("textbox", { name: "Título del ensayo" }).waitFor();
  await page.locator(".tl-container").first().waitFor({ state: "visible" });
  await page.waitForTimeout(250);

  // Create a note via the native flow.
  await page.keyboard.press("n");
  const canvas = page.locator(".tl-container").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not laid out");
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await page.keyboard.type("nota de prueba", { delay: 10 });
  await page.keyboard.press("Escape");

  // Now the note is selected → context panel ("Autor" group) visible.
  await expect(page.getByText(/^Autor$/i)).toBeVisible();

  // Save + close + reopen.
  await page.waitForTimeout(1200);
  await page.getByText(/^ensayos$/).click();
  await page.locator(".tiptap-content").waitFor({ state: "detached" });
  await page.getByRole("heading", { name: /Sin título/ }).click();
  await page.locator(".tl-container").first().waitFor({ state: "visible" });
  await page.waitForTimeout(400);

  // The context panel should NOT be visible on reopen.
  await expect(page.getByText(/^Autor$/i)).toHaveCount(0);
});

test("create essay → close → reopen from the list works without errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Nuevo académico/i }).click();
  await page.getByRole("textbox", { name: "Título del ensayo" }).waitFor();

  // Type something so the essay has content.
  await page.getByRole("textbox", { name: "Título del ensayo" }).click();
  await page.keyboard.type("Edmondson revisada", { delay: 5 });
  await page.locator(".tiptap-content").click();
  await page.keyboard.type("La seguridad psicológica es la creencia compartida.", {
    delay: 5,
  });
  await page.waitForTimeout(1200); // autosave debounce + flush

  // Back to the list.
  await page.getByText(/^ensayos$/).click();
  await expect(page.getByRole("heading", { name: /Tus/ })).toBeVisible();

  // The essay should be in the list. Click it to reopen.
  await page.getByRole("heading", { name: /Edmondson revisada/ }).click();

  // Editor view again, prefilled.
  await expect(
    page.getByRole("textbox", { name: "Título del ensayo" }),
  ).toHaveText("Edmondson revisada");
  await expect(page.locator(".tiptap-content")).toContainText(
    "La seguridad psicológica",
  );

  // Filter out the known benign "loadSnapshot failed; starting empty"
  // warning that fires when a fresh essay has no board snapshot yet.
  const real = errors.filter((e) => !/loadSnapshot/.test(e));
  if (real.length > 0) {
    throw new Error(`Console errors on reopen:\n${real.join("\n")}`);
  }
});

test("breadcrumb 'ensayos' returns to the list", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Nuevo académico/i }).click();
  await page.getByRole("textbox", { name: "Título del ensayo" }).waitFor();

  await page.getByText(/^ensayos$/).click();
  await expect(
    page.getByRole("heading", { name: /Tus/ }),
  ).toBeVisible();
});
