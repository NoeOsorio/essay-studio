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
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStdin, Command};
use tokio::sync::Mutex;

#[derive(Default)]
pub struct SidecarState {
    /// Channel to the child's stdin. `None` if the child failed to spawn.
    pub stdin: Mutex<Option<ChildStdin>>,
    /// Last known health of the sidecar process. Mirrored to the
    /// `sage://status` Tauri event whenever it transitions, and
    /// queryable via the `sage_status` command (lets a renderer that
    /// mounts after the initial event still learn the current state).
    pub status: Mutex<SidecarStatus>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "lowercase", tag = "state")]
pub enum SidecarStatus {
    /// Sidecar has not been spawned yet (boot window).
    #[default]
    Unknown,
    /// Sidecar process is alive and stdin is wired up.
    Up,
    /// Spawn failed or process exited. `message` is human-readable
    /// (shown to the user verbatim in the banner).
    Down { message: String },
}

/// Resolve where the compiled `sage.js` lives. We try, in order:
/// 1. `SAGE_SIDECAR_PATH` env var (explicit override for dev / CI).
/// 2. The bundled resource (`Resources/_up_/sidecar/dist/sage.js` inside
///    the `.app`) — this is the production path; it works because
///    `tauri.conf.json` declares `bundle.resources` pointing at the
///    sidecar build output.
/// 3. Walk up from `cwd` (dev fallback: when running `tauri dev` the
///    cwd is `src-tauri/`, so a few hops find the repo root).
///
/// Returning `None` means the sidecar can't be located and `spawn` will
/// fail loudly; the renderer surfaces this as a banner.
fn sidecar_path(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("SAGE_SIDECAR_PATH") {
        let path = PathBuf::from(p);
        if path.exists() {
            return Some(path);
        }
    }
    if let Ok(p) = app
        .path()
        .resolve("../sidecar/dist/sage.js", BaseDirectory::Resource)
    {
        if p.exists() {
            return Some(p);
        }
    }
    let cur = std::env::current_dir().ok()?;
    find_walking_up(&cur, "sidecar/dist/sage.js", 6)
}

/// Walk up from `start` looking for `start/<segments>`, `start/../<segments>`,
/// etc. Used in dev to find the repo root from wherever Tauri ran us.
/// Pulled out as a free function so the unit tests can hit it without
/// having to mock an `AppHandle`.
fn find_walking_up(start: &Path, segments: &str, max_hops: usize) -> Option<PathBuf> {
    let mut cur = start.to_path_buf();
    for _ in 0..max_hops {
        let candidate = cur.join(segments);
        if candidate.exists() {
            return Some(candidate);
        }
        if !cur.pop() {
            break;
        }
    }
    None
}

/// Locate a usable `node` binary.
///
/// Sesión 18: apps de macOS lanzadas desde Finder/Dock NO heredan el
/// PATH del shell del usuario — arrancan con el PATH mínimo de
/// `launchd` (`/usr/bin:/bin:/usr/sbin:/sbin`). Como la mayoría de
/// la gente instala Node con nvm/homebrew/volta (ninguno de esos
/// dirs está en ese PATH), `Command::new("node")` fallaba con ENOENT
/// y el consejo nunca arrancaba desde el `.app` bundleado — aunque
/// funcionara perfecto en `tauri:dev` (que hereda el PATH de la
/// terminal).
///
/// Capas, en orden:
///   1. `SAGE_NODE_PATH` — override explícito (CI, setups raros).
///   2. El `PATH` del proceso — cubre dev y "abrí la app desde la
///      terminal con `open`", donde el PATH sí viene poblado.
///   3. Ubicaciones conocidas — homebrew (arm64 + intel), nvm
///      (versión más alta instalada), volta, fnm, asdf, /usr/local.
///   4. Preguntarle al login shell del usuario (`$SHELL -lc
///      'command -v node'`). Respeta cualquier setup exótico que
///      el usuario tenga en su `.zshrc` / `.zprofile`.
///
/// Devolver `None` significa "no hay Node en esta máquina" y el
/// banner del renderer se lo dice al usuario con el detalle.
fn resolve_node() -> Option<PathBuf> {
    // 1. Override explícito.
    if let Ok(p) = std::env::var("SAGE_NODE_PATH") {
        let path = PathBuf::from(p);
        if is_executable(&path) {
            return Some(path);
        }
    }

    // 2. PATH del proceso.
    if let Some(p) = find_in_path("node") {
        return Some(p);
    }

    // 3. Ubicaciones conocidas.
    let home = std::env::var("HOME").unwrap_or_default();
    let fixed_candidates = [
        // Homebrew: Apple Silicon primero, después Intel.
        PathBuf::from("/opt/homebrew/bin/node"),
        PathBuf::from("/usr/local/bin/node"),
        // Volta y asdf shims.
        PathBuf::from(format!("{home}/.volta/bin/node")),
        PathBuf::from(format!("{home}/.asdf/shims/node")),
        // Linux distro default (por si algún día empacamos ahí).
        PathBuf::from("/usr/bin/node"),
    ];
    for candidate in &fixed_candidates {
        if is_executable(candidate) {
            return Some(candidate.clone());
        }
    }
    // Version managers que guardan un dir por versión: elegimos la
    // más alta instalada en lugar de la primera que aparezca en el
    // read_dir (que viene en orden arbitrario del filesystem).
    for versions_root in [
        format!("{home}/.nvm/versions/node"),
        format!("{home}/Library/Application Support/fnm/node-versions"),
        format!("{home}/.local/share/fnm/node-versions"),
    ] {
        if let Some(p) = newest_versioned_node(Path::new(&versions_root)) {
            return Some(p);
        }
    }

    // 4. Preguntarle al login shell. Última capa porque cuesta
    //    ~100-300ms (carga el profile del usuario) y las anteriores
    //    cubren el 99% de los casos.
    if let Some(p) = ask_login_shell_for_node() {
        return Some(p);
    }

    None
}

