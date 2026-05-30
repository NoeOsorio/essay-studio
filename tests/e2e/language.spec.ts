import { test, expect, type Page } from "@playwright/test";
import {
  dumpCritiques,
  dumpEssays,
  dumpInterrogates,
  installTauriStub,
  openNewEssay,
} from "./setup";

/**
 * Language toggle (ES / EN) coverage. The toggle lives on the topbar
 * next to the mode pill; it persists per essay and forwards `language`
 * to every sage call so the council writes anotaciones / questions in
 * the chosen language.
 */

const SAMPLE_BODY = "El liderazgo del CEO determina la cultura.";

async function closeRubrica(page: Page) {
  await page.getByTestId("rubrica-overlay").getByTitle("Cerrar").click();
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
  await expect(page.getByTestId("topbar-language-es")).toHaveAttribute(
    "data-active",
    "true",
  );
  await expect(page.getByTestId("topbar-language-en")).toHaveAttribute(
    "data-active",
    "false",
  );

  // Toggle to EN.
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
  await page.getByTestId("topbar-language-en").click();

  // Open Lectura, run a council interrogation.
  await page.getByRole("button", { name: "Interrogar", exact: true }).click();
  await page
    .getByPlaceholder(/Pega aquí un fragmento, o sube un \.txt/)
    .fill("Some text in English to interrogate.");
  const overlay = page.locator("div.bg-paper-2", {
    has: page.getByRole("heading", { name: /Interrogatorio — el consejo/i }),
  });
  await overlay.getByRole("button", { name: /^Interrogar$/ }).click();
  // Wait for the streamed answers to settle.
  await expect(page.locator("input[type=checkbox]").first()).toBeVisible();

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
  await page.getByTestId("topbar-rubrica").click();
  await page.getByTestId("rubrica-add").click();
  await page.getByTestId("criterio-nombre").first().fill("Coherence");
  await closeRubrica(page);

  await page.getByTestId("topbar-language-en").click();

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();
  await page.getByTestId("pluma-start").click();
  await expect(page.getByTestId("pluma-anotacion").first()).toBeVisible();

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
  await page.getByTestId("topbar-language-en").click();
  await page.waitForTimeout(300);

  // Close and reopen — the language toggle should still reflect EN.
  await page
    .getByRole("button", { name: "Volver a la lista" })
    .click();
  await page
    .getByText("Sin título", { exact: false })
    .first()
    .click();
  await expect(page.getByTestId("topbar-language-en")).toHaveAttribute(
    "data-active",
    "true",
  );
});
