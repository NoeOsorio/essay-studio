import { test, expect, type Page } from "@playwright/test";
import {
  dumpCritiques,
  dumpEssays,
  installTauriStub,
  openNewEssay,
} from "./setup";

/**
 * Rubric editor + APA pasada coverage.
 *
 * The rubric lives on each essay; the council reads it whenever Pluma
 * Roja runs. APA is a fourth pasada that only appears in academico mode
 * and can be toggled off.
 */

const SAMPLE_BODY = [
  "El liderazgo del CEO determina la cultura. Cuando alguien tóxico ocupa",
  "esa silla la organización se contamina, porque la cultura emerge del",
  "ejemplo cotidiano. La solución es reemplazar a esa persona y entrenar a",
  "todos en confianza. En tres meses el efecto se vuelve medible: rituales",
  "de ágape sostienen seguridad sin que nadie mida nada en particular.",
].join(" ");

/** Close the rubric overlay via its × button — also triggers flush. */
async function closeRubrica(page: Page) {
  await page.getByTestId("rubrica-overlay").getByTitle("Cerrar").click();
  await expect(page.getByTestId("rubrica-overlay")).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

test("Rúbrica button opens the editor and persists criterios", async ({
  page,
}) => {
  await openNewEssay(page);

  await page.getByTestId("topbar-rubrica").click();
  await expect(page.getByTestId("rubrica-overlay")).toBeVisible();

  // Empty state visible first.
  await expect(page.getByText(/Sin criterios aún/i)).toBeVisible();

  // Add two criterios.
  await page.getByTestId("rubrica-add").click();
  await page
    .getByTestId("criterio-nombre")
    .first()
    .fill("Claridad del argumento");
  await page
    .getByTestId("criterio-descripcion")
    .first()
    .fill("La tesis se enuncia en los primeros tres párrafos.");

  await page.getByTestId("rubrica-add").click();
  await page
    .getByTestId("criterio-nombre")
    .nth(1)
    .fill("Calidad de la evidencia");
  await page.getByTestId("criterio-peso").nth(1).selectOption("5");

  // Closing the modal forces a flush — no debounce wait needed.
  await closeRubrica(page);

  const essays = await dumpEssays(page);
  expect(essays).toHaveLength(1);
  const rubrica = essays[0].rubrica as {
    criterios: { nombre: string; peso: number }[];
  };
  expect(rubrica.criterios).toHaveLength(2);
  expect(rubrica.criterios[0].nombre).toBe("Claridad del argumento");
  expect(rubrica.criterios[1].nombre).toBe("Calidad de la evidencia");
  expect(rubrica.criterios[1].peso).toBe(5);

  // Topbar button shows the count badge.
  await expect(page.getByTestId("topbar-rubrica")).toContainText("· 2");
});

test("removing a criterio updates the count and persists", async ({ page }) => {
  await openNewEssay(page);

  await page.getByTestId("topbar-rubrica").click();
  await page.getByTestId("rubrica-add").click();
  await page.getByTestId("criterio-nombre").first().fill("Estructura");
  await page.getByTestId("rubrica-add").click();
  await page.getByTestId("criterio-nombre").nth(1).fill("Evidencia");

  await page.getByTestId("criterio-remove").first().click();
  await expect(page.getByTestId("criterio-row")).toHaveCount(1);
  // The nombre is in an <input value=...>, not in textContent — assert on the value.
  await expect(page.getByTestId("criterio-nombre")).toHaveValue("Evidencia");

  await closeRubrica(page);

  const essays = await dumpEssays(page);
  const rubrica = essays[0].rubrica as { criterios: unknown[] };
  expect(rubrica.criterios).toHaveLength(1);
});

test("APA pasada appears in academico mode and runs as a 4th pane", async ({
  page,
}) => {
  await openNewEssay(page, "academico");

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();
  // APA toggle visible + ON by default in academico — now lives in
  // the pasada selector strip below the header.
  await expect(page.getByTestId("pluma-pase-toggle-apa")).toBeVisible();
  await expect(page.getByTestId("pluma-pase-toggle-apa")).toHaveAttribute(
    "data-active",
    "true",
  );

  // 4 panes present (incl. APA).
  await expect(page.getByTestId("pluma-pase-coherencia")).toBeVisible();
  await expect(page.getByTestId("pluma-pase-estilo")).toBeVisible();
  await expect(page.getByTestId("pluma-pase-argumento")).toBeVisible();
  await expect(page.getByTestId("pluma-pase-apa")).toBeVisible();

  await page.getByTestId("pluma-start").click();
  // 4 panes × 3 = 12 anotaciones.
  await expect(page.getByTestId("pluma-anotacion")).toHaveCount(12);
});

test("APA pasada is hidden in blog mode", async ({ page }) => {
  await openNewEssay(page, "blog");

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();
  await expect(page.getByTestId("pluma-pase-toggle-apa")).toHaveCount(0);
  await expect(page.getByTestId("pluma-pase-apa")).toHaveCount(0);
});

test("toggling APA off in academico hides the pase", async ({ page }) => {
  await openNewEssay(page, "academico");

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();
  await expect(page.getByTestId("pluma-pase-apa")).toBeVisible();

  // Click the pasada chip to toggle APA off.
  await page.getByTestId("pluma-pase-toggle-apa").click();
  await expect(page.getByTestId("pluma-pase-apa")).toHaveCount(0);
});

test("rubrica is forwarded to each critique invocation", async ({ page }) => {
  await openNewEssay(page, "academico");

  // Set up a rubric first.
  await page.getByTestId("topbar-rubrica").click();
  await page.getByTestId("rubrica-add").click();
  await page.getByTestId("criterio-nombre").first().fill("Estructura clara");
  await page
    .getByTestId("criterio-descripcion")
    .first()
    .fill("Una tesis explícita en los tres primeros párrafos.");
  await closeRubrica(page);

  // Type body, run Pluma Roja.
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();
  await page.getByTestId("pluma-start").click();
  await expect(page.getByTestId("pluma-anotacion").first()).toBeVisible();

  const critiques = await dumpCritiques(page);
  // Every pase that ran should have received the rubrica payload.
  for (const pase of ["coherencia", "estilo", "argumento", "apa"]) {
    expect(critiques[pase]).toBeDefined();
    expect(critiques[pase].rubrica?.criterios).toHaveLength(1);
  }

  // The criterio chip appears at least once in the panel (the stub
  // links the first anotación to the first criterio).
  await expect(page.getByTestId("anotacion-criterio").first()).toBeVisible();
  await expect(page.getByTestId("anotacion-criterio").first()).toContainText(
    "Estructura clara",
  );
});

test("applying an anotación with criterioId renders the chip in the popover", async ({
  page,
}) => {
  await openNewEssay(page, "academico");

  await page.getByTestId("topbar-rubrica").click();
  await page.getByTestId("rubrica-add").click();
  await page.getByTestId("criterio-nombre").first().fill("Coherencia interna");
  await closeRubrica(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();
  await page.getByTestId("pluma-start").click();
  await expect(page.getByTestId("pluma-anotacion").first()).toBeVisible();
  await page.getByTestId("pluma-apply").click();

  // The first cita per pase had criterioId set in the stub. Click one
  // .anno and look for the chip in the popover.
  await editor.locator(".anno").first().click();
  await expect(page.locator("[data-anno-popover]")).toBeVisible();
  await expect(page.getByTestId("popover-criterio-chip")).toBeVisible();
  await expect(page.getByTestId("popover-criterio-chip")).toContainText(
    "Coherencia interna",
  );
});