fn is_executable(path: &Path) -> bool {
    // `metadata()` sigue symlinks, que es lo que queremos: los shims
    // de nvm/volta suelen serlo.
    path.metadata().map(|m| m.is_file()).unwrap_or(false)
}

/// Busca un binario recorriendo el `PATH` del proceso actual.
fn find_in_path(bin: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    std::env::split_paths(&path_var)
        .map(|dir| dir.join(bin))
        .find(|candidate| is_executable(candidate))
}

/// Dado un dir tipo `~/.nvm/versions/node`, devuelve el
/// `<version>/bin/node` de la versión más alta instalada. Ordena por
/// semver numérico — un sort lexicográfico pondría `v9.x` por encima
/// de `v22.x`, que es justo al revés de lo que queremos.
fn newest_versioned_node(versions_root: &Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(versions_root).ok()?;
    let mut best: Option<((u64, u64, u64), PathBuf)> = None;
    for entry in entries.flatten() {
        let node_bin = entry.path().join("bin/node");
        if !is_executable(&node_bin) {
            continue;
        }
        let name = entry.file_name();
        let version = parse_semver(&name.to_string_lossy()).unwrap_or((0, 0, 0));
        let is_better = match &best {
            Some((best_version, _)) => version > *best_version,
            None => true,
        };
        if is_better {
            best = Some((version, node_bin));
        }
    }
    best.map(|(_, path)| path)
}

/// `"v22.17.0"` / `"22.17.0"` → `(22, 17, 0)`. Devuelve `None` si el
/// nombre no parsea como versión.
fn parse_semver(raw: &str) -> Option<(u64, u64, u64)> {
    let cleaned = raw.trim_start_matches('v');
    let mut parts = cleaned.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0);
    let patch = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0);
    Some((major, minor, patch))
}

/// PATH para el proceso hijo: el dir del node resuelto primero, luego
/// los bins habituales de macOS, luego lo que hubiera heredado el
/// proceso. Dedupe preservando el orden para no armar un PATH gigante
/// con repetidos.
fn enriched_path(node: &Path) -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let mut dirs: Vec<PathBuf> = Vec::new();

    if let Some(node_dir) = node.parent() {
        dirs.push(node_dir.to_path_buf());
    }
    dirs.extend(
        [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
        ]
        .iter()
        .map(PathBuf::from),
    );
    dirs.push(PathBuf::from(format!("{home}/.volta/bin")));
    if let Some(inherited) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&inherited));
    }

    let mut seen = std::collections::HashSet::new();
    let unique: Vec<PathBuf> = dirs
        .into_iter()
        .filter(|d| seen.insert(d.clone()))
        .collect();
    std::env::join_paths(unique)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "/usr/bin:/bin".to_string())
}

