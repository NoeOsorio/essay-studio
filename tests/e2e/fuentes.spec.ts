import { test, expect, type Page } from "@playwright/test";
import {
  dumpCritiques,
  dumpEssays,
  installTauriStub,
  openNewEssay,
} from "./setup";

/**
 * Fuentes (sources library) coverage.
 *
 * The library lives on the essay (essay.fuentes[]). Two consumers:
 *  - Lectura: chip-row picker above the source textarea + upload
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
  await page.getByTestId("fuentes-overlay").getByTitle("Cerrar").click();
  await expect(page.getByTestId("fuentes-overlay")).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

test("Fuentes button opens the editor and persists manual fuentes", async ({
  page,
}) => {
  await openNewEssay(page);

  await page.getByTestId("topbar-fuentes").click();
  await expect(page.getByTestId("fuentes-overlay")).toBeVisible();
  await expect(page.getByText(/Sin fuentes aún/i)).toBeVisible();

  await page.getByTestId("fuentes-add").click();
  await page.getByTestId("fuente-nombre").first().fill("Edmondson 1999");
  await page
    .getByTestId("fuente-cita")
    .first()
    .fill("Edmondson, A. (1999). Psychological safety…");
  await page
    .getByTestId("fuente-contenido")
    .first()
    .fill("Texto íntegro del estudio sobre seguridad psicológica.");

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
  expect(fuentes[0].cita).toBe(
    "Edmondson, A. (1999). Psychological safety…",
  );
  expect(fuentes[0].origen).toBe("texto");

  await expect(page.getByTestId("topbar-fuentes")).toContainText("· 1");
});

test("uploading a .txt file in Fuentes saves it to the library", async ({
  page,
}) => {
  await openNewEssay(page);
  await page.getByTestId("topbar-fuentes").click();

  await page.getByTestId("fuentes-file-input").setInputFiles({
    name: "notas-sapolsky.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Sapolsky argumenta que el comportamiento es siempre biológico-cultural.",
    ),
  });

  await expect(page.getByTestId("fuente-row")).toHaveCount(1);
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

test("removing a fuente updates the count and persists", async ({ page }) => {
  await openNewEssay(page);
  await page.getByTestId("topbar-fuentes").click();
  await page.getByTestId("fuentes-add").click();
  await page.getByTestId("fuente-nombre").first().fill("Uno");
  await page.getByTestId("fuentes-add").click();
  await page.getByTestId("fuente-nombre").nth(1).fill("Dos");

  await page.getByTestId("fuente-remove").first().click();
  await expect(page.getByTestId("fuente-row")).toHaveCount(1);
  await expect(page.getByTestId("fuente-nombre")).toHaveValue("Dos");

  await closeFuentes(page);

  const essays = await dumpEssays(page);
  expect(
    (essays[0].fuentes as unknown[] | undefined)?.length ?? 0,
  ).toBe(1);
});

test("Lectura shows fuente chips and picking one loads its contents", async ({
  page,
}) => {
  await openNewEssay(page);

  // Set up two fuentes first.
  await page.getByTestId("topbar-fuentes").click();
  await page.getByTestId("fuentes-add").click();
  await page.getByTestId("fuente-nombre").first().fill("Edmondson 1999");
  await page
    .getByTestId("fuente-contenido")
    .first()
    .fill("CONTENIDO DE EDMONDSON: la seguridad psicológica predice el aprendizaje del equipo.");
  await page.getByTestId("fuentes-add").click();
  await page.getByTestId("fuente-nombre").nth(1).fill("Sapolsky 2017");
  await page
    .getByTestId("fuente-contenido")
    .nth(1)
    .fill("CONTENIDO DE SAPOLSKY: behave es un libro denso sobre el cerebro y la conducta.");
  await closeFuentes(page);

  // Open Lectura.
  await page.getByRole("button", { name: "Interrogar", exact: true }).click();
  await expect(page.getByTestId("lectura-fuente-chips")).toBeVisible();
  const chips = page.getByTestId("lectura-fuente-chip");
  await expect(chips).toHaveCount(2);

  // Pick the first chip — textarea fills with its contenido.
  await chips.first().click();
  await expect(
    page.getByPlaceholder(/Pega un fragmento, o elige una fuente arriba/),
  ).toHaveValue(/CONTENIDO DE EDMONDSON/);

  // Pick the second — replaces.
  await chips.nth(1).click();
  await expect(
    page.getByPlaceholder(/Pega un fragmento, o elige una fuente arriba/),
  ).toHaveValue(/CONTENIDO DE SAPOLSKY/);
});

test("uploading a .txt in Lectura also saves it to the library", async ({
  page,
}) => {
  await openNewEssay(page);

  await page.getByRole("button", { name: "Interrogar", exact: true }).click();

  await page.locator('input[type=file]').setInputFiles({
    name: "fuente-rapida.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Contenido pegado desde Lectura."),
  });

  // The textarea got filled.
  await expect(
    page.getByPlaceholder(/Pega un fragmento, o elige una fuente arriba/),
  ).toHaveValue(/Contenido pegado desde Lectura/);

  // And a chip appeared (and the count badge in the topbar).
  await expect(page.getByTestId("lectura-fuente-chip")).toHaveCount(1);

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
  await page.getByTestId("topbar-fuentes").click();
  await page.getByTestId("fuentes-add").click();
  await page.getByTestId("fuente-nombre").first().fill("Fuente A");
  await page.getByTestId("fuente-contenido").first().fill("Texto A.");
  await page.getByTestId("fuentes-add").click();
  await page.getByTestId("fuente-nombre").nth(1).fill("Fuente B");
  await page.getByTestId("fuente-contenido").nth(1).fill("Texto B.");
  await closeFuentes(page);

  // Type the essay body and run Pluma Roja.
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(SAMPLE_BODY);

  await page.getByTestId("topbar-pluma-roja").click();
  await expect(page.getByTestId("pluma-fuentes-indicator")).toContainText("2");

  await page.getByTestId("pluma-start").click();
  await expect(page.getByTestId("pluma-anotacion").first()).toBeVisible();

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
  await page.getByRole("button", { name: "Interrogar", exact: true }).click();
  await page
    .getByPlaceholder(/Pega aquí un fragmento, o sube un \.txt/)
    .fill("Edmondson definió la seguridad psicológica.");

  const overlay = page.locator("div.bg-paper-2", {
    has: page.getByRole("heading", { name: /Interrogatorio — el consejo/i }),
  });
  await overlay.getByRole("button", { name: /^Interrogar$/ }).click();

  // Academico defaults to 3 sages (EM/SI/CR) × 3 preguntas = 9.
  await expect(page.locator("input[type=checkbox]")).toHaveCount(9);
});
