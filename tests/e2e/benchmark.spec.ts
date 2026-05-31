import { test, expect, type Page } from "@playwright/test";
import { installTauriStub, openNewEssay } from "./setup";

/**
 * End-to-end coverage for the Benchmark Scorebar.
 *
 * Goal: prove the loop closes — Evaluar populates the doc with
 * anotaciones → Scorebar recomputes → click a ring drilldown lists the
 * anotaciones → Descartar removes the mark → Scorebar recovers.
 */

const SAMPLE_BODY = [
  "El liderazgo del CEO determina la cultura. Cuando alguien tóxico ocupa",
  "esa silla la organización se contamina, porque la cultura emerge del",
  "ejemplo cotidiano. La solución es reemplazar a esa persona y entrenar a",
  "todos en confianza. En tres meses el efecto se vuelve medible: rituales",
  "de ágape sostienen seguridad sin que nadie mida nada en particular.",
].join(" ");

async function closeRubrica(page: Page) {
  await page.getByTestId("rubrica-overlay").getByTitle("Cerrar").click();
  await expect(page.getByTestId("rubrica-overlay")).toHaveCount(0);
}

async function addCriterio(page: Page, index: number, nombre: string) {
  await page.getByTestId("rubrica-add").click();
  await page.getByTestId("criterio-nombre").nth(index).fill(nombre);
}

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

test("empty essay: Scorebar is hidden (no fake 10/10, no '—' placeholder)", async ({
  page,
}) => {
  // Sesión 13b decision: instead of showing a "—" placeholder Scorebar
  // for unevaluated essays, hide the bar entirely. Empty placeholder
  // wasted vertical space and the dashed "DE 10" ring looked like a
  // broken state. Once Evaluar runs, the bar appears — covered by the
  // sibling tests below. Lo único que sigue invariante: NUNCA fake 10/10.
  await openNewEssay(page);
  await expect(page.getByTestId("scorebar")).toHaveCount(0);
});

test("essay with anotaciones but no rúbrica → overall ring + nudge to define rúbrica", async ({
  page,
}) => {
  await openNewEssay(page);
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  // Run Evaluar without a rúbrica → anotaciones come through but the
  // sage can't tag them to any criterio.
  await page.getByTestId("topbar-pluma-roja").click();
  await page.getByTestId("pluma-start").click();
  await expect(page.getByTestId("pluma-anotacion").first()).toBeVisible();
  await page.getByTestId("pluma-apply").click();

  await expect(page.getByTestId("scorebar-overall")).not.toContainText("—");
  await expect(page.getByText(/Define una/)).toBeVisible();
  await expect(page.getByText(/rúbrica/)).toBeVisible();
});

test("with rúbrica + Evaluar, Scorebar shows per-criterio rings and a real overall", async ({
  page,
}) => {
  await openNewEssay(page, "academico");

  // Seed a rúbrica.
  await page.getByTestId("topbar-rubrica").click();
  await addCriterio(page, 0, "Coherencia");
  await addCriterio(page, 1, "Evidencia");
  await closeRubrica(page);

  // Body + run Evaluar.
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);
  await page.getByTestId("topbar-pluma-roja").click();
  await page.getByTestId("pluma-start").click();
  await expect(page.getByTestId("pluma-anotacion").first()).toBeVisible();
  await page.getByTestId("pluma-apply").click();

  // Overall must be a number, not "—".
  await expect(page.getByTestId("scorebar-overall")).not.toContainText("—");

  // Two rings present (one per criterio in the rubrica).
  const criterioRings = page.locator('[data-testid^="scorebar-criterio-"]');
  await expect(criterioRings).toHaveCount(2);
});

