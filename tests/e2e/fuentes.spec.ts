import { test, expect, type Page } from "@playwright/test";
import { dumpCritiques, dumpEssays, installTauriStub, openNewEssay, openMore, hazmeButton, runReview, pickSource } from "./setup";

/**
 * Fuentes (sources library) coverage.
 *
 * The library lives on the essay (essay.fuentes[]). Two consumers:
 *  - Hazme preguntas: source rows to pick from + upload
 *    auto-saves into the library
 *  - Pluma Roja: every saved fuente is forwarded to each critique
 *    invocation so the council reads with context.
 */

const SAMPLE_BODY = [
  "El liderazgo del CEO determina la cultura. Cuando alguien tóxico ocupa",
  "esa silla la organización se contamina, porque la cultura emerge del",
  "ejemplo cotidiano. La solución es reemplazar a esa persona y entrenar a",
  "todos en confianza. En tres meses el efecto se vuelve medible: rituales",
  "de ágape sostienen seguridad sin que nadie mida nada en particular.",
].join(" ");

async function closeFuentes(page: Page) {
  await page.getByTestId("fuentes-close").click();
  await expect(page.getByTestId("fuentes-overlay")).toHaveCount(0);
}

/**
 * Pasting is how text becomes a source. The stub reads a citation from lines
 * like `Title:`, `Author: Surname, Names` and `Year:`, so a source can arrive
 * with its title already filled in, the way a real reading would.
 */
