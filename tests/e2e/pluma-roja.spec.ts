import { test, expect } from "@playwright/test";
import { installTauriStub, openNewEssay, runReview, openAllCorrections } from "./setup";

/**
 * Revisar ensayo: the agents review the full text in parallel, each
 * returning findings with severity and a proposed text. Findings land in
 * the text on their own as `.anno` marks (click opens the card) and are
 * all listed in Correcciones.
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

test("Revisar ensayo opens the panel with the agent options", async ({
  page,
}) => {
  await openNewEssay(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();

  await expect(page.getByText("¿Qué quieres que revisen?")).toBeVisible();

  // Academic essays offer the four checks, all on.
  for (const pase of ["coherencia", "estilo", "argumento", "apa"]) {
    const tile = page.getByTestId(`pluma-pase-toggle-${pase}`);
    await expect(tile).toBeVisible();
    await expect(tile).toHaveAttribute("data-active", "true");
  }
});

test("three checks yield 9 findings, underlined and listed", async ({
  page,
}) => {
  await openNewEssay(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  // These tests cover the original 3-check semantics; APA off.
  await runReview(page, { skip: ["apa"] });

  // 3 checks x 3 findings, in the text with no apply step.
  await expect(editor.locator(".anno")).toHaveCount(9);

  await openAllCorrections(page);
  await expect(page.getByTestId("finding")).toHaveCount(9);
});

test("clicking an annotation opens the popover; No aplica removes the mark", async ({
  page,
}) => {
  await openNewEssay(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await runReview(page, { skip: ["apa"] });
  await expect(editor.locator(".anno")).toHaveCount(9);

  // Click the first inline anno; popover should open with its mensaje.
  await editor.locator(".anno").first().click();
  const popover = page.getByTestId("annotation-popover");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText(/problema [ABC]/);

  // No aplica removes the mark and closes the popover.
  await popover.getByTestId("finding-not-applicable").click();
  await expect(popover).toHaveCount(0);
  await expect(editor.locator(".anno")).toHaveCount(8);
});
