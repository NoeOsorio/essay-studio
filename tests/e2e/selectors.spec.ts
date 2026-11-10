import { test, expect } from "@playwright/test";
import {
  installTauriStub,
  openNewEssay,
  hazmeButton,
  dumpCritiques,
  pickSource,
} from "./setup";

/**
 * Agent tiles (Hazme preguntas) + pasada selector (Evaluar)
 * coverage. Defaults per essay mode + override + empty-state disable.
 *
 * Defaults:
 *  - Hazme preguntas:
 *      academico → EM ✓ SI ✓ PR ✗ CR ✓
 *      blog      → EM ✗ SI ✓ PR ✓ CR ✓
 *  - Evaluar pasadas:
 *      academico → coherencia ✓ estilo ✓ argumento ✓ APA ✓
 *      blog      → coherencia ✓ estilo ✓ argumento ✓   (APA n/a)
 */

const SAMPLE_BODY = [
  "El liderazgo del CEO determina la cultura. Cuando alguien tóxico ocupa",
  "esa silla la organización se contamina, porque la cultura emerge del",
  "ejemplo cotidiano. La solución es reemplazar a esa persona y entrenar a",
  "todos en confianza. En tres meses el efecto se vuelve medible.",
].join(" ");

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

test("Lectura council in academico defaults to EM + SI + CR (no PR)", async ({
  page,
}) => {
  await openNewEssay(page, "academico");
  await hazmeButton(page).click();

  const selector = page.getByTestId("lectura-sage-selector");
  await expect(selector).toBeVisible();
  await expect(page.getByTestId("lectura-sage-toggle-em")).toHaveAttribute(
    "data-active",
    "true",
  );
  await expect(page.getByTestId("lectura-sage-toggle-sis")).toHaveAttribute(
    "data-active",
    "true",
  );
  await expect(page.getByTestId("lectura-sage-toggle-cri")).toHaveAttribute(
    "data-active",
    "true",
  );
  await expect(page.getByTestId("lectura-sage-toggle-pra")).toHaveAttribute(
    "data-active",
    "false",
  );
});

test("Lectura council in blog defaults to SI + PR + CR (no EM)", async ({
  page,
}) => {
  await openNewEssay(page, "blog");
  await hazmeButton(page).click();

  await expect(page.getByTestId("lectura-sage-toggle-em")).toHaveAttribute(
    "data-active",
    "false",
  );
  await expect(page.getByTestId("lectura-sage-toggle-sis")).toHaveAttribute(
    "data-active",
    "true",
  );
  await expect(page.getByTestId("lectura-sage-toggle-pra")).toHaveAttribute(
    "data-active",
    "true",
  );
  await expect(page.getByTestId("lectura-sage-toggle-cri")).toHaveAttribute(
    "data-active",
    "true",
  );
});

test("toggling a sage on then off changes who asks and how many notes land", async ({
  page,
}) => {
  await openNewEssay(page, "academico");
  await hazmeButton(page).click();

  // Add Práctica (default off in academico), remove Evidencia: SI, PR, CR.
  await page.getByTestId("lectura-sage-toggle-pra").click();
  await expect(page.getByTestId("lectura-sage-toggle-pra")).toHaveAttribute(
    "data-active",
    "true",
  );
  await page.getByTestId("lectura-sage-toggle-em").click();
  await expect(page.getByTestId("lectura-sage-toggle-em")).toHaveAttribute(
    "data-active",
    "false",
  );

  await pickSource(page, "Texto de prueba.");
  await page.getByTestId("lectura-interrogar").click();

  // 3 agents x 3 questions = 9 notes.
  await expect(page.locator('.tl-shape[data-shape-type="note"]')).toHaveCount(9);
});

test("Preguntar is disabled without a source and with no agent on", async ({
  page,
}) => {
  await openNewEssay(page, "academico");
  await hazmeButton(page).click();

  // No source yet.
  await expect(page.getByTestId("lectura-interrogar")).toBeDisabled();

  await pickSource(page, "Texto.");
  await expect(page.getByTestId("lectura-interrogar")).toBeEnabled();

  // Turn off all 3 academic defaults.
  await page.getByTestId("lectura-sage-toggle-em").click();
  await page.getByTestId("lectura-sage-toggle-sis").click();
  await page.getByTestId("lectura-sage-toggle-cri").click();

  await expect(page.getByTestId("lectura-interrogar")).toBeDisabled();
});

test("Evaluar in academico defaults all 4 pasadas (incl. APA)", async ({
  page,
}) => {
  await openNewEssay(page, "academico");
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();
  for (const pase of ["coherencia", "estilo", "argumento", "apa"]) {
    await expect(
      page.getByTestId(`pluma-pase-toggle-${pase}`),
    ).toHaveAttribute("data-active", "true");
  }
});

test("Evaluar in blog hides APA and defaults only 3 pasadas", async ({
  page,
}) => {
  await openNewEssay(page, "blog");
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();
  await expect(page.getByTestId("pluma-pase-toggle-apa")).toHaveCount(0);
  for (const pase of ["coherencia", "estilo", "argumento"]) {
    await expect(
      page.getByTestId(`pluma-pase-toggle-${pase}`),
    ).toHaveAttribute("data-active", "true");
  }
});

test("Evaluar with all pasadas off disables 'Revisar'", async ({
  page,
}) => {
  await openNewEssay(page, "academico");
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();

  // Turn off all 4 pasadas.
  for (const pase of ["coherencia", "estilo", "argumento", "apa"]) {
    await page.getByTestId(`pluma-pase-toggle-${pase}`).click();
  }

  await expect(page.getByTestId("pluma-start")).toBeDisabled();
});

test("Evaluar with only 2 pasadas runs them and skips the rest", async ({
  page,
}) => {
  await openNewEssay(page, "academico");
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();

  // Drop APA + Argumento → leaves Coherencia + Estilo.
  await page.getByTestId("pluma-pase-toggle-apa").click();
  await page.getByTestId("pluma-pase-toggle-argumento").click();

  await page.getByTestId("pluma-start").click();
  // 2 checks x 3 = 6 findings, underlined.
  await expect(page.locator(".tiptap-content .anno")).toHaveCount(6);
  // The skipped checks were never sent.
  const critiques = await dumpCritiques(page);
  expect(Object.keys(critiques).sort()).toEqual(["coherencia", "estilo"]);
});
