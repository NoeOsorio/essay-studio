import { test, expect, type Page } from "@playwright/test";
import {
  installTauriStub,
  openNewEssay,
  openMore,
  runReview,
  openAllCorrections,
} from "./setup";
import { parseAnotaciones } from "../../src/lib/agents";

/**
 * "Reemplazar" click-to-apply coverage (originalmente "Aplicar
 * sugerencia" hasta sesión 15 — relabel para distinguir explicación
 * pedagógica del reemplazo literal).
 *
 * Both the inline popover (click an `.anno` in the editor) and the
 * Correcciones card expose "Usar este texto" when the finding carries
 * a proposed text. Click → the text under the mark
 * is replaced by the sugerencia, the mark is removed, the score
 * recomputes, and the editor remains in a sane state.
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

async function runEvaluarApply(page: Page) {
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);
  await runReview(page);
}

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

test("popover: 'Aplicar sugerencia' replaces the text and removes the mark", async ({
  page,
}) => {
  await openNewEssay(page);
  await runEvaluarApply(page);

  const editor = page.locator(".tiptap-content");
  const initialMarks = await editor.locator(".anno").count();
  expect(initialMarks).toBeGreaterThan(0);

  // Find the first anno that has a sugerencia (the stub sets sugerencia
  // on items A and C; B has none). Iterate until we find one with a
  // data-reemplazo attribute.
  const annos = editor.locator(".anno");
  let targetIndex = -1;
  for (let i = 0; i < initialMarks; i++) {
    const hasSug = await annos.nth(i).getAttribute("data-reemplazo");
    if (hasSug && hasSug.length > 0) {
      targetIndex = i;
      break;
    }
  }
  expect(targetIndex).toBeGreaterThanOrEqual(0);

  const target = annos.nth(targetIndex);
  const sugerencia = await target.getAttribute("data-reemplazo");
  expect(sugerencia).toBeTruthy();

  // Open the popover by clicking the mark.
  await target.click();
  const popover = page.getByTestId("annotation-popover");
  await expect(popover).toBeVisible();
  await expect(page.getByTestId("finding-use")).toBeVisible();

  // Click "Aplicar sugerencia".
  await page.getByTestId("finding-use").click();

  // Popover closes.
  await expect(popover).toHaveCount(0);
  // The applied finding's mark is gone. Only Citas APA offers text now, and
  // replacing its quote also removes other agents' marks on those words, so
  // the drop can be more than one.
  await expect.poll(() => editor.locator(".anno").count()).toBeLessThan(initialMarks);
  // The doc now contains the sugerencia text and no longer the original cita.
  const editorText = await editor.innerText();
  expect(editorText).toContain(sugerencia!);
  // We don't assert the original cita is gone because it may be a
  // substring of sugerencia or vice versa — but the .anno count drop
  // is the authoritative check.
});

test("popover: 'Aplicar' is hidden when the anotación has no sugerencia", async ({
  page,
}) => {
  await openNewEssay(page);
  await runEvaluarApply(page);

  const editor = page.locator(".tiptap-content");
  const annos = editor.locator(".anno");
  const count = await annos.count();
  let nopeIndex = -1;
  for (let i = 0; i < count; i++) {
    const hasSug = await annos.nth(i).getAttribute("data-reemplazo");
    if (!hasSug) {
      nopeIndex = i;
      break;
    }
  }
  // The stub guarantees at least one anotación without sugerencia
  // (item "B" — problema B detectado).
  expect(nopeIndex).toBeGreaterThanOrEqual(0);

  await annos.nth(nopeIndex).click();
  await expect(page.getByTestId("annotation-popover")).toBeVisible();
  // No Aplicar button — only Descartar.
  await expect(page.getByTestId("finding-use")).toHaveCount(0);
  await expect(page.getByTestId("finding-not-applicable")).toBeVisible();
});

test("Correcciones: 'Usar este texto' on a card replaces the text", async ({
  page,
}) => {
  await openNewEssay(page, "academico");
  await openMore(page);
  await page.getByTestId("topbar-rubrica").click();
  await page.getByRole("button", { name: "Prefiero escribir los criterios" }).click();
  await page.getByTestId("rubrica-add").click();
  await page.getByTestId("criterio-nombre").first().fill("Coherencia");
  await closeRubrica(page);

  await runEvaluarApply(page);

  const editor = page.locator(".tiptap-content");
  const initialMarks = await editor.locator(".anno").count();
  expect(initialMarks).toBeGreaterThan(0);

  await openAllCorrections(page);

  // First card with a proposed text (some cards have none).
  const useButtons = page.getByTestId("finding-use");
  await expect(useButtons.first()).toBeVisible();
  await useButtons.first().click();

  // The applied finding's mark is removed (others on the same words may go too).
  await expect.poll(() => editor.locator(".anno").count()).toBeLessThan(initialMarks);
});

test("after applying, the Scorebar overall recomputes", async ({ page }) => {
  await openNewEssay(page, "academico");
  await openMore(page);
  await page.getByTestId("topbar-rubrica").click();
  await page.getByRole("button", { name: "Prefiero escribir los criterios" }).click();
  await page.getByTestId("rubrica-add").click();
  await page.getByTestId("criterio-nombre").first().fill("Coherencia");
  await closeRubrica(page);

  await runEvaluarApply(page);

  const editor = page.locator(".tiptap-content");

  // Find a mark with sugerencia and click via popover.
  const annos = editor.locator(".anno");
  const count = await annos.count();
  let target = -1;
  for (let i = 0; i < count; i++) {
    if (await annos.nth(i).getAttribute("data-reemplazo")) {
      target = i;
      break;
    }
  }
  expect(target).toBeGreaterThanOrEqual(0);

  const overallBefore = await page
    .getByTestId("scorebar-overall")
    .innerText();

  await annos.nth(target).click();
  await page.getByTestId("finding-use").click();

  await expect(async () => {
    const after = await page.getByTestId("scorebar-overall").innerText();
    expect(after).not.toBe(overallBefore);
  }).toPass({ timeout: 2000 });
});

test("popover muestra 'Reemplazar por' como bloque literal separado del mensaje (sesión 15)", async ({
  page,
}) => {
  await openNewEssay(page);
  await runEvaluarApply(page);

  const editor = page.locator(".tiptap-content");
  const annos = editor.locator(".anno");
  let target = -1;
  const count = await annos.count();
  for (let i = 0; i < count; i++) {
    if (await annos.nth(i).getAttribute("data-reemplazo")) {
      target = i;
      break;
    }
  }
  expect(target).toBeGreaterThanOrEqual(0);

  await annos.nth(target).click();
  const popover = page.getByTestId("annotation-popover");
  await expect(popover).toBeVisible();

  // El mensaje y el reemplazo literal viven en bloques distintos.
  // The popover shows the whole sentence card: one part per agent, so scope to the first.
  await expect(popover.getByTestId("finding-mensaje").first()).toBeVisible();
  // El bloque del reemplazo tiene su propio testid y muestra el texto
  // entre comillas — comunica visualmente que es texto literal y no
  // advice del sabio.
  const reemplazo = popover.getByTestId("finding-replacement").first();
  await expect(reemplazo).toBeVisible();
  await expect(reemplazo).toContainText(/\(referencia\)/);

  // El botón actualizado lee "Reemplazar", no "Aplicar sugerencia".
  await expect(popover.getByTestId("finding-use").first()).toHaveText(/Usar este texto/);
});

test("parseAnotaciones strippea prefijos conversacionales como 'Reescribí:' (sesión 16)", async () => {
  // Probamos el parser en su forma pura, no a través del flow completo
  // de Evaluar. Esto pilla el caso del bug que Noé reportó: el modelo
  // a veces antepone "Reescribí:" o "Mejor:" al reemplazo, y la
  // sanitización defensiva tiene que quitarlo antes de exponerlo.
  const lines = [
    '{"cita":"x","severidad":"alta","mensaje":"d","reemplazo":"Reescribí: la cultura emerge"}',
    '{"cita":"y","severidad":"media","mensaje":"d","reemplazo":"Mejor así: una versión más concreta"}',
    '{"cita":"z","severidad":"baja","mensaje":"d","reemplazo":"un reemplazo sin prefijo"}',
    // Backward compat: anotación vieja con `sugerencia` (preserva
    // semantics + igual strippea el prefijo).
    '{"cita":"w","severidad":"alta","mensaje":"d","sugerencia":"Reformulá: contenido"}',
    // English prefix variant.
    '{"cita":"v","severidad":"media","mensaje":"d","reemplazo":"Rewrite: a cleaner sentence"}',
    // Stacked prefijos — la sanitización itera hasta 4 veces.
    '{"cita":"u","severidad":"alta","mensaje":"d","reemplazo":"Reescribí: Mejor: la versión limpia"}',
  ].join("\n");
  const out = parseAnotaciones(lines);
  expect(out[0]?.reemplazo).toBe("la cultura emerge");
  expect(out[1]?.reemplazo).toBe("una versión más concreta");
  expect(out[2]?.reemplazo).toBe("un reemplazo sin prefijo");
  expect(out[3]?.reemplazo).toBe("contenido");
  expect(out[4]?.reemplazo).toBe("a cleaner sentence");
  expect(out[5]?.reemplazo).toBe("la versión limpia");
});