test("clicking a criterio ring opens drilldown; Descartar removes the mark and updates the score", async ({
  page,
}) => {
  await openNewEssay(page, "academico");

  await page.getByTestId("topbar-rubrica").click();
  await addCriterio(page, 0, "Coherencia");
  await closeRubrica(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);
  await page.getByTestId("topbar-pluma-roja").click();
  await page.getByTestId("pluma-start").click();
  await expect(page.getByTestId("pluma-anotacion").first()).toBeVisible();
  await page.getByTestId("pluma-apply").click();

  // Anotaciones in the doc (one criterioId per pase, linked to first criterio).
  const initialMarks = await editor.locator(".anno").count();
  expect(initialMarks).toBeGreaterThan(0);

  // Drilldown: click the General ring (the one that aggregates orphans —
  // in academico with one criterio "Coherencia", most anotaciones land
  // in "general" because the stub only links one anotación per pase).
  const generalRing = page.getByTestId("scorebar-general");
  if (await generalRing.count() > 0) {
    await generalRing.click();
  } else {
    // Fallback: click the criterio ring instead.
    await page.locator('[data-testid^="scorebar-criterio-"]').first().click();
  }
  await expect(page.getByTestId("benchmark-drilldown")).toBeVisible();

  // At least one anotación card visible.
  const cards = page.getByTestId("drilldown-anotacion");
  await expect(cards.first()).toBeVisible();
  const cardCount = await cards.count();
  expect(cardCount).toBeGreaterThan(0);

  // Capture the score number before Descartar.
  const overallBefore = await page
    .getByTestId("scorebar-overall")
    .innerText();

  // Descartar one anotación.
  await cards
    .first()
    .getByTestId("drilldown-dismiss")
    .click();

  // The mark gets removed from the doc.
  await expect(editor.locator(".anno")).toHaveCount(initialMarks - 1);

  // The score updates. We don't assert a specific number (depends on
  // which one was dismissed), only that the displayed score changed.
  await expect(async () => {
    const overallAfter = await page
      .getByTestId("scorebar-overall")
      .innerText();
    expect(overallAfter).not.toBe(overallBefore);
  }).toPass({ timeout: 2000 });
});

test("clicking an anotación in the drilldown adds the flash class to its mark", async ({
  page,
}) => {
  await openNewEssay(page, "academico");

  await page.getByTestId("topbar-rubrica").click();
  await addCriterio(page, 0, "Coherencia");
  await closeRubrica(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);
  await page.getByTestId("topbar-pluma-roja").click();
  await page.getByTestId("pluma-start").click();
  await expect(page.getByTestId("pluma-anotacion").first()).toBeVisible();
  await page.getByTestId("pluma-apply").click();

  // Open whichever ring is present.
  const generalRing = page.getByTestId("scorebar-general");
  const ringToClick =
    (await generalRing.count()) > 0
      ? generalRing
      : page.locator('[data-testid^="scorebar-criterio-"]').first();
  await ringToClick.click();

  await page
    .getByTestId("drilldown-anotacion")
    .first()
    .click();

  // The matching mark should have the flash class while the animation
  // is running (animation is 1.6s; assertion runs much sooner).
  await expect(editor.locator(".anno.anno-flash").first()).toBeVisible({
    timeout: 1500,
  });
});

test("perfect-essay flow: Descartar everything → real 10.0 (NOT '—')", async ({
  page,
}) => {
  // The semantic the user asked for: "10/10 = nothing left to fix".
  // After running Evaluar (full coverage in academico = 4 pasadas)
  // and then dismissing every anotación, the score should be 10.0 —
  // not the empty state. The empty state is reserved for "never ran
  // Evaluar"; here the council DID run, and the user resolved
  // everything.
  await openNewEssay(page, "academico");

  await page.getByTestId("topbar-rubrica").click();
  await addCriterio(page, 0, "Coherencia");
  await closeRubrica(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);
  await page.getByTestId("topbar-pluma-roja").click();
  await page.getByTestId("pluma-start").click();
  await expect(page.getByTestId("pluma-anotacion").first()).toBeVisible();
  await page.getByTestId("pluma-apply").click();

  const initialMarks = await editor.locator(".anno").count();
  expect(initialMarks).toBeGreaterThan(0);

  // Dismiss every anotación via the drilldown(s).
  while ((await editor.locator(".anno").count()) > 0) {
    const open = page.getByTestId("benchmark-drilldown");
    if (await open.count() > 0) {
      await open.getByTitle("Cerrar").click();
      await expect(open).toHaveCount(0);
    }
    const general = page.getByTestId("scorebar-general");
    const criterio = page.locator('[data-testid^="scorebar-criterio-"]');
    const ring =
      (await general.count()) > 0 ? general.first() : criterio.first();
    await ring.click();
    const cards = page.getByTestId("drilldown-anotacion");
    while ((await cards.count()) > 0) {
      await cards.first().getByTestId("drilldown-dismiss").click();
    }
  }

  // The "Sin pendientes" perfect state.
  await expect(page.getByTestId("scorebar-overall")).toContainText("10.0");
  await expect(page.getByText(/Sin pendientes/)).toBeVisible();
});

