import { test, expect, type Page } from "@playwright/test";
import { dumpCritiques, dumpEssays, dumpInterrogates, installTauriStub, openNewEssay, openMore, hazmeButton, runReview, pickSource } from "./setup";

/**
 * Language toggle (ES / EN) coverage. The toggle lives on the topbar
 * next to the mode pill; it persists per essay and forwards `language`
 * to every sage call so the council writes anotaciones / questions in
 * the chosen language.
 */

const SAMPLE_BODY = "El liderazgo del CEO determina la cultura.";

async function closeRubrica(page: Page) {
  await page.getByTestId("rubrica-overlay").getByRole("button", { name: "Cerrar" }).click();
  await expect(page.getByTestId("rubrica-overlay")).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

test("language defaults to ES and toggling persists on the essay", async ({
  page,
}) => {
  await openNewEssay(page);
  // Default state: ES active.
  await openMore(page);
  await expect(page.getByTestId("topbar-language-es")).toHaveAttribute(
    "data-active",
    "true",
  );
  await expect(page.getByTestId("topbar-language-en")).toHaveAttribute(
    "data-active",
    "false",
  );

  // Toggle to EN.
  await openMore(page);
  await page.getByTestId("topbar-language-en").click();
  await expect(page.getByTestId("topbar-language-en")).toHaveAttribute(
    "data-active",
    "true",
  );
  // updateLanguage flushes immediately (like updateMode).
  await page.waitForTimeout(300);

  const essays = await dumpEssays(page);
  expect(essays).toHaveLength(1);
  // Cast since `language` is optional in EssayDump.
  const e = essays[0] as unknown as { language?: string };
  expect(e.language).toBe("en");
});

test("interrogate calls forward the chosen language", async ({ page }) => {
  await openNewEssay(page);
  await openMore(page);
  await page.getByTestId("topbar-language-en").click();

  // Open Hazme preguntas, pick a source, ask with the default agents.
  await hazmeButton(page).click();
  await pickSource(page, "Some text in English to interrogate.");
  await page.getByTestId("lectura-interrogar").click();
  // Wait for the questions to land on the board.
  await expect(page.locator('.tl-shape[data-shape-type="note"]')).toHaveCount(9);

  const interrogates = await dumpInterrogates(page);
  // Academico default sages: EM/SI/CR. Each should have been called
  // with language === "en".
  for (const sage of ["em", "sis", "cri"]) {
    expect(interrogates[sage]).toBeDefined();
    expect(interrogates[sage].language).toBe("en");
  }
});

test("critique calls forward the chosen language", async ({ page }) => {
  await openNewEssay(page, "academico");
  // Add a small rubric (not relevant to language but exercises the path).
  await openMore(page);
  await page.getByTestId("topbar-rubrica").click();
  await page.getByRole("button", { name: "Prefiero escribir los criterios" }).click();
  await page.getByTestId("rubrica-add").click();
  await page.getByTestId("criterio-nombre").first().fill("Coherence");
  await closeRubrica(page);

  await openMore(page);

  await page.getByTestId("topbar-language-en").click();

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await runReview(page);

  const critiques = await dumpCritiques(page);
  for (const pase of ["coherencia", "estilo", "argumento", "apa"]) {
    expect(critiques[pase]).toBeDefined();
    expect(critiques[pase].language).toBe("en");
  }
});

test("switching language persists across closing and reopening the essay", async ({
  page,
}) => {
  await openNewEssay(page);
  await openMore(page);
  await page.getByTestId("topbar-language-en").click();
  await page.waitForTimeout(300);

  // Close and reopen — the language toggle should still reflect EN.
  await page
    .getByRole("button", { name: "Ensayos" })
    .click();
  await page
    .getByText("Sin título", { exact: false })
    .first()
    .click();
  await openMore(page);
  await expect(page.getByTestId("topbar-language-en")).toHaveAttribute(
    "data-active",
    "true",
  );
});
