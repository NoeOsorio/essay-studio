// Sidecar lifecycle + bridge to the renderer.
//
// At app startup we spawn a single Node process running
// `sidecar/dist/sage.js`. We talk to it over JSON Lines:
//
//   * Renderer → Rust (Tauri command `sage_interrogate`) → write
//     `{"id": "...", "type": "interrogate", "sage": "em", "text": "..."}`
//     to the child's stdin.
//   * Child stdout → background task parses each line and emits the
//     `sage://event` Tauri event with the JSON value as payload. The
//     renderer filters by `id`.
//
// Authentication is handled by the Claude Agent SDK on the Node side
// — it reads the user's existing Claude Code OAuth credentials from
// macOS Keychain, so calls bill against their Agent SDK monthly
// credit, not an API key.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStdin, Command};
use tokio::sync::Mutex;

#[derive(Default)]
pub struct SidecarState {
    /// Channel to the child's stdin. `None` if the child failed to spawn.
    pub stdin: Mutex<Option<ChildStdin>>,
}

/// Resolve where the compiled `sage.js` lives. In dev we walk up from
/// the Tauri binary's cwd to the project root and look for
/// `sidecar/dist/sage.js`. The user can override with the
/// `SAGE_SIDECAR_PATH` env var.
fn sidecar_path() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("SAGE_SIDECAR_PATH") {
        let path = PathBuf::from(p);
        if path.exists() {
            return Some(path);
        }
    }
    // Walk up from cwd looking for the sidecar build output.
    let mut cur = std::env::current_dir().ok()?;
    for _ in 0..6 {
        let candidate = cur.join("sidecar/dist/sage.js");
        if candidate.exists() {
            return Some(candidate);
        }
        if !cur.pop() {
            break;
        }
    }
    None
}

fn prompts_dir() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("SAGE_PROMPTS_DIR") {
        return Some(PathBuf::from(p));
    }
    let mut cur = std::env::current_dir().ok()?;
    for _ in 0..6 {
        let candidate = cur.join("prompts");
        if candidate.exists() {
            return Some(candidate);
        }
        if !cur.pop() {
            break;
        }
    }
    None
}

/// Spawn the sidecar and wire its stdout/stderr to the Tauri event
/// bus. Called once at app setup; safe to call again later if we want
/// to restart it (not implemented yet).
pub async fn spawn(app: AppHandle) -> Result<(), String> {
    let path = sidecar_path().ok_or_else(|| {
        "sage sidecar not found — run `npm run build` in ./sidecar".to_string()
    })?;

    let mut cmd = Command::new("node");
    cmd.arg(&path);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(p) = prompts_dir() {
        cmd.env("SAGE_PROMPTS_DIR", p);
    }
    cmd.kill_on_drop(true);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("spawn sage sidecar: {e}"))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "sidecar stdin not piped".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "sidecar stdout not piped".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "sidecar stderr not piped".to_string())?;

    // Save the stdin handle for command writes.
    {
        let state: State<SidecarState> = app.state();
        *state.stdin.lock().await = Some(stdin);
    }

    // stdout reader → emit to renderer.
    let app_clone = app.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            match serde_json::from_str::<serde_json::Value>(&line) {
                Ok(value) => {
                    let _ = app_clone.emit("sage://event", value);
                }
                Err(err) => {
                    log::warn!("sidecar non-JSON stdout: {err} :: {line}");
                }
            }
        }
        log::info!("sage sidecar stdout closed");
    });

    // stderr reader → log only (the renderer doesn't need it).
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            log::info!("[sage stderr] {line}");
        }
    });

    // Reap the child when it exits.
    tokio::spawn(async move {
        match child.wait().await {
            Ok(status) => log::warn!("sage sidecar exited: {status}"),
            Err(err) => log::warn!("sage sidecar wait failed: {err}"),
        }
    });

    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
struct InterrogateRequest<'a> {
    id: &'a str,
    #[serde(rename = "type")]
    kind: &'static str,
    sage: &'a str,
    text: &'a str,
}

/// Renderer entry point. Generates an opaque id for this turn, writes
/// the request to the sidecar's stdin, and returns the id so the
/// renderer can correlate the streaming events.
#[tauri::command]
pub async fn sage_interrogate(
    state: State<'_, SidecarState>,
    id: String,
    sage: String,
    text: String,
) -> Result<String, String> {
    if !matches!(sage.as_str(), "em" | "sis" | "pra" | "cri") {
        return Err(format!("unknown sage: {sage}"));
    }

    let payload = InterrogateRequest {
        id: &id,
        kind: "interrogate",
        sage: &sage,
        text: &text,
    };
    let mut line = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    line.push('\n');

    let mut stdin_guard = state.stdin.lock().await;
    let stdin = stdin_guard
        .as_mut()
        .ok_or_else(|| "sage sidecar is not running".to_string())?;
    stdin
        .write_all(line.as_bytes())
        .await
        .map_err(|e| format!("write to sidecar: {e}"))?;
    stdin.flush().await.map_err(|e| format!("flush sidecar: {e}"))?;

    Ok(id)
}

/// Convenience for the renderer / tests.
#[tauri::command]
pub async fn sage_ping(
    state: State<'_, SidecarState>,
    id: String,
) -> Result<String, String> {
    let line = format!("{{\"id\":\"{}\",\"type\":\"ping\"}}\n", id);
    let mut stdin_guard = state.stdin.lock().await;
    let stdin = stdin_guard
        .as_mut()
        .ok_or_else(|| "sage sidecar is not running".to_string())?;
    stdin
        .write_all(line.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    stdin.flush().await.map_err(|e| e.to_string())?;
    Ok(id)
}

