import { test, expect, type Page } from "@playwright/test";
import {
  dumpCritiques,
  dumpEssays,
  installTauriStub,
  openNewEssay,
  openMore,
  runReview,
  openAllCorrections,
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

/** Close the rubric panel via its × button — also triggers flush. */
async function closeRubrica(page: Page) {
  await page.getByTestId("rubrica-overlay").getByRole("button", { name: "Cerrar" }).click();
  await expect(page.getByTestId("rubrica-overlay")).toHaveCount(0);
}

/** From the empty panel to the editable list: «Prefiero escribir» comes before `rubrica-add`. */
async function preferWriting(page: Page) {
  await page.getByRole("button", { name: "Prefiero escribir los criterios" }).click();
  await expect(page.getByTestId("rubrica-add")).toBeVisible();
}

/** Pastes text into the open panel, the way ⌘V does. */
async function pasteAssignment(page: Page, text: string) {
  await page.getByTestId("rubrica-overlay").evaluate((el, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

const ASSIGNMENT = [
  "Ensayo final del curso. Se evaluará:",
  "- Argumentación: una tesis clara defendida con razones 40%",
  "- Claridad: frases directas, sin jerga 20%",
  "- Uso de fuentes: cita con APA 40%",
].join("\n");

async function openRubricPanel(page: Page) {
  await openMore(page);
  await page.getByTestId("topbar-rubrica").click();
  await expect(page.getByTestId("rubrica-overlay")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

/** FR-010: inside every card each agent appears once. */
async function agentsAppearOncePerCard(page: Page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid="finding-card"]'));
    let parts = 0;
    const dup: string[] = [];
    for (const c of cards) {
      const names = Array.from(c.querySelectorAll('[data-testid="finding-part"]')).map(
        (p) => p.querySelector(".font-semibold")?.textContent ?? "",
      );
      parts += names.length;
      if (new Set(names).size !== names.length) dup.push(names.join(","));
    }
    return { parts, dup };
  });
}

test("Rúbrica button opens the editor and persists criterios", async ({
  page,
}) => {
  await openNewEssay(page);

  await openMore(page);

  await page.getByTestId("topbar-rubrica").click();
  await expect(page.getByTestId("rubrica-overlay")).toBeVisible();

  // Empty state first: paste or drop, with writing by hand as the second way.
  await expect(
    page.getByText("Pega la consigna de tu profesor o suelta el PDF"),
  ).toBeVisible();
  await expect(page.getByTestId("rubrica-zone")).toHaveAttribute(
    "data-drop-zone",
  );
  await preferWriting(page);

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
  // Weight is five dots: the fifth one is one click.
  await page.getByTestId("criterio-peso-5").nth(1).click();
  await expect(page.getByTestId("criterio-peso-5").nth(1)).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await expect(page.getByTestId("criterio-row")).toHaveCount(2);
  // No counter anywhere in the panel.
  await expect(page.getByTestId("rubrica-overlay")).not.toContainText(
    /\d+ criterios?/i,
  );

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
});

test("removing a criterio through its row menu persists", async ({ page }) => {
  await openNewEssay(page);

  await openRubricPanel(page);
  await preferWriting(page);
  await page.getByTestId("rubrica-add").click();
  await page.getByTestId("criterio-nombre").first().fill("Estructura");
  await page.getByTestId("rubrica-add").click();
  await page.getByTestId("criterio-nombre").nth(1).fill("Evidencia");

  // The menu is one dots button per row; Quitar lives inside it.
  await page.getByTestId("criterio-row").first().hover();
  await page.getByTestId("criterio-menu").first().click();
  await page.getByTestId("criterio-remove").click();
  await expect(page.getByTestId("criterio-row")).toHaveCount(1);
  // The nombre is in an <input value=...>, not in textContent — assert on the value.
  await expect(page.getByTestId("criterio-nombre")).toHaveValue("Evidencia");

  await closeRubrica(page);

  const essays = await dumpEssays(page);
  const rubrica = essays[0].rubrica as { criterios: unknown[] };
  expect(rubrica.criterios).toHaveLength(1);
});

test("APA check appears in academico mode and runs as a 4th check", async ({
  page,
}) => {
  await openNewEssay(page, "academico");

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();
  // APA is visible and on by default in academico.
  await expect(page.getByTestId("pluma-pase-toggle-apa")).toBeVisible();
  await expect(page.getByTestId("pluma-pase-toggle-apa")).toHaveAttribute(
    "data-active",
    "true",
  );

  await page.getByTestId("pluma-start").click();
  // 4 checks x 3 = 12 findings, underlined with no apply step. Underlines
  // may overlap and split into more spans, so count the listed findings.
  // The list shows one card per sentence, so the 12 are parts of fewer cards.
  await expect(editor.locator(".anno").first()).toBeVisible();
  await expect(page.getByTestId("pluma-overlay")).toHaveCount(0);
  await openAllCorrections(page);
  const seen = await agentsAppearOncePerCard(page);
  expect(seen.dup).toEqual([]);
  expect(seen.parts).toBeGreaterThan(0);
  expect(seen.parts).toBeLessThanOrEqual(12);
});

test("APA check is hidden in blog mode", async ({ page }) => {
  await openNewEssay(page, "blog");

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();
  await expect(page.getByTestId("pluma-pase-toggle-apa")).toHaveCount(0);
});

test("toggling APA off in academico turns it off", async ({ page }) => {
  await openNewEssay(page, "academico");

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();
  const apa = page.getByTestId("pluma-pase-toggle-apa");
  await expect(apa).toHaveAttribute("data-active", "true");

  await apa.click();
  await expect(apa).toHaveAttribute("data-active", "false");
});

test("rubrica is forwarded to each critique invocation", async ({ page }) => {
  await openNewEssay(page, "academico");

  // Set up a rubric first.
  await openRubricPanel(page);
  await preferWriting(page);
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

  await runReview(page);

  const critiques = await dumpCritiques(page);
  // Every pase that ran should have received the rubrica payload.
  for (const pase of ["coherencia", "estilo", "argumento", "apa"]) {
    expect(critiques[pase]).toBeDefined();
    expect(critiques[pase].rubrica).toHaveLength(1);
  }

  // The criterio shows on a card (the stub links the first finding of
  // each check to the first criterio).
  await openAllCorrections(page);
  await expect(page.getByTestId("finding-where").first()).toBeVisible();
  await expect(page.getByTestId("finding-where").first()).toContainText(
    "Estructura clara",
  );
});

test("a finding with criterioId shows its criterio in the popover", async ({
  page,
}) => {
  await openNewEssay(page, "academico");

  await openRubricPanel(page);
  await preferWriting(page);
  await page.getByTestId("rubrica-add").click();
  await page.getByTestId("criterio-nombre").first().fill("Coherencia interna");
  await closeRubrica(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await runReview(page);

  // The first cita per pase had criterioId set in the stub. Click one
  // .anno and look for the chip in the popover.
  await editor.locator(".anno").first().click();
  await expect(page.getByTestId("annotation-popover")).toBeVisible();
  // The popover shows the whole sentence card: the part with the criterion is one of its parts.
  const where = page
    .getByTestId("annotation-popover")
    .getByTestId("finding-where")
    .filter({ hasText: "Coherencia interna" });
  await expect(where.first()).toBeVisible();
});

test("a pasted assignment fills the rubric in one action and edits stay", async ({
  page,
}) => {
  await openNewEssay(page);
  await openRubricPanel(page);

  await pasteAssignment(page, ASSIGNMENT);
  await expect(page.getByTestId("criterio-row")).toHaveCount(3);
  await expect(page.getByTestId("criterio-nombre").nth(0)).toHaveValue(
    "Argumentación",
  );
  // Stated percentages map to the five dots: 40, 20 and 40 become 5, 3 and 5.
  await expect(page.getByTestId("criterio-peso-5").nth(0)).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByTestId("criterio-peso-3").nth(1)).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // A change stays.
  await page.getByTestId("criterio-nombre").nth(0).fill("Mi argumentación");
  await page.getByTestId("criterio-peso-1").nth(2).click();
  await closeRubrica(page);

  const essays = await dumpEssays(page);
  const rubrica = essays[0].rubrica as {
    criterios: { nombre: string; peso: number }[];
    consigna?: { texto: string };
  };
  expect(rubrica.criterios.map((c) => c.nombre)).toEqual([
    "Mi argumentación",
    "Claridad",
    "Uso de fuentes",
  ]);
  expect(rubrica.criterios[2].peso).toBe(1);
  expect(rubrica.consigna?.texto).toBe(ASSIGNMENT);
});

test("a new assignment over an existing rubric asks before replacing", async ({
  page,
}) => {
  await openNewEssay(page);
  await openRubricPanel(page);
  await pasteAssignment(page, ASSIGNMENT);
  await expect(page.getByTestId("criterio-row")).toHaveCount(3);
  await page.getByTestId("criterio-nombre").nth(0).fill("Mía");

  await pasteAssignment(page, "Otra consigna:\n- Tesis y argumento: defiende una postura");
  await expect(page.getByTestId("rubrica-proposal")).toBeVisible();
  await expect(
    page.getByText("Tu rúbrica actual queda guardada en Historial."),
  ).toBeVisible();

  // Dejar la mía: nothing changed.
  await page.getByRole("button", { name: "Dejar la mía" }).click();
  await expect(page.getByTestId("criterio-nombre").nth(0)).toHaveValue("Mía");
  await expect(page.getByTestId("criterio-row")).toHaveCount(3);

  // Usar esta: replaced, and the previous rubric is kept in Historial.
  await pasteAssignment(page, "Otra consigna:\n- Tesis y argumento: defiende una postura");
  await page.getByRole("button", { name: "Usar esta" }).click();
  await expect(page.getByTestId("criterio-row")).toHaveCount(1);
  await expect(page.getByTestId("criterio-nombre").first()).toHaveValue(
    "Tesis y argumento",
  );
});

test("an assignment with no criteria offers writing by hand", async ({
  page,
}) => {
  await openNewEssay(page);
  await openRubricPanel(page);
  await pasteAssignment(page, "Un texto sin lista de criterios.");
  await expect(
    page.getByText("No encontré criterios en este texto"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Escribir a mano" }).click();
  await expect(page.getByTestId("rubrica-add")).toBeVisible();
});

test("when the AI does not answer the assignment is kept and Reintentar is offered", async ({
  page,
}) => {
  await openNewEssay(page);
  await openRubricPanel(page);
  await pasteAssignment(page, "EXTRACT_FAIL\n- Argumentación: tesis clara");
  await expect(page.getByText("La IA no responde.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
  // No vendor or model name reaches the screen.
  await expect(page.getByTestId("rubrica-overlay")).not.toContainText(
    /claude|anthropic|openai|stub/i,
  );

  await closeRubrica(page);
  const essays = await dumpEssays(page);
  const rubrica = essays[0].rubrica as { consigna?: { texto: string } };
  expect(rubrica.consigna?.texto).toContain("EXTRACT_FAIL");
});