/// Último recurso: preguntarle al login shell del usuario dónde está
/// su `node`. Un login shell (`-l`) carga `.zprofile`/`.bash_profile`,
/// que es donde nvm/fnm/asdf se inicializan.
fn ask_login_shell_for_node() -> Option<PathBuf> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let output = std::process::Command::new(shell)
        .args(["-lc", "command -v node"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let found = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if found.is_empty() {
        return None;
    }
    let path = PathBuf::from(found);
    is_executable(&path).then_some(path)
}

/// Same resolution strategy as `sidecar_path` but for the `prompts/`
/// dir. In production the dir lives at `Resources/_up_/prompts/`
/// because `tauri.conf.json` declares `../prompts/*.md` as resources;
/// Tauri preserves the directory structure relative to the config dir.
fn prompts_dir(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("SAGE_PROMPTS_DIR") {
        return Some(PathBuf::from(p));
    }
    if let Ok(p) = app.path().resolve("../prompts", BaseDirectory::Resource) {
        if p.exists() {
            return Some(p);
        }
    }
    let cur = std::env::current_dir().ok()?;
    find_walking_up(&cur, "prompts", 6)
}

/// Update the cached status and broadcast it to the renderer. Idempotent.
async fn set_status(app: &AppHandle, status: SidecarStatus) {
    {
        let state: State<SidecarState> = app.state();
        *state.status.lock().await = status.clone();
    }
    let _ = app.emit("sage://status", &status);
}

/// Spawn the sidecar and wire its stdout/stderr to the Tauri event
/// bus. Called once at app setup; safe to call again later if we want
/// to restart it (not implemented yet). Emits `sage://status` Up on
/// success, Down on any failure (and on later exit, via the reap task).
pub async fn spawn(app: AppHandle) -> Result<(), String> {
    let path = match sidecar_path(&app) {
        Some(p) => p,
        None => {
            let msg = "No encontramos `sage.js` — el consejo no podrá responder. Reconstruí la app con `npm run tauri:build:full`.".to_string();
            set_status(&app, SidecarStatus::Down { message: msg.clone() }).await;
            return Err(msg);
        }
    };

    // Resolver el binario de Node antes de spawnear. Ver
    // `resolve_node` para por qué no alcanza con `Command::new("node")`
    // cuando la app se abre desde Finder/Dock.
    let node = match resolve_node() {
        Some(n) => n,
        None => {
            let msg = "No encontramos Node.js en esta Mac. El consejo necesita Node 20+ para correr. Instalalo desde nodejs.org (o con Homebrew: `brew install node`) y reabrí la app.".to_string();
            log::error!("node not found in PATH nor well-known locations");
            set_status(&app, SidecarStatus::Down { message: msg.clone() }).await;
            return Err(msg);
        }
    };
    log::info!("using node at {}", node.display());

    let mut cmd = Command::new(&node);
    cmd.arg(&path);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(p) = prompts_dir(&app) {
        cmd.env("SAGE_PROMPTS_DIR", p);
    }
    // El PATH heredado desde Finder/Dock es mínimo. Le anteponemos el
    // dir del node que resolvimos + los bins habituales para que
    // cualquier subproceso que el Agent SDK necesite (git, el binario
    // `claude`, etc.) también los encuentre.
    cmd.env("PATH", enriched_path(&node));
    cmd.kill_on_drop(true);

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let msg = format!(
                "No pudimos arrancar el consejo con Node en {}. Detalle: {e}",
                node.display()
            );
            set_status(&app, SidecarStatus::Down { message: msg.clone() }).await;
            return Err(msg);
        }
    };

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
    set_status(&app, SidecarStatus::Up).await;

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

    // Reap the child when it exits. If the process dies after a
    // successful spawn, drop stdin and broadcast "down" so the
    // renderer can offer a Reintentar CTA (sesión 11).
    let app_reap = app.clone();
    tokio::spawn(async move {
        let exit = match child.wait().await {
            Ok(status) => {
                log::warn!("sage sidecar exited: {status}");
                format!("El consejo cerró inesperadamente ({status}). Reiniciá la app.")
            }
            Err(err) => {
                log::warn!("sage sidecar wait failed: {err}");
                format!("El consejo se desconectó: {err}. Reiniciá la app.")
            }
        };
        {
            let state: State<SidecarState> = app_reap.state();
            *state.stdin.lock().await = None;
        }
        set_status(&app_reap, SidecarStatus::Down { message: exit }).await;
    });

    Ok(())
}

