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

test("breadcrumb 'ensayos' returns to the list", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Nuevo académico/i }).click();
  await page.getByRole("textbox", { name: "Título del ensayo" }).waitFor();

  await page.getByText(/^ensayos$/).click();
  await expect(
    page.getByRole("heading", { name: /Tus/ }),
  ).toBeVisible();
});
