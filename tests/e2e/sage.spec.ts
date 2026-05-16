import { test, expect } from "@playwright/test";
import { dumpEssays, installTauriStub, openNewEssay } from "./setup";

/**
 * Coverage for the Lectura overlay. Two modes:
 *   - council  → all 4 sages run in parallel (default when launched
 *                from the topbar's main "Interrogar" button)
 *   - single   → one sage at a time (default when launched from a
 *                council avatar or the editor selection bubble)
 *
 * Plus: checkboxes per question (save only the ones you keep), file
 * upload for txt/md, and the existing keyboard/Esc plumbing.
 */

const SOURCE_PLACEHOLDER =
  "Pega aquí un fragmento, o sube un .txt / .md desde el botón.";

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

test("'Interrogar' button opens the overlay in council mode", async ({
  page,
}) => {
  await openNewEssay(page);
  await page.getByRole("button", { name: "Interrogar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Interrogatorio — el consejo/i }),
  ).toBeVisible();
});

test("'Interrogar' auto-shows the board when it was hidden", async ({
  page,
}) => {
  await openNewEssay(page);
  await page.getByRole("button", { name: /Ocultar tablero/ }).click();
  await expect(page.locator(".tl-container")).toHaveCount(0);

  await page.getByRole("button", { name: "Interrogar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Interrogatorio — el consejo/i }),
  ).toBeVisible();
  await expect(page.locator(".tl-container")).toBeVisible();
});

test("council mode interrogates all four sages and materialises 20 notes on save", async ({
  page,
}) => {
  await openNewEssay(page);
  await page.getByRole("button", { name: "Interrogar", exact: true }).click();

  await page
    .getByPlaceholder(SOURCE_PLACEHOLDER)
    .fill(
      "Edmondson definió la seguridad psicológica como la creencia compartida.",
    );

  const overlay = page.locator("div.bg-paper-2", {
    has: page.getByRole("heading", { name: /Interrogatorio — el consejo/i }),
  });
  await overlay.getByRole("button", { name: /^Interrogar$/ }).click();

  // 4 sages × 5 preguntas = 20 checkboxes in the result panes.
  await expect(page.locator("input[type=checkbox]")).toHaveCount(20);

  await overlay.getByRole("button", { name: /Guardar seleccionadas/ }).click();
  await page.waitForTimeout(400);

  const essays = await dumpEssays(page);
  expect(essays.length).toBe(1);
  const interrogatorios = essays[0].interrogatorios as Array<{
    sage: string;
    preguntas: string[];
  }>;
  // One entry per sage that produced kept questions (all four).
  expect(interrogatorios).toHaveLength(4);
  const sages = interrogatorios.map((i) => i.sage).sort();
  expect(sages).toEqual(["cri", "em", "pra", "sis"]);

  // 20 notes materialised on the board.
  await expect(
    page.locator('.tl-shape[data-shape-type="note"]'),
  ).toHaveCount(20);
});

test("unchecking questions skips them from materialisation and persistence", async ({
  page,
}) => {
  await openNewEssay(page);
  // Single sage to keep the test focused.
  await page
    .getByRole("button", { name: /Interrogar como El Empirista/ })
    .first()
    .click();

  await page
    .getByPlaceholder(SOURCE_PLACEHOLDER)
    .fill("Un texto cualquiera.");

  const overlay = page.locator("div.bg-paper-2", {
    has: page.getByRole("heading", { name: /Interrogatorio — el Empirista/i }),
  });
  await overlay.getByRole("button", { name: /^Interrogar$/ }).click();
  await expect(page.locator("input[type=checkbox]")).toHaveCount(5);

  // Uncheck questions 1 and 3 (indices 0 and 2). Keep 2, 4, 5.
  const checkboxes = page.locator("input[type=checkbox]");
  await checkboxes.nth(0).uncheck();
  await checkboxes.nth(2).uncheck();

  await overlay.getByRole("button", { name: /Guardar seleccionadas/ }).click();
  await page.waitForTimeout(300);

  const essays = await dumpEssays(page);
  const entry = (essays[0].interrogatorios as Array<{
    sage: string;
    preguntas: string[];
  }>)[0];
  expect(entry.preguntas).toHaveLength(3);

  await expect(
    page.locator('.tl-shape[data-shape-type="note"]'),
  ).toHaveCount(3);
});

test("clicking a council avatar opens lectura in single mode for that sage", async ({
  page,
}) => {
  await openNewEssay(page);

  await page
    .getByRole("button", { name: /Interrogar como El Cr.tico/i })
    .first()
    .click();

  await expect(
    page.getByRole("heading", { name: /Interrogatorio — el Cr.tico/i }),
  ).toBeVisible();

  await page
    .getByPlaceholder(SOURCE_PLACEHOLDER)
    .fill("Texto para disparar el stub.");

  const overlay = page.locator("div.bg-paper-2", {
    has: page.getByRole("heading", { name: /Interrogatorio — el Cr.tico/i }),
  });
  await overlay.getByRole("button", { name: /^Interrogar$/ }).click();

  await expect(page.locator("input[type=checkbox]")).toHaveCount(5);

  await overlay.getByRole("button", { name: /Guardar seleccionadas/ }).click();
  await page.waitForTimeout(300);

  const essays = await dumpEssays(page);
  const entry = (essays[0].interrogatorios as Array<{
    sage: string;
    preguntas: string[];
  }>)[0];
  expect(entry.sage).toBe("cri");
});

test("switching mode and sage tabs updates the overlay header", async ({
  page,
}) => {
  await openNewEssay(page);
  await page.getByRole("button", { name: "Interrogar", exact: true }).click();

  // Default = council.
  await expect(
    page.getByRole("heading", { name: /Interrogatorio — el consejo/i }),
  ).toBeVisible();

  // Switch to single mode.
  await page.getByRole("tab", { name: "Un sabio" }).click();
  await expect(
    page.getByRole("heading", { name: /Interrogatorio — el Empirista/i }),
  ).toBeVisible();

  // Change sage via the avatar tabs.
  await page.getByRole("tab", { name: /el Sist.mico/i }).click();
  await expect(
    page.getByRole("heading", { name: /Interrogatorio — el Sist.mico/i }),
  ).toBeVisible();
});

test("uploading a .txt file loads its contents into the textarea", async ({
  page,
}) => {
  await openNewEssay(page);
  await page.getByRole("button", { name: "Interrogar", exact: true }).click();

  const fileBody =
    "Edmondson (1999) midió seguridad psicológica con cirujanos. La muestra fue de 51 equipos en un hospital.";
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "fragment.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(fileBody, "utf-8"),
    });

  await expect(page.getByPlaceholder(SOURCE_PLACEHOLDER)).toHaveValue(fileBody);
});

