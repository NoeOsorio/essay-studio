import { test, expect } from "@playwright/test";
import { installTauriStub, openNewEssay } from "./setup";

/**
 * Pluma Roja — three sage critiques in parallel over the full essay
 * text, each producing JSON-lines anotaciones with severity + sugerencia.
 * The user picks which ones to apply, and applied anotaciones become
 * inline `.anno` marks in the TipTap content (click → popover).
 *
 * The setup stub returns deterministic citas pulled from the actual
 * text the renderer sent, so resolving them against the doc always
 * succeeds.
 */

const SAMPLE_BODY = [
  "El liderazgo del CEO determina la cultura. Cuando alguien tóxico ocupa",
  "esa silla la organización se contamina, porque la cultura emerge del",
  "ejemplo cotidiano. La solución es reemplazar a esa persona y entrenar a",
  "todos en confianza. En tres meses el efecto se vuelve medible: rituales",
  "de ágape sostienen seguridad sin que nadie mida nada en particular.",
].join(" ");

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

test("'Pluma roja' opens the overlay with three pase panels", async ({
  page,
}) => {
  await openNewEssay(page);

  // Type some essay text first — Pluma Roja runs over the doc.
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();

  await expect(
    page.getByRole("heading", { name: /Evaluar —/ }),
  ).toBeVisible();

  // Three pase panels, in order.
  await expect(page.getByTestId("pluma-pase-coherencia")).toBeVisible();
  await expect(page.getByTestId("pluma-pase-estilo")).toBeVisible();
  await expect(page.getByTestId("pluma-pase-argumento")).toBeVisible();
});

test("running the three passes yields 9 anotaciones with checkboxes", async ({
  page,
}) => {
  await openNewEssay(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();
  // These tests cover the original 3-pase semantics; disable APA so
  // the academico-mode default (4 panes) doesn't change the counts.
  await page.getByTestId("pluma-pase-toggle-apa").click();
  await page.getByTestId("pluma-start").click();

  // 3 panels × 3 anotaciones = 9 cards total.
  await expect(page.getByTestId("pluma-anotacion")).toHaveCount(9);
});

test("applying selected anotaciones adds inline annotation marks", async ({
  page,
}) => {
  await openNewEssay(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();
  // These tests cover the original 3-pase semantics; disable APA so
  // the academico-mode default (4 panes) doesn't change the counts.
  await page.getByTestId("pluma-pase-toggle-apa").click();
  await page.getByTestId("pluma-start").click();
  await expect(page.getByTestId("pluma-anotacion")).toHaveCount(9);

  await page.getByTestId("pluma-apply").click();

  // Overlay closes; the editor now has annotation marks (one per
  // applied anotación whose cita was found — should be all 9).
  await expect(page.getByRole("heading", { name: /Evaluar —/ })).toHaveCount(
    0,
  );
  await expect(editor.locator(".anno")).toHaveCount(9);
});

test("clicking an annotation opens the popover; descartar removes the mark", async ({
  page,
}) => {
  await openNewEssay(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();
  // These tests cover the original 3-pase semantics; disable APA so
  // the academico-mode default (4 panes) doesn't change the counts.
  await page.getByTestId("pluma-pase-toggle-apa").click();
  await page.getByTestId("pluma-start").click();
  await expect(page.getByTestId("pluma-anotacion")).toHaveCount(9);
  await page.getByTestId("pluma-apply").click();
  await expect(editor.locator(".anno")).toHaveCount(9);

  // Click the first inline anno; popover should open with its mensaje.
  await editor.locator(".anno").first().click();
  const popover = page.locator("[data-anno-popover]");
  await expect(popover).toBeVisible();
  // Stub messages incluyen "problema A/B/C — explicación pedagógica"
  // (sesión 15 los amplió para reflejar el contrato pedagógico nuevo).
  await expect(popover).toContainText(/problema [ABC]/);

  // Descartar removes the mark and closes the popover.
  await popover.getByRole("button", { name: /Descartar/ }).click();
  await expect(popover).toHaveCount(0);
  await expect(editor.locator(".anno")).toHaveCount(8);
});

test("unchecking anotaciones excludes them from apply", async ({ page }) => {
  await openNewEssay(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();
  // These tests cover the original 3-pase semantics; disable APA so
  // the academico-mode default (4 panes) doesn't change the counts.
  await page.getByTestId("pluma-pase-toggle-apa").click();
  await page.getByTestId("pluma-start").click();
  await expect(page.getByTestId("pluma-anotacion")).toHaveCount(9);

  // Uncheck the first three anotaciones across panes.
  const checkboxes = page.locator(
    "[data-testid=pluma-anotacion] input[type=checkbox]",
  );
  await checkboxes.nth(0).uncheck();
  await checkboxes.nth(3).uncheck();
  await checkboxes.nth(6).uncheck();

  await page.getByTestId("pluma-apply").click();
  await expect(editor.locator(".anno")).toHaveCount(6);
});
