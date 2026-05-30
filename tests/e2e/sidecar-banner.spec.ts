// Sesión 11 — Banner del sidecar.
//
// When Rust reports the Node sidecar as `down` (spawn failed, or the
// child died after running), the renderer must surface a clear banner
// above the editor instead of letting Interrogar/Evaluar hang silently
// when the user clicks them. The Rust side emits both an initial
// `sage://event` AND caches the status so a late-mounting renderer can
// query it. We exercise both surfaces.

import { test, expect } from "@playwright/test";
import { installTauriStub } from "./setup";

test.beforeEach(async ({ page }) => {
  await installTauriStub(page);
});

test("banner is hidden when sidecar status is up (default test stub)", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Nuevo académico/i }).click();
  await page
    .getByRole("textbox", { name: "Título del ensayo" })
    .waitFor({ state: "visible" });

  await expect(page.getByTestId("sidecar-banner")).toHaveCount(0);
});

test("banner appears when sage_status returns down at boot", async ({
  page,
}) => {
  // Set the override BEFORE the app boots — addInitScript runs before
  // page scripts, so `__E2E_SIDECAR_STATUS__` is in place by the time
  // useSidecarStatus calls invoke("sage_status").
  await page.addInitScript(() => {
    (
      window as unknown as {
        __E2E_SIDECAR_STATUS__?: { state: "down"; message: string };
      }
    ).__E2E_SIDECAR_STATUS__ = {
      state: "down",
      message:
        "No pudimos arrancar el consejo (¿está `node` en el PATH?). Detalle: ENOENT",
    };
  });

  await page.goto("/");

  const banner = page.getByTestId("sidecar-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("El consejo no está disponible");
  await expect(banner).toContainText("node");
  await expect(banner).toContainText("Detalle: ENOENT");
});

test("banner reacts live to sage://status events after mount", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Nuevo académico/i }).click();
  await page
    .getByRole("textbox", { name: "Título del ensayo" })
    .waitFor({ state: "visible" });
  await expect(page.getByTestId("sidecar-banner")).toHaveCount(0);

  // Fire a fake `sage://status` Down event through the stub's
  // event bus — simulates the reap task marking the child as dead
  // mid-session. The stub exposes its dispatcher on `__E2E_DISPATCH`.
  await page.evaluate(() => {
    const winx = window as unknown as {
      __E2E_DISPATCH: (name: string, payload: unknown) => void;
    };
    winx.__E2E_DISPATCH("sage://status", {
      state: "down",
      message: "El consejo cerró inesperadamente (exit 1). Reiniciá la app.",
    });
  });

  const banner = page.getByTestId("sidecar-banner");
  await expect(banner).toBeVisible({ timeout: 2_000 });
  await expect(banner).toContainText("cerró inesperadamente");
});
