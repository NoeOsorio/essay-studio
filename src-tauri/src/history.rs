// Version history per essay. Append-only JSON-lines file alongside
// each essay's main `.json`:
//
//   $APPDATA/essays/<id>.json            ← current state (storage.rs)
//   $APPDATA/essays/<id>.history.jsonl   ← one snapshot per line (this)
//
// Each line is a complete `Snapshot { takenAt, kind, essay }`. The
// frontend never sees raw fs paths; it goes through the commands in
// this module.
//
// Retention policy is enforced at append time by `prune_in`: only the
// most recent `MAX_AUTO_SNAPSHOTS` of kind="auto" are kept, while
// every "close", "manual" and "before-restore" snapshot is preserved
// forever. That keeps the history panel readable for daily editors
// without ever losing an explicit save.

use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::storage::Essay;

/// Max number of `auto` snapshots kept per essay. Older autos are
/// dropped by `prune_in`. Explicit kinds (close/manual/before-restore)
/// are never dropped.
pub const MAX_AUTO_SNAPSHOTS: usize = 20;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct Snapshot {
    /// ISO 8601 timestamp; doubles as the version's stable id.
    #[serde(rename = "takenAt")]
    pub taken_at: String,
    pub kind: String,
    pub essay: Essay,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct SnapshotMeta {
    #[serde(rename = "takenAt")]
    pub taken_at: String,
    pub kind: String,
    #[serde(rename = "wordCount")]
    pub word_count: u32,
    pub title: String,
}

// --------- Pure logic (no Tauri runtime, easy to test) ---------

fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.contains('/')
        || id.contains('\\')
        || id.contains("..")
        || id.contains('\0')
    {
        return Err("invalid essay id".to_string());
    }
    Ok(())
}

fn validate_kind(kind: &str) -> Result<(), String> {
    match kind {
        "auto" | "close" | "manual" | "before-restore" => Ok(()),
        _ => Err(format!("unknown snapshot kind: {kind}")),
    }
}

fn history_file(dir: &Path, id: &str) -> Result<PathBuf, String> {
    validate_id(id)?;
    Ok(dir.join(format!("{id}.history.jsonl")))
}

/// Read every line and return the parsed `Snapshot`s. Corrupt lines
/// are skipped silently (one bad line shouldn't ghost the rest of the
/// history). Returned in file order; callers reverse for DESC.
fn read_all_snapshots(path: &Path) -> Result<Vec<Snapshot>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let f = fs::File::open(path).map_err(|e| format!("open history: {e}"))?;
    let reader = BufReader::new(f);
    let mut out = Vec::new();
    for line in reader.lines() {
        let line = match line {
            Ok(s) => s,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(snap) = serde_json::from_str::<Snapshot>(&line) {
            out.push(snap);
        }
    }
    Ok(out)
}

/// Walk every line and return just the metas. Cheaper than
/// `read_all_snapshots` because we don't materialize the essay's
/// content into a `serde_json::Value` tree per row.
pub fn list_in(dir: &Path, id: &str) -> Result<Vec<SnapshotMeta>, String> {
    let path = history_file(dir, id)?;
    let snaps = read_all_snapshots(&path)?;
    let mut metas: Vec<SnapshotMeta> = snaps
        .into_iter()
        .map(|s| SnapshotMeta {
            taken_at: s.taken_at,
            kind: s.kind,
            word_count: s.essay.word_count,
            title: s.essay.title,
        })
        .collect();
    metas.sort_by(|a, b| b.taken_at.cmp(&a.taken_at));
    Ok(metas)
}

/// Find and return the full snapshot for a given `takenAt`.
pub fn read_in(dir: &Path, id: &str, taken_at: &str) -> Result<Snapshot, String> {
    let path = history_file(dir, id)?;
    for snap in read_all_snapshots(&path)? {
        if snap.taken_at == taken_at {
            return Ok(snap);
        }
    }
    Err(format!("snapshot not found: {taken_at}"))
}

