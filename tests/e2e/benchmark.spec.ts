import { test, expect, type Page } from "@playwright/test";
import {
  installTauriStub,
  openNewEssay,
  openMore,
  runReview,
  openReport,
  openAllCorrections,
  dismissAllCorrections,
} from "./setup";

/**
 * End-to-end coverage for the score stamp.
 *
 * Goal: prove the loop closes. A review puts findings in the text, the stamp
 * shows the score, the report card lists a row per criterion, Correcciones
 * lists the findings, and closing one with No aplica removes its underline
 * and moves the score.
 */

const SAMPLE_BODY = [
  "El liderazgo del CEO determina la cultura. Cuando alguien tóxico ocupa",
  "esa silla la organización se contamina, porque la cultura emerge del",
  "ejemplo cotidiano. La solución es reemplazar a esa persona y entrenar a",
  "todos en confianza. En tres meses el efecto se vuelve medible: rituales",
  "de ágape sostienen seguridad sin que nadie mida nada en particular.",
].join(" ");

async function closeRubrica(page: Page) {
  await page.getByTestId("rubrica-overlay").getByRole("button", { name: "Cerrar" }).click();
  await expect(page.getByTestId("rubrica-overlay")).toHaveCount(0);
}

async function addCriterio(page: Page, index: number, nombre: string) {
  // The empty panel offers the assignment first; writing by hand comes before the list.
  if (index === 0) await page.getByRole("button", { name: "Prefiero escribir los criterios" }).click();
  await page.getByTestId("rubrica-add").click();
  await page.getByTestId("criterio-nombre").nth(index).fill(nombre);
}

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

test("empty essay: no stamp (no fake 10/10, no placeholder)", async ({
  page,
}) => {
  await openNewEssay(page);
  await expect(page.getByTestId("scorebar")).toHaveCount(0);
});

test("essay with findings but no rúbrica: score and corrections, no criterion rows", async ({
  page,
}) => {
  await openNewEssay(page);
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await runReview(page);

  await expect(page.getByTestId("scorebar-overall")).not.toContainText("—");
  await openReport(page);
  await expect(page.locator('[data-testid^="scorebar-criterio-"]')).toHaveCount(0);
  await expect(page.getByTestId("stamp-all-corrections")).toBeVisible();

  await page.getByTestId("stamp-all-corrections").click();
  await expect(page.getByTestId("finding-card").first()).toBeVisible();
});

test("with rúbrica and a review, the report card has a row per criterio and a real score", async ({
  page,
}) => {
  await openNewEssay(page, "academico");

  await openMore(page);
  await page.getByTestId("topbar-rubrica").click();
  await addCriterio(page, 0, "Coherencia");
  await addCriterio(page, 1, "Evidencia");
  await closeRubrica(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);
  await runReview(page);

  await expect(page.getByTestId("scorebar-overall")).not.toContainText("—");

  await openReport(page);
  await expect(page.locator('[data-testid^="scorebar-criterio-"]')).toHaveCount(2);
});

test("a criterio row lists its findings; No aplica removes the mark and moves the score", async ({
  page,
}) => {
  await openNewEssay(page, "academico");

  await openMore(page);
  await page.getByTestId("topbar-rubrica").click();
  await addCriterio(page, 0, "Coherencia");
  await closeRubrica(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);
  await runReview(page);

  const initialMarks = await editor.locator(".anno").count();
  expect(initialMarks).toBeGreaterThan(0);

  await openReport(page);
  await page.locator('[data-testid^="scorebar-criterio-"]').first().click();
  await expect(page.getByTestId("corrections-panel")).toBeVisible();

  const cards = page.getByTestId("finding-card");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);

  const overallBefore = await page.getByTestId("scorebar-overall").innerText();

  await cards.first().getByTestId("finding-not-applicable").click();

  await expect(editor.locator(".anno")).toHaveCount(initialMarks - 1);

  await expect(async () => {
    const overallAfter = await page.getByTestId("scorebar-overall").innerText();
    expect(overallAfter).not.toBe(overallBefore);
  }).toPass({ timeout: 2000 });
});

test("selecting a correction flashes its mark in the text", async ({ page }) => {
  await openNewEssay(page, "academico");

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);
  await runReview(page);

  await openAllCorrections(page);
  await page.getByTestId("finding-mensaje").first().click();

  await expect(editor.locator(".anno.anno-flash").first()).toBeVisible({
    timeout: 1500,
  });
});

test("perfect-essay flow: closing every correction gives a real 10 (not an empty stamp)", async ({
  page,
}) => {
  // 10 means nothing is left to fix. After a full-coverage review (four
  // passes in academico) and closing every correction, the stamp reads 10.
  await openNewEssay(page, "academico");

  await openMore(page);
  await page.getByTestId("topbar-rubrica").click();
  await addCriterio(page, 0, "Coherencia");
  await closeRubrica(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);
  await runReview(page);

  expect(await editor.locator(".anno").count()).toBeGreaterThan(0);

  await openAllCorrections(page);
  await dismissAllCorrections(page);

  await expect(editor.locator(".anno")).toHaveCount(0);
  await expect(page.getByTestId("scorebar-overall")).toHaveText(/^\s*10\s*$/);
});

test("never-evaluated essay with content: no stamp (NOT a fake 10)", async ({
  page,
}) => {
  await openNewEssay(page, "academico");
  await page.locator(".tiptap-content").click();
  await page.keyboard.type("Texto cualquiera para que el ensayo no esté vacío.");

  // The honest signal (no fake 10/10) is kept by absence, not by a placeholder.
  await expect(page.getByTestId("scorebar")).toHaveCount(0);
});

test("partial coverage (3 of 4 checks) and clean: capped at 9, with an invitation to the missing check", async ({
  page,
}) => {
  await openNewEssay(page, "academico");

  await openMore(page);
  await page.getByTestId("topbar-rubrica").click();
  await addCriterio(page, 0, "Coherencia");
  await closeRubrica(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  // APA off: only 3 passes run.
  await runReview(page, { skip: ["apa"] });

  await openAllCorrections(page);
  await dismissAllCorrections(page);

  await expect(page.getByTestId("scorebar-overall")).toHaveText(/^\s*9\.0\s*$/);

  // The missing check is an invitation stating what the score could reach.
  await page.getByTestId("corrections-panel").getByLabel("Cerrar").first().click();
  await openReport(page);
  await expect(page.getByTestId("report-invite")).toBeVisible();
  await expect(page.getByTestId("report-invite")).toContainText("10");
});

test("editing the essay after a review surfaces the out-of-date stamp", async ({
  page,
}) => {
  await openNewEssay(page, "academico");

  await openMore(page);
  await page.getByTestId("topbar-rubrica").click();
  await addCriterio(page, 0, "Coherencia");
  await closeRubrica(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);
  await runReview(page);

  // Right after the review the text is what the reviewers read.
  await expect(page.getByTestId("scorebar-stale")).toHaveCount(0);

  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" añadiendo más texto.");
  await page.waitForTimeout(900);

  await expect(page.getByTestId("scorebar-stale")).toBeVisible();
});