test("selecting text in the editor shows the sage bubble menu", async ({
  page,
}) => {
  await openNewEssay(page);
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(
    "Edmondson definió la seguridad psicológica como creencia compartida.",
    { delay: 5 },
  );
  await page.keyboard.press("ControlOrMeta+A");

  await expect(page.getByText("Interrogar", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Interrogar como El Empirista/ }).last(),
  ).toBeVisible();
});

test("clicking a sage in the bubble menu opens the overlay prefilled", async ({
  page,
}) => {
  await openNewEssay(page);
  const editor = page.locator(".tiptap-content");
  await editor.click();
  const selected = "los rituales sostienen la seguridad psicológica";
  await page.keyboard.type(selected, { delay: 5 });
  await page.keyboard.press("ControlOrMeta+A");

  const bubble = page.getByTestId("sage-selection-menu");
  await bubble
    .getByRole("button", { name: /Interrogar como El Sist.mico/ })
    .click();

  await expect(
    page.getByRole("heading", { name: /Interrogatorio — el Sist.mico/i }),
  ).toBeVisible();
  await expect(page.getByPlaceholder(SOURCE_PLACEHOLDER)).toHaveValue(
    new RegExp(selected),
  );
});

test("Esc / click outside closes the overlay without saving", async ({
  page,
}) => {
  await openNewEssay(page);
  await page.getByRole("button", { name: "Interrogar", exact: true }).click();
  await page.mouse.click(20, 20);
  await expect(
    page.getByRole("heading", { name: /Interrogatorio — el consejo/i }),
  ).toHaveCount(0);

  const essays = await dumpEssays(page);
  if (essays.length > 0) {
    expect(essays[0].interrogatorios ?? []).toHaveLength(0);
  }
});