/// Append a new snapshot to the essay's history file. Idempotent on
/// `taken_at`: if a line with the same timestamp already exists, the
/// call is a no-op (lets the caller retry without dupes).
pub fn append_in(dir: &Path, snapshot: &Snapshot) -> Result<(), String> {
    validate_kind(&snapshot.kind)?;
    fs::create_dir_all(dir).map_err(|e| format!("create essays dir: {e}"))?;
    let path = history_file(dir, &snapshot.essay.id)?;

    // Idempotency check — cheap because we already scan for prune.
    let existing = read_all_snapshots(&path)?;
    if existing.iter().any(|s| s.taken_at == snapshot.taken_at) {
        return Ok(());
    }

    let mut line = serde_json::to_string(snapshot).map_err(|e| format!("serialize: {e}"))?;
    line.push('\n');

    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open history for append: {e}"))?;
    f.write_all(line.as_bytes())
        .map_err(|e| format!("write history line: {e}"))?;
    Ok(())
}

/// Rewrite the history file keeping only the most recent
/// `MAX_AUTO_SNAPSHOTS` snapshots of kind="auto" plus every non-auto
/// snapshot. Uses an atomic `tmp` → rename so a crash mid-prune
/// doesn't corrupt the file.
pub fn prune_in(dir: &Path, id: &str) -> Result<(), String> {
    let path = history_file(dir, id)?;
    if !path.exists() {
        return Ok(());
    }
    let mut all = read_all_snapshots(&path)?;
    // Sort by takenAt ASC so we drop oldest autos first.
    all.sort_by(|a, b| a.taken_at.cmp(&b.taken_at));

    // Build set of takenAt to keep.
    let auto_takenat: Vec<String> = all
        .iter()
        .filter(|s| s.kind == "auto")
        .map(|s| s.taken_at.clone())
        .collect();
    let drop_count = auto_takenat.len().saturating_sub(MAX_AUTO_SNAPSHOTS);
    let drop_set: std::collections::HashSet<&str> = auto_takenat
        .iter()
        .take(drop_count)
        .map(String::as_str)
        .collect();

    let kept: Vec<&Snapshot> = all.iter().filter(|s| !drop_set.contains(s.taken_at.as_str())).collect();

    // Same file means no work needed.
    if kept.len() == all.len() {
        return Ok(());
    }

    let tmp = path.with_extension("jsonl.tmp");
    {
        let mut f = fs::File::create(&tmp).map_err(|e| format!("create history tmp: {e}"))?;
        for snap in kept {
            let line = serde_json::to_string(snap).map_err(|e| format!("serialize: {e}"))?;
            f.write_all(line.as_bytes())
                .map_err(|e| format!("write history tmp: {e}"))?;
            f.write_all(b"\n").map_err(|e| format!("write history tmp: {e}"))?;
        }
    }
    fs::rename(&tmp, &path).map_err(|e| format!("rename history tmp: {e}"))?;
    Ok(())
}

/// Wipe an essay's history file. Called from storage when the essay
/// itself is deleted, so we don't leak history on a deleted id.
pub fn delete_in(dir: &Path, id: &str) -> Result<(), String> {
    let path = history_file(dir, id)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("delete history: {e}"))?;
    }
    Ok(())
}

// --------- Tauri command wrappers ---------

fn essays_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    path.push("essays");
    fs::create_dir_all(&path).map_err(|e| format!("create essays dir: {e}"))?;
    Ok(path)
}

#[tauri::command]
pub fn history_list(app: AppHandle, id: String) -> Result<Vec<SnapshotMeta>, String> {
    list_in(&essays_dir(&app)?, &id)
}

#[tauri::command]
pub fn history_read(
    app: AppHandle,
    id: String,
    taken_at: String,
) -> Result<Snapshot, String> {
    read_in(&essays_dir(&app)?, &id, &taken_at)
}