async function pasteSource(page: Page, text: string) {
  await page.getByTestId("fuentes-overlay").evaluate((el, body) => {
    const data = new DataTransfer();
    data.setData("text/plain", body);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

const cited = (title: string, body: string, author = "Edmondson, Amy", year = "1999") =>
  `Title: ${title}\nAuthor: ${author}\nYear: ${year}\n\n${body}`;

/** Waits until no row is still being read. */
async function settled(page: Page) {
  await expect(page.locator('[data-testid="fuente-row"][data-reading="true"]')).toHaveCount(0);
}

/** Opens a source from its row: the name, reference and text are edited there. */
async function openRow(page: Page, index: number) {
  await page.getByTestId("fuente-row").nth(index).click();
  await expect(page.getByTestId("fuente-nombre")).toBeVisible();
}

/** Puts two sources into the library by pasting them. */
async function seedTwo(page: Page, a: [string, string], b: [string, string]) {
  await openMore(page);
  await page.getByTestId("topbar-fuentes").click();
  await pasteSource(page, cited(a[0], a[1]));
  await settled(page);
  await pasteSource(page, cited(b[0], b[1], "Sapolsky, Robert", "2017"));
  await settled(page);
  await expect(page.getByTestId("fuente-row")).toHaveCount(2);
  await closeFuentes(page);
}

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

test("Fuentes opens empty, takes pasted text and the open view edits it", async ({
  page,
}) => {
  await openNewEssay(page);

  await openMore(page);

  await page.getByTestId("topbar-fuentes").click();
  await expect(page.getByTestId("fuentes-overlay")).toBeVisible();
  await expect(page.getByTestId("fuentes-empty")).toBeVisible();
  await expect(page.getByText("Suelta PDFs o archivos, o pega el texto")).toBeVisible();

  await pasteSource(page, "Texto íntegro del estudio sobre seguridad psicológica.");
  await expect(page.getByTestId("fuente-row")).toHaveCount(1);
  await settled(page);

  await openRow(page, 0);
  await page.getByTestId("fuente-nombre").fill("Edmondson 1999");
  await page.getByTestId("fuente-cita").fill("Edmondson, A. (1999). Psychological safety…");
  await page.getByTestId("fuente-contenido").fill("Texto íntegro del estudio sobre seguridad psicológica.");

  await closeFuentes(page);

  const essays = await dumpEssays(page);
  const fuentes = essays[0].fuentes as Array<{
    nombre: string;
    cita?: string;
    contenido: string;
    origen: string;
  }>;
  expect(fuentes).toHaveLength(1);
  expect(fuentes[0].nombre).toBe("Edmondson 1999");
  expect(fuentes[0].cita).toBe("Edmondson, A. (1999). Psychological safety…");
  expect(fuentes[0].origen).toBe("texto");
});

test("uploading a .txt file in Fuentes saves it to the library", async ({
  page,
}) => {
  await openNewEssay(page);
  await openMore(page);
  await page.getByTestId("topbar-fuentes").click();

  await page.getByTestId("fuentes-file-input").setInputFiles({
    name: "notas-sapolsky.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Sapolsky argumenta que el comportamiento es siempre biológico-cultural.",
    ),
  });

  await expect(page.getByTestId("fuente-row")).toHaveCount(1);
  await settled(page);
  await openRow(page, 0);
  await expect(page.getByTestId("fuente-nombre")).toHaveValue("notas-sapolsky");

  await closeFuentes(page);

  const essays = await dumpEssays(page);
  const fuentes = essays[0].fuentes as Array<{
    nombre: string;
    contenido: string;
    origen: string;
    archivoNombre?: string;
  }>;
  expect(fuentes).toHaveLength(1);
  expect(fuentes[0].origen).toBe("archivo");
  expect(fuentes[0].archivoNombre).toBe("notas-sapolsky.txt");
  expect(fuentes[0].contenido).toContain("Sapolsky");
});

test("a PDF without text shows one short message and saves nothing", async ({
  page,
}) => {
  await openNewEssay(page);
  await openMore(page);
  await page.getByTestId("topbar-fuentes").click();

  await page.getByTestId("fuentes-file-input").setInputFiles({
    name: "escaneado.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-scan\n"),
  });

  await expect(page.getByTestId("fuentes-notice")).toContainText("Este PDF no tiene texto");
  await expect(page.getByTestId("fuente-row")).toHaveCount(0);
  const essays = await dumpEssays(page);
  expect((essays[0].fuentes as unknown[] | undefined)?.length ?? 0).toBe(0);
});

test("the same text dropped twice offers the source already saved", async ({
  page,
}) => {
  await openNewEssay(page);
  await openMore(page);
  await page.getByTestId("topbar-fuentes").click();

  const body = cited("Safety", "Un texto que ya está guardado.");
  await pasteSource(page, body);
  await settled(page);
  await pasteSource(page, body);

  await expect(page.getByTestId("fuentes-notice")).toContainText("Ya tienes esta fuente");
  await expect(page.getByTestId("fuente-row")).toHaveCount(1);
});

test("removing a fuente through the row menu persists and can be undone", async ({ page }) => {
  await openNewEssay(page);
  await openMore(page);
  await page.getByTestId("topbar-fuentes").click();
  await pasteSource(page, cited("Uno", "Primer texto."));
  await settled(page);
  await pasteSource(page, cited("Dos", "Segundo texto.", "Sapolsky, Robert", "2017"));
  await settled(page);
  await expect(page.getByTestId("fuente-row")).toHaveCount(2);

  const first = page.getByTestId("fuente-row").first();
  await first.hover();
  await first.getByTestId("fuente-more").click();
  await page.getByTestId("fuente-remove").click();
  await expect(page.getByTestId("fuente-row")).toHaveCount(1);
  await expect(page.getByTestId("fuente-row")).toContainText("Dos");

  // The removal can be taken back.
  await page.getByTestId("fuente-undo").click();
  await expect(page.getByTestId("fuente-row")).toHaveCount(2);

  // Removed again, and left removed.
  const again = page.getByTestId("fuente-row").first();
  await again.hover();
  await again.getByTestId("fuente-more").click();
  await page.getByTestId("fuente-remove").click();
  await expect(page.getByTestId("fuente-row")).toHaveCount(1);

  await closeFuentes(page);

  const essays = await dumpEssays(page);
  expect(
    (essays[0].fuentes as unknown[] | undefined)?.length ?? 0,
  ).toBe(1);
});

test("search narrows the list and says so when nothing matches", async ({ page }) => {
  await openNewEssay(page);
  await seedTwo(page, ["Safety at work", "Primer texto."], ["Behave", "Segundo texto."]);
  await openMore(page);
  await page.getByTestId("topbar-fuentes").click();

  await page.getByTestId("fuentes-search").fill("sapolsky");
  await expect(page.getByTestId("fuente-row")).toHaveCount(1);
  await expect(page.getByTestId("fuente-row")).toContainText("Behave");

  await page.getByTestId("fuentes-search").fill("hermenéutica");
  await expect(page.getByTestId("fuente-row")).toHaveCount(0);
  await expect(page.getByText("Nada con «hermenéutica»")).toBeVisible();
});

test("Hazme preguntas lists the saved sources and picking one selects it", async ({
  page,
}) => {
  await openNewEssay(page);

  // Set up two fuentes first.
  await seedTwo(
    page,
    ["Edmondson 1999", "CONTENIDO DE EDMONDSON: la seguridad psicológica predice el aprendizaje del equipo."],
    ["Sapolsky 2017", "CONTENIDO DE SAPOLSKY: behave es un libro denso sobre el cerebro y la conducta."],
  );

  // Open Lectura.
  await hazmeButton(page).click();
  await expect(page.getByTestId("lectura-fuente-chips")).toBeVisible();
  const chips = page.getByTestId("lectura-fuente-chip");
  await expect(chips).toHaveCount(2);

  // No source is chosen until one is picked.
  await expect(page.getByTestId("lectura-interrogar")).toBeDisabled();

  // Pick the first row: it is selected and Preguntar opens up.
  await chips.first().click();
  await expect(chips.first()).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("lectura-interrogar")).toBeEnabled();

  // Pick the second: the selection moves.
  await chips.nth(1).click();
  await expect(chips.nth(1)).toHaveAttribute("data-active", "true");
  await expect(chips.first()).toHaveAttribute("data-active", "false");
});

