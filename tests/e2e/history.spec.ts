// Sesión 12 — Historial de versiones.
//
// Cubre el flow real del usuario:
//   1. Crear ensayo, sin historial → topbar count 0, panel "Aún no hay
//      versiones guardadas".
//   2. "Guardar versión ahora" → snapshot kind=manual aparece, count
//      sube a 1.
//   3. Editar el contenido, snapshot manual otra vez → count 2.
//   4. Click en la versión vieja → preview muestra el texto antiguo
//      (no el actual).
//   5. Restaurar → editor vuelve al texto antiguo + se inyecta un
//      snapshot kind=before-restore automático (count = 3 total: la
//      v1 vieja, la v2 más reciente, el before-restore).
//   6. Close del ensayo añade un snapshot kind=close.

import { test, expect } from "@playwright/test";
import { installTauriStub, openNewEssay } from "./setup";

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

test("nuevo ensayo no muestra count y el panel está vacío", async ({
  page,
}) => {
  await openNewEssay(page, "academico");

  const historyButton = page.getByTestId("topbar-history");
  await expect(historyButton).toBeVisible();
  // Sin snapshots aún, no aparece el badge "· N".
  await expect(historyButton).not.toContainText("·");

  await historyButton.click();
  const overlay = page.getByTestId("history-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("Aún no hay versiones guardadas");
});

test("guardar versión manual la añade al panel con kind 'manual'", async ({
  page,
}) => {
  await openNewEssay(page, "academico");
  // Escribimos algo para que el snapshot tenga contenido.
  await page
    .getByRole("textbox", { name: "Título del ensayo" })
    .fill("v1 del ensayo");
  await page.locator(".tiptap-content").click();
  await page.keyboard.type("Primera versión del texto.");
  await page.waitForTimeout(900); // flush autosave

  await page.getByTestId("topbar-history").click();
  await page.getByTestId("history-snapshot-now").click();
  // El panel re-renderea con la nueva fila.
  await expect(page.locator("[data-testid^='history-row-']")).toHaveCount(1);
  await expect(page.getByTestId("history-overlay")).toContainText("manual");
  // Cerramos el panel y volvemos a abrir — count en topbar debe ser 1.
  await page.keyboard.press("Escape").catch(() => {});
  await page.getByTestId("topbar-history").click({ force: true });
  await expect(page.getByTestId("topbar-history")).toContainText("· 1");
});

test("restaurar una versión vieja reemplaza el editor y agrega before-restore", async ({
  page,
}) => {
  await openNewEssay(page, "academico");
  await page
    .getByRole("textbox", { name: "Título del ensayo" })
    .fill("Versión inicial");
  await page.locator(".tiptap-content").click();
  await page.keyboard.type("Texto original.");
  await page.waitForTimeout(900);

  // Snapshot v1.
  await page.getByTestId("topbar-history").click();
  await page.getByTestId("history-snapshot-now").click();
  await expect(page.locator("[data-testid^='history-row-']")).toHaveCount(1);
  // Cerrar overlay.
  await page.locator("body").click({ position: { x: 5, y: 5 } });

  // Cambiar el contenido del editor.
  await page.locator(".tiptap-content").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Cambios posteriores.");
  await page.waitForTimeout(900);

  // Abrir historial; ya hay 1 fila (v1). Hacemos otro snapshot (v2)
  // para tener una versión actual diferente de la primera.
  await page.getByTestId("topbar-history").click();
  await page.getByTestId("history-snapshot-now").click();
  await expect(page.locator("[data-testid^='history-row-']")).toHaveCount(2);

  // La primera fila (DESC) es la versión más reciente (v2). Hacemos
  // click en la SEGUNDA (la v1 original) para previsualizar.
  const rows = page.locator("[data-testid^='history-row-']");
  await rows.nth(1).click();
  await expect(page.getByTestId("history-preview-text")).toContainText(
    "Texto original.",
  );
  await expect(page.getByTestId("history-preview-text")).not.toContainText(
    "Cambios posteriores",
  );

  // Restaurar — primero pide confirm.
  await page.getByTestId("history-restore-ask").click();
  await page.getByTestId("history-restore-confirm").click();

  // El overlay se cierra, el editor vuelve al texto original.
  await expect(page.getByTestId("history-overlay")).toBeHidden();
  await expect(page.locator(".tiptap-content")).toContainText(
    "Texto original.",
  );
  await expect(page.locator(".tiptap").first()).not.toContainText(
    "Cambios posteriores",
  );

  // Reabriendo el historial: ahora hay 3 entradas (v1, v2, before-restore).
  await page.getByTestId("topbar-history").click();
  await expect(page.locator("[data-testid^='history-row-']")).toHaveCount(3);
  await expect(page.getByTestId("history-overlay")).toContainText(
    "antes de restaurar",
  );
});

test("cerrar el ensayo añade un snapshot kind='close'", async ({ page }) => {
  await openNewEssay(page, "academico");
  await page.locator(".tiptap-content").click();
  await page.keyboard.type("Algo para snapshotear.");
  await page.waitForTimeout(900);

  // Cerrar el ensayo via el botón breadcrumb "ensayos".
  await page.getByText(/^ensayos$/).click();

  // Volver a abrir el mismo ensayo desde la lista. La lista usa
  // `getByRole("heading")` con el título del ensayo — no hay testids
  // dedicados todavía (sesión 1 los puso así).
  await page.getByRole("heading", { name: /Sin título/ }).first().click();
  await page
    .getByRole("textbox", { name: "Título del ensayo" })
    .waitFor({ state: "visible" });

  await page.getByTestId("topbar-history").click();
  await expect(page.locator("[data-testid^='history-row-']")).toHaveCount(1);
  await expect(page.getByTestId("history-overlay")).toContainText("al cerrar");
});
