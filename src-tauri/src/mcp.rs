//! Authenticated, owner-only local IPC. Only the main renderer executes tools.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State, WebviewWindow};
use tokio::sync::{oneshot, watch, Mutex, Semaphore};

const MAX_REQUEST_BYTES: usize = 2 * 1024 * 1024;
// IPC resource budgets, not editing limits. New sessions reset deduplication.
const MAX_PENDING: usize = 16;
const MAX_CONNECTIONS: usize = 16;
const MAX_SESSION_REQUESTS: usize = 65_536;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const AUTH_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone, Default)]
pub struct McpState(Arc<Mutex<Inner>>);

#[derive(Default)]
struct Inner {
    initialized: bool,
    enabled: bool,
    working: bool,
    clients: usize,
    session_id: Option<String>,
    token: String,
    shutdown: Option<watch::Sender<bool>>,
    pending: HashMap<String, oneshot::Sender<Value>>,
    seen: HashSet<String>,
    directory: Option<PathBuf>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    enabled: bool,
    connected: bool,
    working: bool,
    session_id: Option<String>,
}

fn main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("MCP is restricted to the main window".into())
    }
}

#[tauri::command]
pub async fn mcp_status(
    window: WebviewWindow,
    state: State<'_, McpState>,
) -> Result<Status, String> {
    main_window(&window)?;
    let inner = state.0.lock().await;
    Ok(Status {
        enabled: inner.enabled,
        connected: inner.clients > 0,
        working: inner.working,
        session_id: inner.session_id.clone(),
    })
}