#[tauri::command]
pub fn history_append(app: AppHandle, snapshot: Snapshot) -> Result<(), String> {
    let dir = essays_dir(&app)?;
    append_in(&dir, &snapshot)?;
    // Prune after every append — cheap given the file size cap and
    // keeps the panel from accumulating dropped autos until the user
    // explicitly opens it.
    prune_in(&dir, &snapshot.essay.id)?;
    Ok(())
}

// --------- Tests ---------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::Essay;
    use serde_json::json;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_dir() -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "essay-studio-history-test-{}-{n}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("mkdir tmp");
        dir
    }

    fn sample_essay(id: &str, title: &str, words: u32, updated_at: &str) -> Essay {
        Essay {
            id: id.to_string(),
            title: title.to_string(),
            content: json!({
                "type": "doc",
                "content": [{
                    "type": "paragraph",
                    "content": [{ "type": "text", "text": "Edmondson definió…" }]
                }]
            }),
            board: None,
            interrogatorios: None,
            rubrica: None,
            fuentes: None,
            evaluacion_meta: None,
            language: None,
            mode: "academico".to_string(),
            word_count: words,
            created_at: "2026-05-09T20:00:00Z".to_string(),
            updated_at: updated_at.to_string(),
        }
    }

    fn snap(taken_at: &str, kind: &str, title: &str, words: u32) -> Snapshot {
        Snapshot {
            taken_at: taken_at.to_string(),
            kind: kind.to_string(),
            essay: sample_essay("a", title, words, taken_at),
        }
    }

    #[test]
    fn append_then_read_returns_full_snapshot() {
        let dir = temp_dir();
        let s = snap("2026-05-30T10:00:00Z", "manual", "v1", 100);
        append_in(&dir, &s).unwrap();

        let read = read_in(&dir, "a", "2026-05-30T10:00:00Z").unwrap();
        assert_eq!(read, s);
        assert_eq!(read.essay.title, "v1");
    }

    #[test]
    fn list_returns_metas_desc() {
        let dir = temp_dir();
        append_in(&dir, &snap("2026-05-30T10:00:00Z", "auto", "v1", 10)).unwrap();
        append_in(&dir, &snap("2026-05-30T12:00:00Z", "manual", "v3", 30)).unwrap();
        append_in(&dir, &snap("2026-05-30T11:00:00Z", "auto", "v2", 20)).unwrap();

        let metas = list_in(&dir, "a").unwrap();
        assert_eq!(metas.len(), 3);
        assert_eq!(metas[0].taken_at, "2026-05-30T12:00:00Z");
        assert_eq!(metas[0].kind, "manual");
        assert_eq!(metas[0].title, "v3");
        assert_eq!(metas[0].word_count, 30);
        assert_eq!(metas[2].taken_at, "2026-05-30T10:00:00Z");
    }

    #[test]
    fn list_on_missing_history_returns_empty() {
        let dir = temp_dir();
        let metas = list_in(&dir, "never-snapshot").unwrap();
        assert!(metas.is_empty());
    }

    #[test]
    fn append_is_idempotent_on_taken_at() {
        let dir = temp_dir();
        let s = snap("2026-05-30T10:00:00Z", "manual", "v1", 10);
        append_in(&dir, &s).unwrap();
        append_in(&dir, &s).unwrap();
        let metas = list_in(&dir, "a").unwrap();
        assert_eq!(metas.len(), 1);
    }

    #[test]
    fn prune_keeps_only_recent_autos_plus_all_explicit() {
        let dir = temp_dir();
        // 25 autos + 3 explicit, interleaved
        for i in 0..25 {
            let ts = format!("2026-05-30T{:02}:00:00Z", i);
            append_in(&dir, &snap(&ts, "auto", "auto-v", i as u32)).unwrap();
        }
        // `append_in` is the pure layer and doesn't prune; the
        // `history_append` Tauri command runs both. We test them
        // composed here.
        append_in(&dir, &snap("2026-05-30T26:00:00Z", "manual", "manual-v", 100)).unwrap();
        append_in(&dir, &snap("2026-05-30T27:00:00Z", "close", "close-v", 110)).unwrap();
        append_in(&dir, &snap("2026-05-30T28:00:00Z", "before-restore", "br-v", 120)).unwrap();
        prune_in(&dir, "a").unwrap();

        // After prune, only the most recent 20 autos remain + the
        // 3 explicit ones = 23 total.
        let metas = list_in(&dir, "a").unwrap();
        assert_eq!(metas.len(), 23);

        let auto_count = metas.iter().filter(|m| m.kind == "auto").count();
        let non_auto = metas.iter().filter(|m| m.kind != "auto").count();
        assert_eq!(auto_count, MAX_AUTO_SNAPSHOTS);
        assert_eq!(non_auto, 3);

        // The oldest 5 autos (hours 00-04) should be gone; the newest auto
        // we kept is hour 24.
        let kept_autos: Vec<&str> = metas
            .iter()
            .filter(|m| m.kind == "auto")
            .map(|m| m.taken_at.as_str())
            .collect();
        assert!(kept_autos.iter().any(|t| t == &"2026-05-30T24:00:00Z"));
        assert!(!kept_autos.iter().any(|t| t == &"2026-05-30T04:00:00Z"));
        assert!(!kept_autos.iter().any(|t| t == &"2026-05-30T00:00:00Z"));
    }

    #[test]
    fn prune_under_cap_is_noop() {
        let dir = temp_dir();
        append_in(&dir, &snap("2026-05-30T10:00:00Z", "auto", "v1", 10)).unwrap();
        append_in(&dir, &snap("2026-05-30T11:00:00Z", "auto", "v2", 20)).unwrap();
        prune_in(&dir, "a").unwrap();
        let metas = list_in(&dir, "a").unwrap();
        assert_eq!(metas.len(), 2);
    }

    #[test]
    fn invalid_kind_is_rejected() {
        let dir = temp_dir();
        let mut s = snap("2026-05-30T10:00:00Z", "auto", "v1", 10);
        s.kind = "bogus".to_string();
        assert!(append_in(&dir, &s).is_err());
    }

    #[test]
    fn read_missing_snapshot_errors() {
        let dir = temp_dir();
        append_in(&dir, &snap("2026-05-30T10:00:00Z", "manual", "v1", 10)).unwrap();
        let err = read_in(&dir, "a", "2030-01-01T00:00:00Z");
        assert!(err.is_err());
    }

    #[test]
    fn corrupt_line_is_skipped() {
        let dir = temp_dir();
        append_in(&dir, &snap("2026-05-30T10:00:00Z", "manual", "v1", 10)).unwrap();
        // Inject a garbage line directly into the file.
        let path = history_file(&dir, "a").unwrap();
        let mut f = OpenOptions::new().append(true).open(&path).unwrap();
        f.write_all(b"{ this is not json\n").unwrap();
        // The good snapshot should still come through.
        let metas = list_in(&dir, "a").unwrap();
        assert_eq!(metas.len(), 1);
    }

    #[test]
    fn delete_removes_history_and_is_idempotent() {
        let dir = temp_dir();
        append_in(&dir, &snap("2026-05-30T10:00:00Z", "manual", "v1", 10)).unwrap();
        delete_in(&dir, "a").unwrap();
        delete_in(&dir, "a").unwrap(); // idempotent
        assert!(list_in(&dir, "a").unwrap().is_empty());
    }

    #[test]
    fn rejects_invalid_essay_ids() {
        let dir = temp_dir();
        for bad in ["", "../escape", "with/slash", "back\\slash"] {
            let mut s = snap("2026-05-30T10:00:00Z", "auto", "v1", 10);
            s.essay.id = bad.to_string();
            assert!(append_in(&dir, &s).is_err());
            assert!(list_in(&dir, bad).is_err());
            assert!(read_in(&dir, bad, "2026-05-30T10:00:00Z").is_err());
            assert!(delete_in(&dir, bad).is_err());
        }
    }
}
