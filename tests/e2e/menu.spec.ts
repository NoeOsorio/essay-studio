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

test("sabios:limpiar borra todas las anotaciones y resetea evaluacion (sesión 17)", async ({
  page,
}) => {
  await openNewEssay(page, "academico");
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(
    "El liderazgo del CEO determina la cultura. Cuando alguien tóxico ocupa esa silla la organización se contamina. La solución es entrenar a todos en confianza.",
  );

  // Run Evaluar para sembrar marks.
  await page.getByTestId("topbar-pluma-roja").click();
  await page.getByTestId("pluma-start").click();
  await expect(page.getByTestId("pluma-anotacion").first()).toBeVisible();
  await page.getByTestId("pluma-apply").click();

  const initialMarks = await editor.locator(".anno").count();
  expect(initialMarks).toBeGreaterThan(0);
  await expect(page.getByTestId("scorebar")).toBeVisible();

  // Auto-confirm el window.confirm que dispara el bridge.
  page.once("dialog", (d) => void d.accept());
  await fireMenu(page, "sabios:limpiar");

  // Todas las marks fuera. El Scorebar vuelve al estado "nunca
  // evaluado" → oculto (sesión 13b).
  await expect(editor.locator(".anno")).toHaveCount(0);
  await expect(page.getByTestId("scorebar")).toHaveCount(0);
});

test("Scorebar dismiss button + view:show-benchmark lo restaura (sesión 17)", async ({
  page,
}) => {
  await openNewEssay(page, "academico");
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(
    "Texto suficiente para que el sabio tenga algo concreto que analizar y produzca anotaciones.",
  );
  await page.getByTestId("topbar-pluma-roja").click();
  await page.getByTestId("pluma-start").click();
  await expect(page.getByTestId("pluma-anotacion").first()).toBeVisible();
  await page.getByTestId("pluma-apply").click();

  await expect(page.getByTestId("scorebar")).toBeVisible();

  // Click × → bar desaparece.
  await page.getByTestId("scorebar-dismiss").click();
  await expect(page.getByTestId("scorebar")).toHaveCount(0);

  // Menú Vista > Mostrar Benchmark lo trae de vuelta.
  await fireMenu(page, "view:show-benchmark");
  await expect(page.getByTestId("scorebar")).toBeVisible();
});

test("recordEvaluacion vuelve a mostrar el Scorebar si estaba dismissed (sesión 17)", async ({
  page,
}) => {
  await openNewEssay(page, "academico");
  const editor = page.locator(".tiptap-content");
  await editor.click();
  await page.keyboard.type(
    "Texto para evaluar con un párrafo de longitud razonable que produzca anotaciones.",
  );

  // Primera evaluación, dismiss.
  await page.getByTestId("topbar-pluma-roja").click();
  await page.getByTestId("pluma-start").click();
  await expect(page.getByTestId("pluma-anotacion").first()).toBeVisible();
  await page.getByTestId("pluma-apply").click();
  await page.getByTestId("scorebar-dismiss").click();
  await expect(page.getByTestId("scorebar")).toHaveCount(0);

  // Re-evaluar — el bar debería reaparecer automáticamente, sin
  // necesidad de pedir "Mostrar Benchmark" a mano.
  await page.getByTestId("topbar-pluma-roja").click();
  await page.getByTestId("pluma-start").click();
  await expect(page.getByTestId("pluma-anotacion").first()).toBeVisible();
  await page.getByTestId("pluma-apply").click();
  await expect(page.getByTestId("scorebar")).toBeVisible();
});
