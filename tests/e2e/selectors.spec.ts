import { test, expect } from "@playwright/test";
import { installTauriStub, openNewEssay } from "./setup";

/**
 * Sage selector (Lectura council mode) + pasada selector (Evaluar)
 * coverage. Defaults per essay mode + override + empty-state disable.
 *
 * Defaults:
 *  - Lectura council:
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
  await page.getByRole("button", { name: "Interrogar", exact: true }).click();

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
  await page.getByRole("button", { name: "Interrogar", exact: true }).click();

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

test("toggling a sage on then off updates panes count and persists choice", async ({
  page,
}) => {
  await openNewEssay(page, "academico");
  await page.getByRole("button", { name: "Interrogar", exact: true }).click();

  // Add Práctico (default off in academico) → 4 sages active.
  await page.getByTestId("lectura-sage-toggle-pra").click();
  await expect(page.getByTestId("lectura-sage-toggle-pra")).toHaveAttribute(
    "data-active",
    "true",
  );

  // Remove Empirista → 3 sages active (SI/PR/CR).
  await page.getByTestId("lectura-sage-toggle-em").click();
  await expect(page.getByTestId("lectura-sage-toggle-em")).toHaveAttribute(
    "data-active",
    "false",
  );

  // Fill source and run.
  await page
    .getByPlaceholder(/Pega aquí un fragmento, o sube un \.txt/)
    .fill("Texto de prueba.");
  const overlay = page.locator("div.bg-paper-2", {
    has: page.getByRole("heading", { name: /Interrogatorio — el consejo/i }),
  });
  await overlay.getByRole("button", { name: /^Interrogar$/ }).click();

  // 3 sages × 3 preguntas = 9 checkboxes.
  await expect(page.locator("input[type=checkbox]")).toHaveCount(9);
});

test("Lectura council with no sages selected disables 'Interrogar'", async ({
  page,
}) => {
  await openNewEssay(page, "academico");
  await page.getByRole("button", { name: "Interrogar", exact: true }).click();
  await page
    .getByPlaceholder(/Pega aquí un fragmento, o sube un \.txt/)
    .fill("Texto.");

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
  const selector = page.getByTestId("pluma-pase-selector");
  await expect(selector).toBeVisible();
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

test("Evaluar with all pasadas off disables 'Iniciar revisión'", async ({
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
  // Empty-state hint visible.
  await expect(
    page.getByText(/Selecciona al menos una pasada arriba/),
  ).toBeVisible();
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
  // 2 panes × 3 = 6 anotaciones.
  await expect(page.getByTestId("pluma-anotacion")).toHaveCount(6);
  // The skipped panels are not in the DOM.
  await expect(page.getByTestId("pluma-pase-argumento")).toHaveCount(0);
  await expect(page.getByTestId("pluma-pase-apa")).toHaveCount(0);
});
