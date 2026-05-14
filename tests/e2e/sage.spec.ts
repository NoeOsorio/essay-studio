import { test, expect } from "@playwright/test";
import { dumpEssays, installTauriStub, openNewEssay } from "./setup";

/**
 * End-to-end coverage for the sage interrogation overlay. The Tauri
 * sage_interrogate command is stubbed in setup.ts to emit a canned
 * 5-question stream, so these tests don't burn Anthropic credits and
 * stay deterministic.
 */

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

test("'Interrogar' button opens the Lectura overlay", async ({ page }) => {
  await openNewEssay(page);
  await page.getByRole("button", { name: /Interrogar/ }).click();
  await expect(
    page.getByRole("heading", { name: /Interrogatorio — el Empirista/i }),
  ).toBeVisible();
});

test("'Interrogar' auto-shows the board when it was hidden", async ({
  page,
}) => {
  await openNewEssay(page);
  // Hide the board first.
  await page.getByRole("button", { name: /Ocultar tablero/ }).click();
  await expect(page.locator(".tl-container")).toHaveCount(0);

  // Now click Interrogar — overlay opens AND the board comes back so
  // the future post-its will have somewhere to land.
  await page.getByRole("button", { name: /Interrogar/ }).click();
  await expect(
    page.getByRole("heading", { name: /Interrogatorio — el Empirista/i }),
  ).toBeVisible();
  await expect(page.locator(".tl-container")).toBeVisible();
});

test("interrogating a text streams 5 questions and lets the user save them", async ({
  page,
}) => {
  await openNewEssay(page);
  await page.getByRole("button", { name: /Interrogar/ }).click();

  const textarea = page.getByPlaceholder(
    "Pega aquí un fragmento de tu ensayo, o de un paper que estés leyendo…",
  );
  await textarea.fill(
    "Edmondson definió la seguridad psicológica como la creencia compartida del equipo.",
  );

  // Two buttons match "Interrogar" — the topbar one (just used to
  // open the overlay) and the dark CTA inside the overlay. Click the
  // overlay one explicitly.
  const overlay = page.locator("div.bg-paper-2", {
    has: page.getByText(/Interrogatorio — el Empirista/),
  });
  await overlay.getByRole("button", { name: /^Interrogar$/ }).click();

  // The streaming pane should eventually show 5 numbered questions.
  await expect(page.locator("ol > li")).toHaveCount(5);

  // And a "save" button shows with the cost line.
  await expect(page.getByText(/costo · \$/)).toBeVisible();

  // Save → overlay closes, the essay gets one interrogatorio, AND
  // five post-its appear on the board (one per pregunta).
  await page.getByRole("button", { name: /Guardar al ensayo/ }).click();
  await expect(
    page.getByRole("heading", { name: /Interrogatorio — el Empirista/i }),
  ).toHaveCount(0);

  // Autosave is synchronous via flush() on addInterrogatorio.
  await page.waitForTimeout(300);
  const essays = await dumpEssays(page);
  expect(essays.length).toBe(1);
  expect(essays[0].interrogatorios).toHaveLength(1);
  const entry = (essays[0].interrogatorios as Array<{
    sage: string;
    preguntas: string[];
  }>)[0];
  expect(entry.sage).toBe("em");
  expect(entry.preguntas).toHaveLength(5);
  expect(entry.preguntas[0]).toMatch(/N\?/);

  // The five questions also materialised as note shapes on the board.
  await expect(
    page.locator('.tl-shape[data-shape-type="note"]'),
  ).toHaveCount(5);
});

test("Esc / click outside closes the overlay without saving", async ({
  page,
}) => {
  await openNewEssay(page);
  await page.getByRole("button", { name: /Interrogar/ }).click();
  // Click on the backdrop — the inner card swallows its own clicks.
  await page.mouse.click(20, 20);
  await expect(
    page.getByRole("heading", { name: /Interrogatorio — el Empirista/i }),
  ).toHaveCount(0);

  const essays = await dumpEssays(page);
  // No interrogatorio was saved.
  if (essays.length > 0) {
    expect(essays[0].interrogatorios ?? []).toHaveLength(0);
  }
});