test("never-evaluated essay with content: Scorebar still hidden (NOT a fake 10.0)", async ({
  page,
}) => {
  await openNewEssay(page, "academico");
  // Type some content but never run Evaluar.
  await page.locator(".tiptap-content").click();
  await page.keyboard.type("Texto cualquiera para que el ensayo no esté vacío.");

  // Sesión 13b: bar stays hidden until the user actually evaluates.
  // The honest signal (no fake 10/10) is preserved by absence, not
  // by a placeholder.
  await expect(page.getByTestId("scorebar")).toHaveCount(0);
});

test("partial coverage Evaluar (3 of 4 pasadas) + clean → caps at 9.0, NOT 10.0", async ({
  page,
}) => {
  await openNewEssay(page, "academico");

  // Add a rubric so per-criterio rings show too.
  await page.getByTestId("topbar-rubrica").click();
  await addCriterio(page, 0, "Coherencia");
  await closeRubrica(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();
  // Turn APA off → only 3 pasadas will run.
  await page.getByTestId("pluma-pase-toggle-apa").click();
  await page.getByTestId("pluma-start").click();
  await expect(page.getByTestId("pluma-anotacion").first()).toBeVisible();
  await page.getByTestId("pluma-apply").click();

  // Dismiss every anotación.
  while ((await editor.locator(".anno").count()) > 0) {
    const open = page.getByTestId("benchmark-drilldown");
    if (await open.count() > 0) {
      await open.getByTitle("Cerrar").click();
    }
    const general = page.getByTestId("scorebar-general");
    const criterio = page.locator('[data-testid^="scorebar-criterio-"]');
    const ring =
      (await general.count()) > 0 ? general.first() : criterio.first();
    await ring.click();
    const cards = page.getByTestId("drilldown-anotacion");
    while ((await cards.count()) > 0) {
      await cards.first().getByTestId("drilldown-dismiss").click();
    }
  }

  // Clean, but only 3/4 pasadas ran → capped at 9.0 (coverage penalty).
  await expect(page.getByTestId("scorebar-overall")).toContainText("9.0");
  await expect(page.getByTestId("scorebar-coverage")).toBeVisible();
  await expect(page.getByTestId("scorebar-coverage")).toContainText("3/4");
});

test("editing the essay after Evaluar surfaces the 'stale' indicator", async ({
  page,
}) => {
  await openNewEssay(page, "academico");

  await page.getByTestId("topbar-rubrica").click();
  await addCriterio(page, 0, "Coherencia");
  await closeRubrica(page);

  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);
  await page.getByTestId("topbar-pluma-roja").click();
  await page.getByTestId("pluma-start").click();
  await expect(page.getByTestId("pluma-anotacion").first()).toBeVisible();
  await page.getByTestId("pluma-apply").click();

  // No stale indicator right after apply (evaluadoEn == updatedAt).
  await expect(page.getByTestId("scorebar-stale")).toHaveCount(0);

  // Edit the essay — type more content. The store updates
  // updatedAt → stale indicator surfaces.
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" — añadiendo más texto.");
  // Small delay for the autosave debounce to settle.
  await page.waitForTimeout(900);

  await expect(page.getByTestId("scorebar-stale")).toBeVisible();
});
