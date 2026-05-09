import { test, expect } from "@playwright/test";
import { installTauriStub, openNewEssay } from "./setup";

/**
 * Keyboard / shortcut behaviour for the TipTap editor pane.
 *
 * These tests are about what the user TYPES — both plain prose and
 * the slash menu / formatting shortcuts — landing in the right place
 * (the editor body, not getting eaten by some global handler).
 */

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

test("typing plain prose lands inside the TipTap editor", async ({ page }) => {
  await openNewEssay(page);
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type("La psicología organizacional", { delay: 5 });
  await expect(editor).toContainText("La psicología organizacional");
});

test("typing into the title input updates the title", async ({ page }) => {
  await openNewEssay(page);
  const title = page.getByRole("textbox", { name: "Título del ensayo" });
  await title.click();
  await page.keyboard.type("Paradoja remota", { delay: 5 });
  await expect(title).toHaveText("Paradoja remota");
});

test("Enter inside the title does NOT insert a newline", async ({ page }) => {
  await openNewEssay(page);
  const title = page.getByRole("textbox", { name: "Título del ensayo" });
  await title.click();
  await page.keyboard.type("Antes", { delay: 5 });
  await page.keyboard.press("Enter");
  // No newline character should ever land inside the title.
  const text = await title.textContent();
  expect(text ?? "").not.toContain("\n");
  expect(text).toBe("Antes");
});

test("slash command opens the menu and / Título 1 promotes to h1", async ({
  page,
}) => {
  await openNewEssay(page);
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type("/", { delay: 5 });

  // The slash menu lives outside the editor (portaled into body).
  const menu = page.getByRole("button", { name: /^Título 1/ });
  await expect(menu).toBeVisible();

  await page.keyboard.press("Enter");
  // After the command, an empty h1 sits in the editor.
  await expect(editor.locator("h1")).toHaveCount(1);
});

test("slash command filters items by query", async ({ page }) => {
  await openNewEssay(page);
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type("/quote", { delay: 5 });

  // Only the "Cita" item should match.
  await expect(page.getByRole("button", { name: /^Cita/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Título 1/ }),
  ).toHaveCount(0);
});

test("Escape closes the slash menu without inserting", async ({ page }) => {
  await openNewEssay(page);
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type("/", { delay: 5 });
  await expect(page.getByRole("button", { name: /^Título 1/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Título 1/ })).toHaveCount(0);
});

test("Cmd/Ctrl+B toggles bold inside the editor", async ({ page }) => {
  await openNewEssay(page);
  const editor = page.locator(".tiptap-content");
  await editor.click();

  // Type some text first, then select it and bold it. Going the other
  // way (start bold, then type) is brittle in headless browsers
  // because TipTap's mark stack can be stripped by intermediate input
  // events.
  await page.keyboard.type("negrita", { delay: 10 });
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+B");
  await expect(editor.locator("strong")).toContainText("negrita");
});
