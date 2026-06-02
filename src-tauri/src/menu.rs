// Native menu (sesión 13 + 14 — Fase 2.7 del ROADMAP).
//
// macOS shows menus in the system menu bar; Windows/Linux render them
// inside the window. Tauri 2's `menu::*` API abstracts that. We build
// the structure once at app setup and emit `app:menu` Tauri events on
// menu activations so the renderer can dispatch to the right store
// action (or use a TipTap command for Edit items, where TipTap
// handles the system Cut/Copy/Paste/Undo/Redo via standard contenteditable).
//
// Custom item ids use a `surface:action` scheme so the renderer can
// switch on them cleanly:
//   "file:new"          → store.newEssay()
//   "file:close"        → store.closeEssay()
//   "view:history"      → store.openHistory()
//   "view:board-toggle" → store.toggleBoard()
//   "sabios:interrogar" → store.openLectura()
//   "sabios:evaluar"    → store.openPlumaRoja()
//   "sabios:rubrica"    → store.openRubrica()
//   "sabios:fuentes"    → store.openFuentes()

use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Runtime};

/// Build the application menu. Called once at setup time.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    // --- App submenu (shown as the bold first one on macOS) ---
    // We use the app's `productName` automatically as the title via
    // SubmenuBuilder::new — convention for macOS is that the first
    // submenu's title is the app name, even though macOS replaces it
    // visually with the actual product name.
    let app_submenu = SubmenuBuilder::new(app, "Essay Studio")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    // --- File ---
    let file_new = MenuItemBuilder::new("Nuevo ensayo")
        .id("file:new")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let file_close = MenuItemBuilder::new("Cerrar ensayo")
        .id("file:close")
        .accelerator("CmdOrCtrl+W")
        .build(app)?;
    let file_submenu = SubmenuBuilder::new(app, "Archivo")
        .item(&file_new)
        .separator()
        .item(&file_close)
        .build()?;

    // --- Edit ---
    // All standard — TipTap and the platform handle these natively
    // through contenteditable; we don't need custom ids.
    let edit_submenu = SubmenuBuilder::new(app, "Edición")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    // --- View ---
    let view_board_toggle = MenuItemBuilder::new("Mostrar / ocultar tablero")
        .id("view:board-toggle")
        .accelerator("CmdOrCtrl+\\")
        .build(app)?;
    let view_history = MenuItemBuilder::new("Historial de versiones…")
        .id("view:history")
        .accelerator("CmdOrCtrl+Shift+H")
        .build(app)?;
    let view_submenu = SubmenuBuilder::new(app, "Vista")
        .item(&view_board_toggle)
        .separator()
        .item(&view_history)
        .build()?;

    // --- Sabios ---
    // Las cuatro acciones del consejo que el usuario lanza con más
    // frecuencia. Acceleradores siguen las convenciones de "verbo de
    // acción" (⌘I interrogar, ⌘⇧E evaluar) y "objeto de configuración"
    // (⌘R rúbrica, ⌘F fuentes). El bridge ignora silenciosamente si no
    // hay essay abierto — los items se ven activos pero no hacen nada
    // (disable contextual queda para una sesión futura).
    let sabios_interrogar = MenuItemBuilder::new("Interrogar")
        .id("sabios:interrogar")
        .accelerator("CmdOrCtrl+I")
        .build(app)?;
    let sabios_evaluar = MenuItemBuilder::new("Evaluar")
        .id("sabios:evaluar")
        .accelerator("CmdOrCtrl+Shift+E")
        .build(app)?;
    let sabios_rubrica = MenuItemBuilder::new("Rúbrica…")
        .id("sabios:rubrica")
        .accelerator("CmdOrCtrl+R")
        .build(app)?;
    let sabios_fuentes = MenuItemBuilder::new("Fuentes…")
        .id("sabios:fuentes")
        .accelerator("CmdOrCtrl+F")
        .build(app)?;
    let sabios_submenu = SubmenuBuilder::new(app, "Sabios")
        .item(&sabios_interrogar)
        .item(&sabios_evaluar)
        .separator()
        .item(&sabios_rubrica)
        .item(&sabios_fuentes)
        .build()?;

    // --- Window ---
    let window_submenu = SubmenuBuilder::new(app, "Ventana")
        .minimize()
        .maximize()
        .separator()
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .build()?;

    Menu::with_items(
        app,
        &[
            &app_submenu,
            &file_submenu,
            &edit_submenu,
            &view_submenu,
            &sabios_submenu,
            &window_submenu,
        ],
    )
}
