// Local storage for essays. One JSON file per essay under
// $APPDATA/essays/<id>.json. The frontend never sees raw fs paths
// — it only invokes the commands defined here.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct Essay {
    pub id: String,
    pub title: String,
    /// TipTap JSON document. We accept any valid JSON so the editor
    /// can evolve without Rust having to know the schema.
    pub content: serde_json::Value,
    /// Optional tldraw snapshot for the canvas pane. Opaque JSON.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub board: Option<serde_json::Value>,
    /// Cumulative interrogations by sages. Opaque to Rust beyond serde.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interrogatorios: Option<serde_json::Value>,
    /// Optional rubric (criterios) the council uses for critiques.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rubrica: Option<serde_json::Value>,
    /// Saved sources for this essay; Pluma Roja injects them into the
    /// critique prompt, and Lectura lets the user pick from them.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fuentes: Option<serde_json::Value>,
    /// Snapshot of the last Evaluar run on this essay (timestamp +
    /// pasadas that were covered). Drives the Benchmark's empty /
    /// partial-coverage / stale states.
    #[serde(
        default,
        rename = "evaluacionMeta",
        skip_serializing_if = "Option::is_none"
    )]
    pub evaluacion_meta: Option<serde_json::Value>,
    /// Language the user is writing the essay in. Optional for legacy
    /// essays (treated as "es" by the renderer when absent).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    pub mode: String,
    #[serde(rename = "wordCount", default)]
    pub word_count: u32,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct EssayMeta {
    pub id: String,
    pub title: String,
    pub mode: String,
    #[serde(rename = "wordCount")]
    pub word_count: u32,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

// --------- Pure logic (independent of Tauri runtime, easy to test) ---------

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

fn essay_file(dir: &Path, id: &str) -> Result<PathBuf, String> {
    validate_id(id)?;
    Ok(dir.join(format!("{id}.json")))
}

pub fn list_in(dir: &Path) -> Result<Vec<EssayMeta>, String> {
    fs::create_dir_all(dir).map_err(|e| format!("create essays dir: {e}"))?;
    let mut metas: Vec<EssayMeta> = Vec::new();

    let entries = fs::read_dir(dir).map_err(|e| format!("read essays dir: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let raw = match fs::read_to_string(&path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        if let Ok(essay) = serde_json::from_str::<Essay>(&raw) {
            metas.push(EssayMeta {
                id: essay.id,
                title: essay.title,
                mode: essay.mode,
                word_count: essay.word_count,
                created_at: essay.created_at,
                updated_at: essay.updated_at,
            });
        }
    }
    metas.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(metas)
}

pub fn read_in(dir: &Path, id: &str) -> Result<Essay, String> {
    let path = essay_file(dir, id)?;
    let raw = fs::read_to_string(&path).map_err(|e| format!("read essay: {e}"))?;
    serde_json::from_str::<Essay>(&raw).map_err(|e| format!("parse essay: {e}"))
}

pub fn write_in(dir: &Path, essay: &Essay) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("create essays dir: {e}"))?;
    let path = essay_file(dir, &essay.id)?;
    let body = serde_json::to_string_pretty(essay).map_err(|e| format!("serialize: {e}"))?;
    // Atomic write: tmp then rename, so a crash mid-write doesn't corrupt the file.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, body).map_err(|e| format!("write tmp: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("rename tmp: {e}"))?;
    Ok(())
}

pub fn delete_in(dir: &Path, id: &str) -> Result<(), String> {
    let path = essay_file(dir, id)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("delete essay: {e}"))?;
    }
    Ok(())
}

// --------- Tauri command wrappers (production entry points) ---------

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
pub fn essay_list(app: AppHandle) -> Result<Vec<EssayMeta>, String> {
    list_in(&essays_dir(&app)?)
}

#[tauri::command]
pub fn essay_read(app: AppHandle, id: String) -> Result<Essay, String> {
    read_in(&essays_dir(&app)?, &id)
}

#[tauri::command]
pub fn essay_write(app: AppHandle, essay: Essay) -> Result<(), String> {
    write_in(&essays_dir(&app)?, &essay)
}

#[tauri::command]
pub fn essay_delete(app: AppHandle, id: String) -> Result<(), String> {
    let dir = essays_dir(&app)?;
    // Wipe the history file alongside the essay so a deleted essay
    // doesn't leak its version history to disk.
    let _ = crate::history::delete_in(&dir, &id);
    delete_in(&dir, &id)
}

