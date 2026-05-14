mod sidecar;
mod storage;

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
    .invoke_handler(tauri::generate_handler![
      storage::essay_list,
      storage::essay_read,
      storage::essay_write,
      storage::essay_delete,
      sidecar::sage_interrogate,
      sidecar::sage_ping,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