#[tauri::command]
pub async fn mcp_renderer_ready(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, McpState>,
) -> Result<(), String> {
    main_window(&window)?;
    let should_start = {
        let mut inner = state.0.lock().await;
        let first = !inner.initialized;
        inner.initialized = true;
        first
    };
    if should_start {
        enable(app, state.inner().clone()).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn mcp_set_enabled(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, McpState>,
    enabled: bool,
) -> Result<(), String> {
    main_window(&window)?;
    if enabled {
        enable(app, state.inner().clone()).await
    } else {
        disable(&app, &state).await;
        Ok(())
    }
}

#[tauri::command]
pub async fn mcp_set_working(
    window: WebviewWindow,
    state: State<'_, McpState>,
    working: bool,
) -> Result<(), String> {
    main_window(&window)?;
    let mut inner = state.0.lock().await;
    inner.working = working && inner.enabled;
    Ok(())
}

#[tauri::command]
pub async fn mcp_respond(
    window: WebviewWindow,
    state: State<'_, McpState>,
    response: Value,
) -> Result<(), String> {
    main_window(&window)?;
    let id = response
        .get("requestId")
        .and_then(Value::as_str)
        .ok_or("Missing request ID")?;
    if !response.get("ok").is_some_and(Value::is_boolean) {
        return Err("Invalid MCP response".into());
    }
    if let Some(sender) = state.0.lock().await.pending.remove(id) {
        let _ = sender.send(response);
    }
    Ok(())
}

async fn disable(app: &AppHandle, state: &McpState) {
    let mut inner = state.0.lock().await;
    inner.enabled = false;
    inner.working = false;
    inner.clients = 0;
    inner.session_id = None;
    inner.token.clear();
    if let Some(shutdown) = inner.shutdown.take() {
        let _ = shutdown.send(true);
    }
    inner.pending.clear();
    // The directory was created and validated by this process. Do not recurse.
    if let Some(dir) = inner.directory.take() {
        let _ = std::fs::remove_file(dir.join("connection.json"));
        let _ = std::fs::remove_file(dir.join("bridge.sock"));
    }
    let _ = app.emit_to("main", "mcp:session", json!({ "sessionId": null }));
}

#[cfg(not(target_os = "macos"))]
async fn enable(_app: AppHandle, _state: McpState) -> Result<(), String> {
    Err("The local MCP bridge currently requires macOS".into())
}

#[cfg(target_os = "macos")]
async fn enable(app: AppHandle, state: McpState) -> Result<(), String> {
    use std::fs::{DirBuilder, OpenOptions, Permissions};
    use std::io::Write;
    use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt};
    use tokio::net::UnixListener;

    let mut inner = state.0.lock().await;
    if inner.enabled {
        return Ok(());
    }
    let base = crate::storage::app_data_dir(&app)?;
    std::fs::create_dir_all(&base).map_err(|_| "Cannot create app data directory")?;
    let base = std::fs::canonicalize(base).map_err(|_| "Cannot resolve app data directory")?;
    let dir = base.join("mcp");
    if !dir.exists() {
        DirBuilder::new()
            .mode(0o700)
            .create(&dir)
            .map_err(|_| "Cannot create MCP directory")?;
    }
    let meta = std::fs::symlink_metadata(&dir).map_err(|_| "Cannot inspect MCP directory")?;
    // Compare ownership against the app data owner without calling libc.
    let base_meta = std::fs::metadata(&base).map_err(|_| "Cannot inspect app data")?;
    if !meta.is_dir()
        || meta.file_type().is_symlink()
        || meta.uid() != base_meta.uid()
        || meta.mode() & 0o077 != 0
    {
        return Err("MCP directory must be owner-only and cannot be a symlink".into());
    }
    let socket_path = dir.join("bridge.sock");
    // On macOS sockaddr_un.sun_path is 104 bytes including NUL.
    if socket_path.as_os_str().as_encoded_bytes().len() >= 104 {
        return Err("MCP socket path is too long; use a shorter app data directory".into());
    }
    if let Ok(meta) = std::fs::symlink_metadata(&socket_path) {
        use std::os::unix::fs::FileTypeExt;
        if !meta.file_type().is_socket() || meta.uid() != base_meta.uid() {
            return Err("Refusing to replace an unowned MCP socket".into());
        }
        // Another app instance must not lose its active listener.
        if std::os::unix::net::UnixStream::connect(&socket_path).is_ok() {
            return Err("Another Essay Studio instance owns the MCP bridge".into());
        }
        std::fs::remove_file(&socket_path).map_err(|_| "Cannot remove stale MCP socket")?;
    }
    let listener = UnixListener::bind(&socket_path).map_err(|_| "Cannot bind local MCP socket")?;
    std::fs::set_permissions(&socket_path, Permissions::from_mode(0o600))
        .map_err(|_| "Cannot protect MCP socket")?;
    let token = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    let session_id = uuid::Uuid::new_v4().to_string();
    let descriptor = dir.join("connection.json");
    if let Ok(meta) = std::fs::symlink_metadata(&descriptor) {
        if !meta.is_file() || meta.file_type().is_symlink() || meta.uid() != base_meta.uid() {
            return Err("Refusing unowned MCP descriptor".into());
        }
        std::fs::remove_file(&descriptor).map_err(|_| "Cannot replace stale MCP descriptor")?;
    }
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&descriptor)
        .map_err(|_| "Cannot create MCP descriptor")?;
    let bytes = serde_json::to_vec(&json!({ "protocolVersion": 1, "socketPath": socket_path, "token": token, "sessionId": session_id })).map_err(|_| "Cannot encode MCP descriptor")?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "Cannot save MCP descriptor")?;
    let (shutdown, mut shutdown_rx) = watch::channel(false);
    inner.enabled = true;
    inner.session_id = Some(session_id.clone());
    inner.token = token;
    inner.shutdown = Some(shutdown);
    inner.directory = Some(dir);
    inner.clients = 0;
    inner.seen.clear();
    drop(inner);
    let _ = app.emit_to("main", "mcp:session", json!({ "sessionId": session_id }));
    tauri::async_runtime::spawn(async move {
        let connections = Arc::new(Semaphore::new(MAX_CONNECTIONS));
        loop {
            tokio::select! {
                _ = shutdown_rx.changed() => break,
                incoming = listener.accept() => {
                    match incoming {
                        Ok((stream, _)) => {
                            let Ok(permit) = connections.clone().try_acquire_owned() else { continue; };
                            let state = state.clone(); let app = app.clone(); let rx = shutdown_rx.clone();
                            tauri::async_runtime::spawn(async move { let _permit = permit; serve(stream, app, state, rx).await; });
                        },
                        Err(_) => { disable(&app, &state).await; break; }
                    }
                }
            }
        }
    });
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WireRequest {
    token: String,
    session_id: String,
    request_id: String,
    name: String,
    args: Value,
}

fn failure(id: &str, code: &str, message: &str) -> Value {
    json!({ "requestId": id, "ok": false, "error": { "code": code, "message": message } })
}

