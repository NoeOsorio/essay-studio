import { test, expect } from "@playwright/test";
import {
  dumpEssays,
  installTauriStub,
  openNewEssay,
  openSingleAgent,
  hazmeButton,
  pickSource,
} from "./setup";

/**
 * Coverage for Hazme preguntas: the panel (source, agents, Preguntar), the
 * questions landing on the board as notes, discarding one through the hover
 * actions, file upload for txt/md, the selection bubble and the usual Esc and
 * click-outside plumbing.
 */

const HEADING = "Los agentes te preguntan";
const NOTES = '.tl-shape[data-shape-type="note"]';

type Entry = { sage: string; preguntas: string[] };

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

test("Hazme preguntas opens the panel", async ({ page }) => {
  await openNewEssay(page);
  await hazmeButton(page).click();
  await expect(page.getByRole("heading", { name: HEADING })).toBeVisible();
});

test("Hazme preguntas auto-shows the board when it was hidden", async ({
  page,
}) => {
  await openNewEssay(page);
  await page.getByTestId("topbar-view-editor").click();
  await expect(page.locator(".tl-container")).toHaveCount(0);

  await hazmeButton(page).click();
  await expect(page.getByRole("heading", { name: HEADING })).toBeVisible();
  await expect(page.locator(".tl-container")).toBeVisible();
});

test("academico default runs 3 agents and lands 9 notes, with 3 entries and no save step", async ({
  page,
}) => {
  // Academico defaults to EM/SI/CR (no Práctica). Práctica can be added by
  // pressing its tile.
  await openNewEssay(page);
  await hazmeButton(page).click();
  await pickSource(
    page,
    "Edmondson definió la seguridad psicológica como la creencia compartida.",
  );
  await page.getByTestId("lectura-interrogar").click();

  // 3 agents (EM/SI/CR) x 3 questions = 9 notes, with nothing to confirm.
  await expect(page.locator(NOTES)).toHaveCount(9);
  await page.waitForTimeout(1200);

  const essays = await dumpEssays(page);
  expect(essays.length).toBe(1);
  const entries = essays[0].interrogatorios as Entry[];
  expect(entries).toHaveLength(3);
  expect(entries.map((i) => i.sage).sort()).toEqual(["cri", "em", "sis"]);
});

test("discarding one landed note leaves 2 questions kept for that agent", async ({
  page,
}) => {
  await openNewEssay(page);
  // Single agent to keep the test focused.
  await openSingleAgent(page, "Evidencia");
  await pickSource(page, "Un texto cualquiera.");
  await page.getByTestId("lectura-interrogar").click();
  await expect(page.locator(NOTES)).toHaveCount(3);

  // Discard the first note through the hover actions.
  const first = page.locator(NOTES).first();
  await first.hover();
  await page.getByTestId("landed-discard").click();
  await expect(page.locator(NOTES)).toHaveCount(2);
  await page.waitForTimeout(1200);

  const essays = await dumpEssays(page);
  const entry = (essays[0].interrogatorios as Entry[])[0];
  expect(entry.sage).toBe("em");
  expect(entry.preguntas).toHaveLength(2);
});

test("opening for one agent leaves only that agent on", async ({ page }) => {
  await openNewEssay(page);

  await openSingleAgent(page, "Objeciones");

  await expect(page.getByRole("heading", { name: HEADING })).toBeVisible();
  for (const id of ["em", "sis", "pra"]) {
    await expect(page.getByTestId(`lectura-sage-toggle-${id}`)).toHaveAttribute(
      "data-active",
      "false",
    );
  }
  await expect(page.getByTestId("lectura-sage-toggle-cri")).toHaveAttribute(
    "data-active",
    "true",
  );

  await pickSource(page, "Texto para disparar el stub.");
  await page.getByTestId("lectura-interrogar").click();
  await expect(page.locator(NOTES)).toHaveCount(3);
  await page.waitForTimeout(1200);

  const essays = await dumpEssays(page);
  const entries = essays[0].interrogatorios as Entry[];
  expect(entries).toHaveLength(1);
  expect(entries[0].sage).toBe("cri");
});

test("pressing a tile turns that agent on or off", async ({ page }) => {
  await openNewEssay(page);
  await hazmeButton(page).click();

  // Academico default: Evidencia on, Práctica off.
  const em = page.getByTestId("lectura-sage-toggle-em");
  const pra = page.getByTestId("lectura-sage-toggle-pra");
  await expect(em).toHaveAttribute("data-active", "true");
  await expect(pra).toHaveAttribute("data-active", "false");

  await pra.click();
  await expect(pra).toHaveAttribute("data-active", "true");
  await em.click();
  await expect(em).toHaveAttribute("data-active", "false");
  await expect(page.getByRole("heading", { name: HEADING })).toBeVisible();
});

test("uploading a .txt file shows it as a selected row", async ({ page }) => {
  await openNewEssay(page);
  await hazmeButton(page).click();

  const fileBody =
    "Edmondson (1999) midió seguridad psicológica con cirujanos. La muestra fue de 51 equipos en un hospital.";
  await pickSource(page, fileBody, "fragment.txt");

  const row = page.getByTestId("lectura-fuente-chip");
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute("data-active", "true");
  await expect(row).toContainText("fragment");
  await expect(page.getByTestId("lectura-interrogar")).toBeEnabled();
});

test("a file that is not .txt or .md shows a short line on the zone", async ({
  page,
}) => {
  await openNewEssay(page);
  await hazmeButton(page).click();

  await page.getByTestId("lectura-file-input").setInputFiles({
    name: "foto.png",
    mimeType: "image/png",
    buffer: Buffer.from("x"),
  });

  await expect(page.getByTestId("lectura-zone-notice")).toHaveText(
    "No puedo leer este formato",
  );
  await expect(page.getByTestId("lectura-fuente-chip")).toHaveCount(0);
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

  await expect(page.getByText("Preguntas", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Recibir preguntas de Evidencia/ }).last(),
  ).toBeVisible();
});

test("clicking an agent in the bubble menu opens the panel with the selection and only that agent", async ({
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
    .getByRole("button", { name: /Recibir preguntas de Sistemas/ })
    .click();

  await expect(page.getByRole("heading", { name: HEADING })).toBeVisible();
  const row = page.getByTestId("lectura-selection-row");
  await expect(row).toBeVisible();
  await expect(row).toContainText(selected);
  await expect(row).toHaveAttribute("data-active", "true");
  for (const id of ["em", "pra", "cri"]) {
    await expect(page.getByTestId(`lectura-sage-toggle-${id}`)).toHaveAttribute(
      "data-active",
      "false",
    );
  }
  await expect(page.getByTestId("lectura-sage-toggle-sis")).toHaveAttribute(
    "data-active",
    "true",
  );
  await expect(page.getByTestId("lectura-interrogar")).toBeEnabled();
});

test("Esc / click outside closes the panel without saving", async ({
  page,
}) => {
  await openNewEssay(page);
  await hazmeButton(page).click();
  await page.mouse.click(20, 20);
  await expect(page.getByRole("heading", { name: HEADING })).toHaveCount(0);

  await hazmeButton(page).click();
  await expect(page.getByRole("heading", { name: HEADING })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: HEADING })).toHaveCount(0);

  const essays = await dumpEssays(page);
  if (essays.length > 0) {
    expect(essays[0].interrogatorios ?? []).toHaveLength(0);
  }
});
