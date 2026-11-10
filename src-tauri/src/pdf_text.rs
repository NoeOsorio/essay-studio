// PDF text extraction on the Mac, with no file access offered to the renderer.
//
// The renderer sends the raw bytes of one PDF. We write them to a private temp
// file, hand its path to a fixed PDFKit script run by `/usr/bin/osascript`
// (its own process, so a hostile file cannot take the app down), and answer
// with one string per page. Names and text are never logged.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, SystemTime};
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

/// Beyond this a PDF is nearly always a scan; the file sits in webview and Rust memory during import.
pub const MAX_PDF_BYTES: usize = 50 * 1024 * 1024;
/// A hostile or broken file must not hold a process forever (247 pages took about 1 s).
const PDF_TIMEOUT: Duration = Duration::from_secs(60);
/// Text for 1000 pages stays far below this; a larger answer is not a document.
const MAX_STDOUT_BYTES: u64 = 16 * 1024 * 1024;
/// A crash must not strand a private document in the cache.
const STALE_AFTER: Duration = Duration::from_secs(60 * 60);
const SCRIPT: &str = include_str!("pdf_extract.js");

#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum PdfTextResult {
    Ok { pages: u64, text: Vec<String> },
    NoText { pages: u64 },
    Locked,
    Unreadable,
    TooLarge,
}

/// Deletes the temp file on every exit path, including a dropped future.
struct TempFile(PathBuf);
impl Drop for TempFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn has_pdf_header(bytes: &[u8]) -> bool {
    let head = &bytes[..bytes.len().min(1024)];
    head.windows(5).any(|w| w == b"%PDF-")
}

/// Remove leftovers older than `STALE_AFTER`. Best effort.
fn sweep_stale(dir: &Path, now: SystemTime) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("pdf") {
            continue;
        }
        let old = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|m| now.duration_since(m).ok())
            .map(|age| age > STALE_AFTER)
            .unwrap_or(false);
        if old {
            let _ = std::fs::remove_file(path);
        }
    }
}

fn write_private(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(bytes)?;
    file.flush()
}

/// JXA can return the page count as a number or as a string.
fn tolerant_u64(value: &serde_json::Value) -> Option<u64> {
    match value {
        serde_json::Value::Number(n) => n
            .as_u64()
            .or_else(|| n.as_f64().filter(|f| f.is_finite() && *f >= 0.0).map(|f| f as u64)),
        serde_json::Value::String(s) => s.trim().parse::<f64>().ok().filter(|f| f.is_finite() && *f >= 0.0).map(|f| f as u64),
        _ => None,
    }
}

/// Turn the script's stdout into a result. Anything unexpected is `Unreadable`.
fn parse_script_output(stdout: &str) -> PdfTextResult {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(stdout.trim()) else {
        return PdfTextResult::Unreadable;
    };
    match value.get("state").and_then(|s| s.as_str()) {
        Some("locked") => PdfTextResult::Locked,
        Some("ok") => {
            let Some(pages) = value.get("pages").and_then(tolerant_u64) else {
                return PdfTextResult::Unreadable;
            };
            let Some(items) = value.get("text").and_then(|t| t.as_array()) else {
                return PdfTextResult::Unreadable;
            };
            let text: Vec<String> = items
                .iter()
                .map(|v| v.as_str().unwrap_or("").to_string())
                .collect();
            if pages == 0 || text.len() as u64 != pages {
                return PdfTextResult::Unreadable;
            }
            if text.iter().all(|p| p.trim().is_empty()) {
                return PdfTextResult::NoText { pages };
            }
            PdfTextResult::Ok { pages, text }
        }
        _ => PdfTextResult::Unreadable,
    }
}

#[cfg(target_os = "macos")]
async fn run_script(path: &Path) -> PdfTextResult {
    let mut command = Command::new("/usr/bin/osascript");
    command
        .args(["-l", "JavaScript", "-"])
        .arg(path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    let Ok(mut child) = command.spawn() else {
        return PdfTextResult::Unreadable;
    };
    let (Some(mut stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
        return PdfTextResult::Unreadable;
    };
    let work = async {
        // The script is small; writing then closing stdin cannot deadlock against stdout.
        if stdin.write_all(SCRIPT.as_bytes()).await.is_err() {
            return PdfTextResult::Unreadable;
        }
        drop(stdin);
        let mut buf = Vec::new();
        if stdout.take(MAX_STDOUT_BYTES + 1).read_to_end(&mut buf).await.is_err() || buf.len() as u64 > MAX_STDOUT_BYTES {
            return PdfTextResult::Unreadable;
        }
        match child.wait().await {
            Ok(status) if status.success() => {}
            _ => return PdfTextResult::Unreadable,
        }
        match String::from_utf8(buf) {
            Ok(text) => parse_script_output(&text),
            Err(_) => PdfTextResult::Unreadable,
        }
    };
    // On timeout the future is dropped, and kill_on_drop ends the child.
    tokio::time::timeout(PDF_TIMEOUT, work).await.unwrap_or(PdfTextResult::Unreadable)
}

#[cfg(not(target_os = "macos"))]
async fn run_script(_path: &Path) -> PdfTextResult {
    let _ = (SCRIPT, Stdio::null(), PDF_TIMEOUT, MAX_STDOUT_BYTES);
    PdfTextResult::Unreadable
}

/// Everything except locating the cache directory, so tests can drive it.
async fn extract_in(dir: &Path, bytes: &[u8]) -> PdfTextResult {
    if bytes.len() > MAX_PDF_BYTES {
        return PdfTextResult::TooLarge;
    }
    if !has_pdf_header(bytes) {
        return PdfTextResult::Unreadable;
    }
    if std::fs::create_dir_all(dir).is_err() {
        return PdfTextResult::Unreadable;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700));
    }
    sweep_stale(dir, SystemTime::now());
    let path = dir.join(format!("{}.pdf", uuid::Uuid::new_v4()));
    let guard = TempFile(path.clone());
    let owned = bytes.to_vec();
    let write_path = path.clone();
    let written = tokio::task::spawn_blocking(move || write_private(&write_path, &owned)).await;
    if !matches!(written, Ok(Ok(()))) {
        return PdfTextResult::Unreadable;
    }
    let result = run_script(&path).await;
    drop(guard);
    result
}

/// Raw body only: `invoke("pdf_extract_text", new Uint8Array(bytes))`. There is no path parameter.
#[tauri::command]
pub async fn pdf_extract_text(app: AppHandle, request: Request<'_>) -> Result<PdfTextResult, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw bytes".to_string());
    };
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|_| "no cache directory".to_string())?
        .join("pdf-import");
    Ok(extract_in(&dir, bytes).await)
}