#[cfg(target_os = "macos")]
async fn serve(
    stream: tokio::net::UnixStream,
    app: AppHandle,
    state: McpState,
    mut shutdown: watch::Receiver<bool>,
) {
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
    let (read, mut write) = stream.into_split();
    let mut read = BufReader::new(read);
    let mut authenticated_session: Option<String> = None;
    loop {
        let mut bytes = Vec::new();
        let read_line = async {
            (&mut read)
                .take((MAX_REQUEST_BYTES + 1) as u64)
                .read_until(b'\n', &mut bytes)
                .await
        };
        let result = if authenticated_session.is_some() {
            tokio::select! { _ = shutdown.changed() => break, result = read_line => result }
        } else {
            tokio::select! { _ = shutdown.changed() => break, result = tokio::time::timeout(AUTH_TIMEOUT, read_line) => match result { Ok(v) => v, Err(_) => break } }
        };
        if !matches!(result, Ok(n) if n > 0)
            || bytes.len() > MAX_REQUEST_BYTES
            || bytes.last() != Some(&b'\n')
        {
            break;
        }
        let request: WireRequest = match serde_json::from_slice(&bytes) {
            Ok(req) => req,
            Err(_) => break,
        };
        let mut inner = state.0.lock().await;
        if !inner.enabled
            || inner.session_id.as_deref() != Some(&request.session_id)
            || inner.token != request.token
        {
            drop(inner);
            let _ = write.write_all(b"{\"requestId\":\"\",\"ok\":false,\"error\":{\"code\":\"UNAUTHORIZED\",\"message\":\"Local MCP session is invalid.\"}}\n").await;
            break;
        }
        if authenticated_session.is_none() {
            inner.clients += 1;
            authenticated_session = Some(request.session_id.clone());
        }
        let valid_id = !request.request_id.is_empty()
            && request.request_id.len() <= 128
            && request
                .request_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-');
        let valid_name = !request.name.is_empty()
            && request.name.len() <= 64
            && request
                .name
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b == b'_');
        let rejected = if !valid_id || !valid_name || !request.args.is_object() {
            Some(failure(
                &request.request_id,
                "INVALID_REQUEST",
                "Invalid local MCP request.",
            ))
        } else if inner.seen.contains(&request.request_id) {
            Some(failure(&request.request_id, "DUPLICATE_REQUEST", "This request was already dispatched. Read current state; do not blindly repeat a mutation."))
        } else if inner.seen.len() >= MAX_SESSION_REQUESTS {
            Some(failure(
                &request.request_id,
                "SESSION_EXHAUSTED",
                "Reconnect MCP to reset its bounded request history.",
            ))
        } else if inner.pending.len() >= MAX_PENDING {
            Some(failure(
                &request.request_id,
                "BUSY",
                "Too many live MCP requests.",
            ))
        } else {
            None
        };
        let response = if let Some(response) = rejected {
            drop(inner);
            response
        } else {
            let (sender, receiver) = oneshot::channel();
            inner.seen.insert(request.request_id.clone());
            inner.pending.insert(request.request_id.clone(), sender);
            drop(inner);
            let payload = json!({ "sessionId": request.session_id, "requestId": request.request_id, "name": request.name, "args": request.args });
            if app.emit_to("main", "mcp:request", payload).is_err() {
                state.0.lock().await.pending.remove(&request.request_id);
                failure(
                    &request.request_id,
                    "DISCONNECTED",
                    "The live editor is unavailable.",
                )
            } else {
                let response = tokio::select! {
                    _ = shutdown.changed() => failure(&request.request_id, "SESSION_ENDED", "The local MCP session ended. Check current state before retrying."),
                    result = tokio::time::timeout(REQUEST_TIMEOUT, receiver) => match result {
                        Ok(Ok(response)) => response,
                        _ => failure(&request.request_id, "OUTCOME_UNKNOWN", "The renderer did not acknowledge in time. Read current state before retrying a mutation."),
                    }
                };
                state.0.lock().await.pending.remove(&request.request_id);
                response
            }
        };
        let Ok(mut encoded) = serde_json::to_vec(&response) else {
            break;
        };
        encoded.push(b'\n');
        if !matches!(
            tokio::time::timeout(REQUEST_TIMEOUT, write.write_all(&encoded)).await,
            Ok(Ok(()))
        ) {
            break;
        }
    }
    if let Some(session) = authenticated_session {
        let mut inner = state.0.lock().await;
        if inner.session_id.as_deref() == Some(&session) {
            inner.clients = inner.clients.saturating_sub(1);
        }
    }
}