// --------- Tests ---------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample_essay(id: &str, updated_at: &str) -> Essay {
        Essay {
            id: id.to_string(),
            title: "La paradoja de la psicología segura".to_string(),
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
            word_count: 3,
            created_at: "2026-05-09T20:00:00Z".to_string(),
            updated_at: updated_at.to_string(),
        }
    }

    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn make_dir() -> PathBuf {
        // Each test gets its own subdirectory so the parallel test runner
        // doesn't have one test's `remove_dir_all` blow away another's data.
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "essay-studio-test-{}-{n}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn round_trip_write_read() {
        let dir = make_dir();
        let essay = sample_essay("a", "2026-05-09T20:01:00Z");
        write_in(&dir, &essay).expect("write");
        let read = read_in(&dir, "a").expect("read");
        assert_eq!(read, essay);
    }

    #[test]
    fn list_returns_metas_sorted_by_updated_at_desc() {
        let dir = make_dir();
        write_in(&dir, &sample_essay("old", "2026-05-09T20:00:00Z")).unwrap();
        write_in(&dir, &sample_essay("new", "2026-05-09T22:00:00Z")).unwrap();
        write_in(&dir, &sample_essay("mid", "2026-05-09T21:00:00Z")).unwrap();

        let metas = list_in(&dir).expect("list");
        assert_eq!(metas.len(), 3);
        assert_eq!(metas[0].id, "new");
        assert_eq!(metas[1].id, "mid");
        assert_eq!(metas[2].id, "old");
        // Meta strips out content
        assert_eq!(metas[0].word_count, 3);
    }

    #[test]
    fn delete_removes_file_and_is_idempotent() {
        let dir = make_dir();
        write_in(&dir, &sample_essay("a", "2026-05-09T20:00:00Z")).unwrap();
        delete_in(&dir, "a").expect("delete");
        delete_in(&dir, "a").expect("delete second time should not fail");
        assert!(read_in(&dir, "a").is_err());
        assert_eq!(list_in(&dir).unwrap().len(), 0);
    }

    #[test]
    fn list_handles_empty_or_missing_dir() {
        let dir = make_dir();
        // dir doesn't exist yet — list should create it and return empty
        let metas = list_in(&dir).expect("list on empty");
        assert_eq!(metas.len(), 0);
    }

    #[test]
    fn list_skips_corrupt_json_files() {
        let dir = make_dir();
        write_in(&dir, &sample_essay("good", "2026-05-09T20:00:00Z")).unwrap();
        // Drop a malformed file alongside
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("garbage.json"), "{ this is not valid json").unwrap();

        let metas = list_in(&dir).expect("list");
        assert_eq!(metas.len(), 1);
        assert_eq!(metas[0].id, "good");
    }

    #[test]
    fn rejects_invalid_ids() {
        let dir = make_dir();
        let cases = ["", "../escape", "with/slash", "back\\slash", "null\0byte"];
        for bad in &cases {
            let mut e = sample_essay("placeholder", "2026-05-09T20:00:00Z");
            e.id = (*bad).to_string();
            assert!(write_in(&dir, &e).is_err(), "should reject id {bad:?}");
            assert!(read_in(&dir, bad).is_err(), "should reject id {bad:?}");
            assert!(delete_in(&dir, bad).is_err(), "should reject id {bad:?}");
        }
    }

    #[test]
    fn round_trip_preserves_optional_board_snapshot() {
        let dir = make_dir();
        let mut essay = sample_essay("with-board", "2026-05-09T20:30:00Z");
        essay.board = Some(json!({ "store": { "shape:abc": { "type": "postit" } } }));
        write_in(&dir, &essay).unwrap();
        let read = read_in(&dir, "with-board").unwrap();
        assert_eq!(read.board, essay.board);
    }

    #[test]
    fn round_trip_preserves_optional_fuentes() {
        let dir = make_dir();
        let mut essay = sample_essay("with-fuentes", "2026-05-09T20:30:00Z");
        essay.fuentes = Some(json!([
            {
                "id": "f1",
                "nombre": "Edmondson 1999",
                "cita": "Edmondson, A. (1999). Psychological safety and learning behavior.",
                "contenido": "Texto íntegro del estudio…",
                "origen": "texto",
                "agregadoEn": "2026-05-09T20:00:00Z"
            }
        ]));
        write_in(&dir, &essay).unwrap();
        let read = read_in(&dir, "with-fuentes").unwrap();
        assert_eq!(read.fuentes, essay.fuentes);
    }

    #[test]
    fn round_trip_preserves_optional_language() {
        let dir = make_dir();
        let mut essay = sample_essay("with-lang", "2026-05-28T20:30:00Z");
        essay.language = Some("en".to_string());
        write_in(&dir, &essay).unwrap();
        let read = read_in(&dir, "with-lang").unwrap();
        assert_eq!(read.language, Some("en".to_string()));
    }

    #[test]
    fn round_trip_preserves_optional_evaluacion_meta() {
        let dir = make_dir();
        let mut essay = sample_essay("with-eval", "2026-05-19T20:30:00Z");
        essay.evaluacion_meta = Some(json!({
            "evaluadoEn": "2026-05-19T20:30:00Z",
            "pasadasCubiertas": ["coherencia", "estilo", "argumento", "apa"]
        }));
        write_in(&dir, &essay).unwrap();
        let read = read_in(&dir, "with-eval").unwrap();
        assert_eq!(read.evaluacion_meta, essay.evaluacion_meta);
    }

    #[test]
    fn round_trip_preserves_optional_rubrica() {
        let dir = make_dir();
        let mut essay = sample_essay("with-rubrica", "2026-05-09T20:30:00Z");
        essay.rubrica = Some(json!({
            "criterios": [
                {
                    "id": "c1",
                    "nombre": "Claridad del argumento",
                    "peso": 5,
                    "descripcion": "La tesis se enuncia en los primeros tres párrafos."
                },
                {
                    "id": "c2",
                    "nombre": "Calidad de la evidencia",
                    "peso": 4,
                    "descripcion": "Cada afirmación empírica viene con cita y N."
                }
            ]
        }));
        write_in(&dir, &essay).unwrap();
        let read = read_in(&dir, "with-rubrica").unwrap();
        assert_eq!(read.rubrica, essay.rubrica);
    }

    #[test]
    fn write_is_atomic_and_no_tmp_left_behind() {
        let dir = make_dir();
        let essay = sample_essay("atomic", "2026-05-09T20:00:00Z");
        write_in(&dir, &essay).expect("write");
        // No .json.tmp file should remain after a successful write.
        let entries: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        assert!(
            entries.iter().any(|n| n == "atomic.json"),
            "expected atomic.json"
        );
        assert!(
            !entries.iter().any(|n| n.ends_with(".tmp")),
            "tmp file should not remain"
        );
    }
}
