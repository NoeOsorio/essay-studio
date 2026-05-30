mod history;
mod menu;
mod sidecar;
mod storage;

use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(sidecar::SidecarState::default())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Native menu (sesión 13). Install it onto the app handle so
      // macOS shows it in the system menu bar; Windows/Linux render
      // it inside the window. The on_menu_event handler emits
      // `app:menu` events the renderer subscribes to.
      let menu = menu::build(app.handle())?;
      app.set_menu(menu)?;

      // Spawn the sage sidecar on startup. We don't block startup if
      // it fails — the renderer will get an error when it tries to
      // call sage_interrogate.
      let app_handle = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        if let Err(err) = sidecar::spawn(app_handle).await {
          log::error!("failed to spawn sage sidecar: {err}");
        }
      });

      Ok(())
    })
    .on_menu_event(|app, event| {
      let id = event.id.as_ref();
      log::info!("menu event: {id}");
      // Forward every custom-id activation to the renderer. The
      // renderer ignores ids it doesn't know about, so adding new
      // entries (sesiones futuras) doesn't need a Rust change.
      let _ = app.emit("app:menu", id);
    })
    .invoke_handler(tauri::generate_handler![
      storage::essay_list,
      storage::essay_read,
      storage::essay_write,
      storage::essay_delete,
      history::history_list,
      history::history_read,
      history::history_append,
      sidecar::sage_interrogate,
      sidecar::sage_critique,
      sidecar::sage_ping,
      sidecar::sage_status,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
