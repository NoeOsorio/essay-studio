// Writer-defined agents: one `agents.json` in the app data dir.
// Saves replace the whole list and reject it if any record is invalid.

use serde::{Deserialize, Serialize};
use std::fs;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomAgent {
    pub id: String,
    pub name: String,
    pub instructions: String,
    pub does: String,
    pub color: String,
    pub icon: String,
    pub can_paste: bool,
    pub default_on: bool,
    pub created_at: String,
}

/// "c_" followed by a UUID (8-4-4-4-12 hex).
fn valid_id(id: &str) -> bool {
    let Some(rest) = id.strip_prefix("c_") else {
        return false;
    };
    uuid::Uuid::parse_str(rest).is_ok() && rest.len() == 36
}

fn validate(a: &CustomAgent) -> Result<(), String> {
    let label = &a.id;
    if !valid_id(&a.id) {
        return Err(format!("invalid agent id: {label}"));
    }
    if !(1..=40).contains(&a.name.trim().chars().count()) {
        return Err(format!("agent {label}: name must be 1 to 40 characters"));
    }
    if !(1..=2000).contains(&a.instructions.trim().chars().count()) {
        return Err(format!("agent {label}: instructions must be 1 to 2000 characters"));
    }
    if !matches!(a.does.as_str(), "review" | "ask" | "both") {
        return Err(format!("agent {label}: invalid does: {}", a.does));
    }
    if !matches!(
        a.color.as_str(),
        "rosa" | "durazno" | "lima" | "cielo" | "arena" | "gris"
    ) {
        return Err(format!("agent {label}: invalid color: {}", a.color));
    }
    if !matches!(
        a.icon.as_str(),
        "ortografia" | "pluma" | "libro" | "cita" | "lista" | "chispa"
    ) {
        return Err(format!("agent {label}: invalid icon: {}", a.icon));
    }
    Ok(())
}

#[tauri::command]
pub fn agents_list(app: AppHandle) -> Result<Vec<CustomAgent>, String> {
    let path = crate::storage::app_data_dir(&app)?.join("agents.json");
    match fs::read_to_string(&path) {
        Ok(body) => serde_json::from_str(&body).map_err(|e| format!("parse agents: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(format!("read agents: {e}")),
    }
}

#[tauri::command]
pub fn agents_save(app: AppHandle, agents: Vec<CustomAgent>) -> Result<(), String> {
    for a in &agents {
        validate(a)?;
    }
    let dir = crate::storage::app_data_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("create data dir: {e}"))?;
    let body = serde_json::to_string_pretty(&agents).map_err(|e| e.to_string())?;
    // Atomic write: tmp then rename.
    let path = dir.join("agents.json");
    let tmp = dir.join("agents.json.tmp");
    fs::write(&tmp, body).map_err(|e| format!("write tmp: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("rename tmp: {e}"))?;
    Ok(())
}
