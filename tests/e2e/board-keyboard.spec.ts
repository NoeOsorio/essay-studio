import { test, expect } from "@playwright/test";
import { installTauriStub, openNewEssay } from "./setup";

/**
 * Keyboard / shortcut behaviour for the tldraw board.
 *
 * These tests guard against the bug class that has hit us twice now:
 * a custom handler intercepting a key that tldraw also listens to,
 * either dropping a duplicate shape or stealing keystrokes from the
 * inline rich-text editor.
 */

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

/** Click roughly in the middle of the right-hand canvas pane. */
async function clickOnEmptyCanvas(page: import("@playwright/test").Page) {
  const canvas = page.locator(".tl-container").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not laid out yet");
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5);
}

/**
 * The new note is ready for typing once its optional title field is on
 * screen (it only exists while the note is being edited). Typing sooner can
 * lose the first keystroke, because tldraw is still entering edit mode.
 */
async function expectEditing(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("note-title")).toBeVisible();
}

test("N + click creates ONE note (tool is not sticky)", async ({ page }) => {
  await openNewEssay(page);
  await page.keyboard.press("n");
  await clickOnEmptyCanvas(page);
  // Click again somewhere else — should NOT create another note.
  await page.mouse.click(300, 300, { button: "left" });
  await page.waitForTimeout(150);
  const notes = await page.locator('.tl-shape[data-shape-type="note"]').count();
  expect(notes).toBe(1);
});

test("typing right after creating a note writes into THAT note", async ({
  page,
}) => {
  await openNewEssay(page);
  await page.keyboard.press("n");
  await clickOnEmptyCanvas(page);
  await expectEditing(page);
  // Tldraw enters edit-in-place automatically. Typing should land in
  // the note's body, not be eaten by tool shortcuts.
  await page.keyboard.type("seguridad psicológica", { delay: 10 });
  // Commit the edit.
  await page.keyboard.press("Escape");

  const note = page.locator('.tl-shape[data-shape-type="note"]').first();
  await expect(note).toContainText("seguridad psicológica");
});

test("typing the letter 'a' inside an editing note does NOT switch to arrow tool", async ({
  page,
}) => {
  await openNewEssay(page);
  await page.keyboard.press("n");
  await clickOnEmptyCanvas(page);
  await expectEditing(page);
  await page.keyboard.type("aaa", { delay: 10 });
  await page.keyboard.press("Escape");

  const note = page.locator('.tl-shape[data-shape-type="note"]').first();
  await expect(note).toContainText("aaa");
  // Still exactly one note — no arrow shape created by a stray "a".
  const arrows = await page.locator('.tl-shape[data-shape-type="arrow"]').count();
  expect(arrows).toBe(0);
});

test("typing 'n' inside an editing note does NOT create a second note", async ({
  page,
}) => {
  await openNewEssay(page);
  await page.keyboard.press("n");
  await clickOnEmptyCanvas(page);
  await expectEditing(page);
  await page.keyboard.type("nota nueva con n", { delay: 10 });
  await page.keyboard.press("Escape");

  const notes = await page.locator('.tl-shape[data-shape-type="note"]').count();
  expect(notes).toBe(1);
  await expect(page.locator('.tl-shape[data-shape-type="note"]').first()).toContainText(
    "nota nueva con n",
  );
});

test("the board shows each new note", async ({ page }) => {
  await openNewEssay(page);
  const notes = page.locator('.tl-shape[data-shape-type="note"]');
  await expect(notes).toHaveCount(0);

  await page.keyboard.press("n");
  await clickOnEmptyCanvas(page);
  await page.keyboard.press("Escape");
  await expect(notes).toHaveCount(1);
});

test("the note bar assigns author and kind via meta", async ({
  page,
}) => {
  await openNewEssay(page);
  await page.keyboard.press("n");
  await clickOnEmptyCanvas(page);
  await expectEditing(page);
  await page.keyboard.type("conexión", { delay: 10 });
  await page.keyboard.press("Escape");

  // The bar appears when a single note is selected. Author chips are
  // radios named after the agent; the kind lives in a menu on the bar.
  await page.getByRole("radio", { name: "Sistemas", exact: true }).click();
  await page.getByTestId("note-bar-kind").click();
  await page.getByRole("option", { name: "Conexión", exact: true }).click();

  const note = page.locator('.tl-shape[data-shape-type="note"]').first();
  // The note shows the agent's name; kind is not drawn on the note.
  await expect(note.getByTestId("note-author")).toContainText("Sistemas");
  await expect(page.getByTestId("note-bar-kind")).toContainText("Conexión");
});