/// Query the cached sidecar status. The renderer calls this on mount
/// so it can render the banner even if the initial `sage://status`
/// event fired before its listener was attached.
#[tauri::command]
pub async fn sage_status(
    state: State<'_, SidecarState>,
) -> Result<SidecarStatus, String> {
    Ok(state.status.lock().await.clone())
}

#[derive(Debug, Serialize, Deserialize)]
struct InterrogateRequest<'a> {
    id: &'a str,
    #[serde(rename = "type")]
    kind: &'static str,
    sage: &'a str,
    text: &'a str,
    /// Output language for the sage's response. Optional — sidecar
    /// defaults to "es" when absent.
    #[serde(skip_serializing_if = "Option::is_none")]
    language: Option<&'a str>,
}

#[derive(Debug, Serialize)]
struct CritiqueRequest<'a> {
    id: &'a str,
    #[serde(rename = "type")]
    kind: &'static str,
    sage: &'a str,
    pase: &'a str,
    text: &'a str,
    /// Optional rubric criterios. Forwarded verbatim to the sidecar so
    /// the sage can attribute anotaciones to a criterio.
    #[serde(skip_serializing_if = "Option::is_none")]
    rubrica: Option<&'a serde_json::Value>,
    /// Optional library of sources the council should read as context.
    #[serde(skip_serializing_if = "Option::is_none")]
    fuentes: Option<&'a serde_json::Value>,
    /// Output language. Optional — sidecar defaults to "es".
    #[serde(skip_serializing_if = "Option::is_none")]
    language: Option<&'a str>,
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
    language: Option<String>,
) -> Result<String, String> {
    if !matches!(sage.as_str(), "em" | "sis" | "pra" | "cri") {
        return Err(format!("unknown sage: {sage}"));
    }
    if let Some(l) = language.as_deref() {
        if !matches!(l, "es" | "en") {
            return Err(format!("unknown language: {l}"));
        }
    }

    let payload = InterrogateRequest {
        id: &id,
        kind: "interrogate",
        sage: &sage,
        text: &text,
        language: language.as_deref(),
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

/// Renderer entry point for Pluma Roja. Forwards a critique request to
/// the sidecar; streaming events come back via the shared `sage://event`
/// channel just like interrogations.
#[tauri::command]
pub async fn sage_critique(
    state: State<'_, SidecarState>,
    id: String,
    sage: String,
    pase: String,
    text: String,
    rubrica: Option<serde_json::Value>,
    fuentes: Option<serde_json::Value>,
    language: Option<String>,
) -> Result<String, String> {
    if !matches!(sage.as_str(), "em" | "sis" | "pra" | "cri") {
        return Err(format!("unknown sage: {sage}"));
    }
    if !matches!(
        pase.as_str(),
        "coherencia" | "estilo" | "argumento" | "apa"
    ) {
        return Err(format!("unknown pase: {pase}"));
    }
    if let Some(l) = language.as_deref() {
        if !matches!(l, "es" | "en") {
            return Err(format!("unknown language: {l}"));
        }
    }

    let payload = CritiqueRequest {
        id: &id,
        kind: "critique",
        sage: &sage,
        pase: &pase,
        text: &text,
        rubrica: rubrica.as_ref(),
        fuentes: fuentes.as_ref(),
        language: language.as_deref(),
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

// --------- Tests ---------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_dir() -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "essay-studio-sidecar-test-{}-{n}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("mkdir tmp");
        dir
    }

    #[test]
    fn walks_up_to_find_target_one_hop() {
        let root = temp_dir();
        let target_dir = root.join("sidecar/dist");
        fs::create_dir_all(&target_dir).unwrap();
        fs::write(target_dir.join("sage.js"), b"// stub").unwrap();
        let start = root.join("src-tauri");
        fs::create_dir_all(&start).unwrap();

        let found = find_walking_up(&start, "sidecar/dist/sage.js", 6)
            .expect("found via one pop");
        assert!(found.ends_with("sidecar/dist/sage.js"));
        assert!(found.exists());
    }

    #[test]
    fn walks_up_finds_target_at_start() {
        let root = temp_dir();
        let dir = root.join("prompts");
        fs::create_dir_all(&dir).unwrap();
        let found = find_walking_up(&root, "prompts", 6).expect("found at start");
        assert!(found.ends_with("prompts"));
    }

    #[test]
    fn returns_none_when_target_missing() {
        let root = temp_dir();
        let start = root.join("a/b/c");
        fs::create_dir_all(&start).unwrap();
        let found = find_walking_up(&start, "does-not-exist.js", 6);
        assert!(found.is_none());
    }

    #[test]
    fn stops_after_max_hops() {
        // Put the target high up; start very deep; cap hops below the gap.
        let root = temp_dir();
        let target_dir = root.join("prompts");
        fs::create_dir_all(&target_dir).unwrap();
        let start = root.join("a/b/c/d/e/f/g/h");
        fs::create_dir_all(&start).unwrap();

        // 2 hops can't reach root from h/g/f/e/d/c/b/a (needs 8 pops).
        let found = find_walking_up(&start, "prompts", 2);
        assert!(found.is_none());
    }

    // --- Node resolution (sesión 18) ---

    #[test]
    fn parses_node_version_strings() {
        assert_eq!(parse_semver("v22.17.0"), Some((22, 17, 0)));
        assert_eq!(parse_semver("22.17.0"), Some((22, 17, 0)));
        assert_eq!(parse_semver("v20"), Some((20, 0, 0)));
        assert_eq!(parse_semver("v18.1"), Some((18, 1, 0)));
        assert_eq!(parse_semver("not-a-version"), None);
    }

    #[test]
    fn picks_highest_node_version_not_lexicographic_first() {
        // El bug que este test previene: ordenar por string pondría
        // "v9.0.0" por encima de "v22.17.0" porque '9' > '2'.
        let root = temp_dir();
        for version in ["v9.0.0", "v22.17.0", "v22.16.0", "v18.20.4"] {
            let bin_dir = root.join(version).join("bin");
            fs::create_dir_all(&bin_dir).unwrap();
            fs::write(bin_dir.join("node"), b"#!/bin/sh\n").unwrap();
        }
        let found = newest_versioned_node(&root).expect("should find one");
        assert!(
            found.to_string_lossy().contains("v22.17.0"),
            "expected v22.17.0, got {}",
            found.display()
        );
    }

    #[test]
    fn versioned_node_lookup_skips_dirs_without_binary() {
        let root = temp_dir();
        // Versión más alta pero SIN bin/node — no debe ganar.
        fs::create_dir_all(root.join("v23.0.0")).unwrap();
        let ok_bin = root.join("v20.11.0").join("bin");
        fs::create_dir_all(&ok_bin).unwrap();
        fs::write(ok_bin.join("node"), b"#!/bin/sh\n").unwrap();

        let found = newest_versioned_node(&root).expect("should find v20");
        assert!(found.to_string_lossy().contains("v20.11.0"));
    }

    #[test]
    fn versioned_node_lookup_on_missing_dir_is_none() {
        let root = temp_dir().join("does-not-exist");
        assert!(newest_versioned_node(&root).is_none());
    }

    #[test]
    fn enriched_path_puts_node_dir_first_and_dedupes() {
        let node = PathBuf::from("/opt/homebrew/bin/node");
        let path = enriched_path(&node);
        let entries: Vec<&str> = path.split(':').collect();

        assert_eq!(
            entries.first().copied(),
            Some("/opt/homebrew/bin"),
            "el dir del node resuelto va primero"
        );
        // Los bins base tienen que estar presentes.
        assert!(entries.contains(&"/usr/bin"));
        assert!(entries.contains(&"/bin"));
        // Sin duplicados — /opt/homebrew/bin aparecería dos veces
        // (como parent del node y como candidato fijo) sin el dedupe.
        let homebrew_count = entries
            .iter()
            .filter(|e| **e == "/opt/homebrew/bin")
            .count();
        assert_eq!(homebrew_count, 1, "PATH no debe tener repetidos");
    }

    #[test]
    fn sidecar_status_serializes_with_state_tag() {
        // The renderer's hook switches on `status.state`. Lock the shape
        // so a future serde refactor doesn't silently break the banner.
        let up = serde_json::to_value(&SidecarStatus::Up).unwrap();
        assert_eq!(up, serde_json::json!({ "state": "up" }));

        let unknown = serde_json::to_value(&SidecarStatus::Unknown).unwrap();
        assert_eq!(unknown, serde_json::json!({ "state": "unknown" }));

        let down = serde_json::to_value(&SidecarStatus::Down {
            message: "node missing".to_string(),
        })
        .unwrap();
        assert_eq!(
            down,
            serde_json::json!({ "state": "down", "message": "node missing" })
        );
    }
}

