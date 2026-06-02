// Sesión 14 — Menú nativo extendido (Sabios + Toggle tablero).
//
// El menú nativo de macOS no se puede driver desde Playwright, así
// que cada test simula el `app:menu` event que Rust emitiría al click
// del usuario. El bridge en `src/lib/menu/bridge.ts` es el único
// objetivo bajo prueba — cubre que cada id custom dispare el store
// action correcto.
//
// Items pre-existentes (file:new, file:close, view:history) ya están
// cubiertos por flow.spec.ts y history.spec.ts.

import { test, expect, type Page } from "@playwright/test";
import { installTauriStub, openNewEssay } from "./setup";

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

async function fireMenu(page: Page, id: string) {
  await page.evaluate((commandId) => {
    const winx = window as unknown as {
      __E2E_DISPATCH: (name: string, payload: unknown) => void;
    };
    winx.__E2E_DISPATCH("app:menu", commandId);
  }, id);
}

test("view:board-toggle oculta y vuelve a mostrar el tablero", async ({
  page,
}) => {
  await openNewEssay(page, "academico");
  await expect(page.locator(".tl-container")).toBeVisible();

  await fireMenu(page, "view:board-toggle");
  await expect(page.locator(".tl-container")).toHaveCount(0);

  await fireMenu(page, "view:board-toggle");
  await expect(page.locator(".tl-container")).toBeVisible();
});

test("sabios:interrogar abre el overlay de Lectura en modo consejo", async ({
  page,
}) => {
  await openNewEssay(page, "academico");
  await fireMenu(page, "sabios:interrogar");
  await expect(page.getByTestId("lectura-overlay")).toBeVisible();
});

test("sabios:evaluar abre el overlay de Pluma Roja", async ({ page }) => {
  await openNewEssay(page, "academico");
  await fireMenu(page, "sabios:evaluar");
  await expect(page.getByTestId("pluma-overlay")).toBeVisible();
});

test("sabios:rubrica abre el editor de rúbrica", async ({ page }) => {
  await openNewEssay(page, "academico");
  await fireMenu(page, "sabios:rubrica");
  await expect(page.getByTestId("rubrica-overlay")).toBeVisible();
});

test("sabios:fuentes abre la biblioteca de fuentes", async ({ page }) => {
  await openNewEssay(page, "academico");
  await fireMenu(page, "sabios:fuentes");
  await expect(page.getByTestId("fuentes-overlay")).toBeVisible();
});

test("acciones del consejo son no-op sin essay abierto (no crash, no overlay)", async ({
  page,
}) => {
  // No openNewEssay — estamos en la lista.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Tus/ })).toBeVisible();

  await fireMenu(page, "sabios:interrogar");
  await fireMenu(page, "sabios:evaluar");
  await fireMenu(page, "sabios:rubrica");
  await fireMenu(page, "sabios:fuentes");
  await fireMenu(page, "view:board-toggle");
  await fireMenu(page, "view:history");

  // Ningún overlay se abrió, seguimos en la lista.
  await expect(page.getByTestId("lectura-overlay")).toHaveCount(0);
  await expect(page.getByTestId("pluma-overlay")).toHaveCount(0);
  await expect(page.getByTestId("rubrica-overlay")).toHaveCount(0);
  await expect(page.getByTestId("fuentes-overlay")).toHaveCount(0);
  await expect(page.getByTestId("history-overlay")).toHaveCount(0);
});

test("ids desconocidos del menú son no-op silencioso", async ({ page }) => {
  await openNewEssay(page, "academico");
  // Cualquier id que no esté en el switch — no crash, no estado.
  await fireMenu(page, "unknown:item");
  await fireMenu(page, "");
  // Seguimos en el editor con todo normal.
  await expect(
    page.getByRole("textbox", { name: "Título del ensayo" }),
  ).toBeVisible();
});