test("uploading a .txt in Hazme preguntas saves it and selects it", async ({
  page,
}) => {
  await openNewEssay(page);

  await hazmeButton(page).click();

  await page.getByTestId("lectura-file-input").setInputFiles({
    name: "fuente-rapida.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Contenido pegado desde Lectura."),
  });

  // A row appeared and it is the selected one.
  const rows = page.getByTestId("lectura-fuente-chip");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("lectura-interrogar")).toBeEnabled();

  // Wait for the debounced flush, then verify it landed on the essay.
  await page.waitForTimeout(1100);
  const essays = await dumpEssays(page);
  const fuentes = essays[0].fuentes as Array<{ nombre: string }>;
  expect(fuentes).toHaveLength(1);
  expect(fuentes[0].nombre).toBe("fuente-rapida");
});

test("Pluma Roja forwards every fuente to each critique invocation", async ({
  page,
}) => {
  await openNewEssay(page, "academico");

  // Seed two fuentes.
  await seedTwo(page, ["Fuente A", "Texto A."], ["Fuente B", "Texto B."]);

  // Type the essay body and run Pluma Roja.
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await runReview(page);

  const critiques = await dumpCritiques(page);
  for (const pase of ["coherencia", "estilo", "argumento", "apa"]) {
    expect(critiques[pase]).toBeDefined();
    expect(critiques[pase].fuentes).toHaveLength(2);
  }
});

test("council interrogation now returns 3 questions per sage (not 5)", async ({
  page,
}) => {
  await openNewEssay(page);
  await hazmeButton(page).click();
  await pickSource(page, "Edmondson definió la seguridad psicológica.");
  await page.getByTestId("lectura-interrogar").click();

  // Academico defaults to 3 agents (EM/SI/CR) x 3 questions = 9 notes.
  await expect(page.locator('.tl-shape[data-shape-type="note"]')).toHaveCount(9);
});
