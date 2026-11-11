// Library index (spec 007). A derived, disposable cache of what the list
// and the search need, so the list never has to parse every essay.
//
// Rules this module keeps:
// - The index is derived data. Essay files are the only truth, and this
//   module only ever READS them. It never writes, renames or deletes an
//   essay file, damaged or not.
// - Reconcile (stat every file, re-derive what changed, drop what is
//   gone) runs on every read, so the index cannot drift from the files.
// - Rust copies the inputs of the score and never computes it.
//   The renderer holds the only scorer.
// - Bodies never cross IPC. Search runs here and returns ready segments.

use crate::storage::{self, EssayMeta};
use serde::de::IgnoredAny;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Bump when ReviewInputs or the entry shape changes (see
/// specs/007-essay-library/contracts/score-inputs.md). A mismatch forces
/// one rebuild at the next read.
pub const INDEX_VERSION: u32 = 2;

const EXCERPT_MAX_CHARS: usize = 320;
const MARK_DENY_LIST: [&str; 5] = ["mensaje", "reemplazo", "sugerencia", "evidence", "provenance"];
const MAX_WALK_DEPTH: usize = 64;

// --------- Types ---------

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewInputs {
    /// The blocks of the essay that carry at least one annotation mark, text
    /// intact, annotation marks only. The renderer wraps them in a doc and runs
    /// the editor's own `deriveFindings` over them, so grouping is identical.
    pub blocks: Vec<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub findings: Option<Vec<Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub evaluacion_meta: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rubrica: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    pub id: String,
    pub title: String,
    pub mode: String,
    pub word_count: u32,
    pub created_at: String,
    pub updated_at: String,
    pub excerpt: String,
    pub file_modified_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub review: Option<ReviewInputs>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IndexRecord {
    pub mtime_ns: u64,
    pub size: u64,
    pub entry: LibraryEntry,
    /// Plain text of the body. Never crosses IPC.
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Index {
    pub version: u32,
    pub records: HashMap<String, IndexRecord>,
}

impl Default for Index {
    fn default() -> Self {
        Index {
            version: INDEX_VERSION,
            records: HashMap::new(),
        }
    }
}

/// The parts of an essay the index reads. Required fields and the optional
/// field types mirror `storage::Essay`, so a file appears here exactly when
/// it would open. Big fields are validated by serde and then thrown away.
#[derive(Deserialize)]
struct EssayLite {
    id: String,
    title: String,
    content: Value,
    #[serde(default)]
    #[allow(dead_code)]
    board: Option<IgnoredAny>,
    #[serde(default)]
    #[allow(dead_code)]
    interrogatorios: Option<IgnoredAny>,
    #[serde(default)]
    #[allow(dead_code)]
    fuentes: Option<IgnoredAny>,
    #[serde(default)]
    rubrica: Option<Value>,
    #[serde(default, rename = "evaluacionMeta")]
    evaluacion_meta: Option<Value>,
    #[serde(default)]
    findings: Option<Value>,
    #[serde(default)]
    #[allow(dead_code)]
    language: Option<String>,
    #[serde(default, rename = "reviewerProfile")]
    #[allow(dead_code)]
    reviewer_profile: Option<String>,
    mode: String,
    #[serde(rename = "wordCount", default)]
    word_count: u32,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
}

// --------- Derivation ---------

struct Extracted {
    text: String,
}

fn walk(node: &Value, depth: usize, out: &mut Extracted) {
    if depth > MAX_WALK_DEPTH {
        return;
    }
    let Some(obj) = node.as_object() else { return };
    let ty = obj.get("type").and_then(Value::as_str).unwrap_or("");
    if ty == "text" {
        if let Some(t) = obj.get("text").and_then(Value::as_str) {
            out.text.push_str(t);
        }
        return;
    }
    if let Some(children) = obj.get("content").and_then(Value::as_array) {
        for c in children {
            walk(c, depth + 1, out);
        }
        if !out.text.ends_with('\n') && !out.text.is_empty() {
            out.text.push('\n');
        }
    }
}

fn slim_annotation_mark(mark: &Value) -> Option<Value> {
    let m = mark.as_object()?;
    if m.get("type").and_then(Value::as_str) != Some("annotation") {
        return None;
    }
    let mut attrs = Map::new();
    if let Some(src) = m.get("attrs").and_then(Value::as_object) {
        for (k, v) in src {
            if !MARK_DENY_LIST.contains(&k.as_str()) {
                attrs.insert(k.clone(), v.clone());
            }
        }
    }
    Some(json!({ "type": "annotation", "attrs": Value::Object(attrs) }))
}

/// The subtree reduced to what holds annotations: a text block keeps all its
/// inline nodes (sentences need the whole text) with annotation marks only;
/// a container keeps only the children that hold annotations. None when the
/// subtree has no annotation mark.
fn prune_to_annotated(node: &Value, depth: usize) -> Option<Value> {
    if depth > MAX_WALK_DEPTH {
        return None;
    }
    let obj = node.as_object()?;
    let children = obj.get("content").and_then(Value::as_array)?;
    let is_text_block = children
        .iter()
        .any(|c| c.get("type").and_then(Value::as_str) == Some("text"));
    let mut out = Map::new();
    if let Some(t) = obj.get("type") {
        out.insert("type".to_string(), t.clone());
    }
    if is_text_block {
        let mut any = false;
        let mut kept = Vec::with_capacity(children.len());
        for c in children {
            let Some(co) = c.as_object() else { continue };
            let mut n = Map::new();
            for k in ["type", "text"] {
                if let Some(v) = co.get(k) {
                    n.insert(k.to_string(), v.clone());
                }
            }
            if co.get("type").and_then(Value::as_str) == Some("text") {
                let marks: Vec<Value> = co
                    .get("marks")
                    .and_then(Value::as_array)
                    .map(|ms| ms.iter().filter_map(slim_annotation_mark).collect())
                    .unwrap_or_default();
                if !marks.is_empty() {
                    any = true;
                    n.insert("marks".to_string(), Value::Array(marks));
                }
            }
            kept.push(Value::Object(n));
        }
        if !any {
            return None;
        }
        out.insert("content".to_string(), Value::Array(kept));
        return Some(Value::Object(out));
    }
    let kept: Vec<Value> = children
        .iter()
        .filter_map(|c| prune_to_annotated(c, depth + 1))
        .collect();
    if kept.is_empty() {
        return None;
    }
    out.insert("content".to_string(), Value::Array(kept));
    Some(Value::Object(out))
}

fn annotated_blocks(content: &Value) -> Vec<Value> {
    content
        .get("content")
        .and_then(Value::as_array)
        .map(|bs| bs.iter().filter_map(|b| prune_to_annotated(b, 1)).collect())
        .unwrap_or_default()
}

fn collapse_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// First non-heading blocks, cut at a word boundary at or before 320 chars.
fn make_excerpt(content: &Value) -> String {
    let Some(blocks) = content.get("content").and_then(Value::as_array) else {
        return String::new();
    };
    let mut acc = String::new();
    for block in blocks {
        if block.get("type").and_then(Value::as_str) == Some("heading") {
            continue;
        }
        let mut ex = Extracted {
            text: String::new(),
        };
        walk(block, 0, &mut ex);
        let t = collapse_ws(&ex.text);
        if t.is_empty() {
            continue;
        }
        if !acc.is_empty() {
            acc.push(' ');
        }
        acc.push_str(&t);
        if acc.chars().count() >= EXCERPT_MAX_CHARS {
            break;
        }
    }
    cut_at_word(&acc, EXCERPT_MAX_CHARS)
}

fn cut_at_word(s: &str, max_chars: usize) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= max_chars {
        return s.to_string();
    }
    // Cut at the last whitespace at or before max_chars; if the next char is
    // whitespace the word ended exactly there.
    let mut end = max_chars;
    while end > 0 && !chars[end].is_whitespace() {
        end -= 1;
    }
    if end == 0 {
        end = max_chars;
    }
    chars[..end].iter().collect::<String>().trim_end().to_string()
}

fn slim_findings(v: &Value) -> Option<Vec<Value>> {
    let arr = v.as_array()?;
    let out: Vec<Value> = arr
        .iter()
        .filter_map(|f| f.as_object())
        .map(|f| {
            let mut o = Map::new();
            for k in ["id", "sage", "pase", "severidad", "criterioId", "status"] {
                if let Some(x) = f.get(k) {
                    o.insert(k.to_string(), x.clone());
                }
            }
            Value::Object(o)
        })
        .collect();
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

fn derive(raw: &str, mtime_ns: u64, size: u64) -> Result<IndexRecord, String> {
    let e: EssayLite = serde_json::from_str(raw).map_err(|e| e.to_string())?;

    let mut ex = Extracted {
        text: String::new(),
    };
    walk(&e.content, 0, &mut ex);
    let blocks = annotated_blocks(&e.content);
    let text = ex.text.trim_end().to_string();
    let excerpt = make_excerpt(&e.content);

    let findings = e.findings.as_ref().and_then(slim_findings);
    let evaluacion_meta = e.evaluacion_meta.as_ref().filter(|v| !v.is_null()).map(|v| {
        let mut v = v.clone();
        if let Some(o) = v.as_object_mut() {
            o.remove("reviewerRuns");
        }
        v
    });
    let rubrica = e
        .rubrica
        .as_ref()
        .and_then(|r| r.get("criterios"))
        .map(|c| json!({ "criterios": c }));

    let review = if evaluacion_meta.is_some() || findings.is_some() || !blocks.is_empty() {
        Some(ReviewInputs {
            blocks,
            findings,
            evaluacion_meta,
            rubrica,
        })
    } else {
        None
    };

    Ok(IndexRecord {
        mtime_ns,
        size,
        entry: LibraryEntry {
            id: e.id,
            title: e.title,
            mode: e.mode,
            word_count: e.word_count,
            created_at: e.created_at,
            updated_at: e.updated_at,
            excerpt,
            file_modified_ms: mtime_ns / 1_000_000,
            review,
        },
        text,
    })
}

// --------- Index file ---------

pub fn index_path(app_data: &Path) -> PathBuf {
    app_data.join("library").join("index.v1.json")
}

/// Missing, unreadable, corrupt or wrong version: start empty.
pub fn load_index(path: &Path) -> Index {
    let Ok(raw) = fs::read_to_string(path) else {
        return Index::default();
    };
    match serde_json::from_str::<Index>(&raw) {
        Ok(idx) if idx.version == INDEX_VERSION => idx,
        _ => Index::default(),
    }
}

pub fn save_index(path: &Path, index: &Index) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create library dir: {e}"))?;
    }
    let body = serde_json::to_string(index).map_err(|e| format!("serialize index: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, body).map_err(|e| format!("write index tmp: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("rename index tmp: {e}"))?;
    Ok(())
}

// --------- Reconcile ---------

#[derive(Debug, Default, PartialEq)]
pub struct Outcome {
    pub changed: bool,
    pub damaged: usize,
}

fn stat_of(path: &Path) -> Option<(u64, u64)> {
    let md = fs::metadata(path).ok()?;
    if !md.is_file() {
        return None;
    }
    let mtime = md.modified().ok()?;
    let ns = mtime
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    Some((ns, md.len()))
}

/// Brings the index in line with the files in `dir`. Only reads essays.
pub fn reconcile(dir: &Path, index: &mut Index) -> Result<Outcome, String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("read essays dir: {e}"))?;
    let mut present: HashSet<String> = HashSet::new();
    let mut outcome = Outcome::default();

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let stem = stem.to_string();
        // Stat first: a save racing this read can only cost one extra
        // re-derive at the next read, never a stale record.
        let Some((mtime_ns, size)) = stat_of(&path) else {
            continue;
        };
        if let Some(rec) = index.records.get(&stem) {
            if rec.mtime_ns == mtime_ns && rec.size == size {
                present.insert(stem);
                continue;
            }
        }
        match fs::read_to_string(&path)
            .map_err(|e| e.to_string())
            .and_then(|raw| derive(&raw, mtime_ns, size))
        {
            Ok(rec) => {
                index.records.insert(stem.clone(), rec);
                present.insert(stem);
                outcome.changed = true;
            }
            Err(_) => {
                // Damaged or unreadable: not listed, never touched on disk.
                outcome.damaged += 1;
                if index.records.remove(&stem).is_some() {
                    outcome.changed = true;
                }
            }
        }
    }

    let before = index.records.len();
    index.records.retain(|k, _| present.contains(k));
    if index.records.len() != before {
        outcome.changed = true;
    }
    if outcome.damaged > 0 {
        log::warn!("library: {} essay file(s) could not be read and were skipped", outcome.damaged);
    }
    Ok(outcome)
}

fn sorted_entries(index: &Index) -> Vec<LibraryEntry> {
    let mut v: Vec<LibraryEntry> = index.records.values().map(|r| r.entry.clone()).collect();
    v.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    v
}

/// A scan with a throwaway index and no file written. Backs `storage::list_in`
/// so its tests exercise the real derivation path.
#[cfg_attr(not(test), allow(dead_code))]
pub fn scan_in(dir: &Path) -> Result<Vec<LibraryEntry>, String> {
    let mut idx = Index::default();
    reconcile(dir, &mut idx)?;
    Ok(sorted_entries(&idx))
}

// --------- Folding and search ---------

/// One character to one character, so char offsets in folded text are valid
/// in the original. Lowercase, accents removed, «ñ» kept.
pub fn fold_char(c: char) -> char {
    if c.is_ascii() {
        return c.to_ascii_lowercase();
    }
    let l = c.to_lowercase().next().unwrap_or(c);
    match l {
        'á' | 'à' | 'â' | 'ä' | 'ã' | 'å' | 'ā' => 'a',
        'é' | 'è' | 'ê' | 'ë' | 'ē' => 'e',
        'í' | 'ì' | 'î' | 'ï' | 'ī' => 'i',
        'ó' | 'ò' | 'ô' | 'ö' | 'õ' | 'ō' => 'o',
        'ú' | 'ù' | 'û' | 'ü' | 'ū' => 'u',
        'ç' => 'c',
        'ý' | 'ÿ' => 'y',
        other => other,
    }
}

pub fn fold(s: &str) -> String {
    s.chars().map(fold_char).collect()
}

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct Segment {
    pub text: String,
    pub hit: bool,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct SearchHit {
    pub id: String,
    pub rank: &'static str,
    pub title: Vec<Segment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<Vec<Segment>>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct SearchResult {
    pub hits: Vec<SearchHit>,
}

/// Splits `s` into runs, marking every occurrence of any query word.
fn segments(s: &str, words: &[Vec<char>]) -> Vec<Segment> {
    let chars: Vec<char> = s.chars().collect();
    let folded: Vec<char> = chars.iter().map(|c| fold_char(*c)).collect();
    let mut hit = vec![false; chars.len()];
    for w in words {
        if w.is_empty() || w.len() > folded.len() {
            continue;
        }
        for i in 0..=(folded.len() - w.len()) {
            if folded[i..i + w.len()] == w[..] {
                for h in &mut hit[i..i + w.len()] {
                    *h = true;
                }
            }
        }
    }
    let mut out: Vec<Segment> = Vec::new();
    let mut start = 0;
    for i in 1..=chars.len() {
        if i == chars.len() || hit[i] != hit[start] {
            out.push(Segment {
                text: chars[start..i].iter().collect(),
                hit: hit[start],
            });
            start = i;
        }
    }
    out
}

fn is_terminator(c: char) -> bool {
    matches!(c, '.' | '!' | '?' | '\n')
}

/// About 120 characters around the first match, per the contract.
fn make_snippet(text: &str, match_char: usize, match_len: usize) -> String {
    const CAP: usize = 460;
    let from = match_char.saturating_sub(200);
    let window: Vec<char> = text.chars().skip(from).take(CAP).collect();
    let lp = match_char - from;

    // Start of the sentence holding the match, if it is within 60 chars.
    let mut sentence_start: Option<usize> = None;
    let mut i = lp;
    while i > 0 {
        if is_terminator(window[i - 1]) {
            let mut s = i;
            while s < lp && window[s].is_whitespace() {
                s += 1;
            }
            sentence_start = Some(s);
            break;
        }
        i -= 1;
    }
    if sentence_start.is_none() && from == 0 {
        let mut s = 0;
        while s < lp && window[s].is_whitespace() {
            s += 1;
        }
        sentence_start = Some(s);
    }

    let (start, lead) = match sentence_start {
        Some(s) if lp - s <= 60 => (s, false),
        _ => {
            let mut b = lp.saturating_sub(40);
            while b > 0 && b < lp && !window[b - 1].is_whitespace() {
                b += 1;
            }
            (b, true)
        }
    };

    let mut end = (start + 120).min(window.len());
    let continues = end < window.len();
    if continues {
        let floor = (lp + match_len).min(window.len());
        while end > floor && !window[end].is_whitespace() {
            end -= 1;
        }
    }
    let body: String = window[start..end]
        .iter()
        .map(|c| if c.is_whitespace() { ' ' } else { *c })
        .collect();
    let body = body.trim_end();
    format!(
        "{}{}{}",
        if lead { "…" } else { "" },
        body,
        if continues { "…" } else { "" }
    )
}

#[derive(Default)]
pub struct Folded {
    mtime_ns: u64,
    title: String,
    text: String,
}

#[derive(Default)]
pub struct Inner {
    index: Option<Index>,
    folded: HashMap<String, Folded>,
}

pub fn search_in(inner: &Inner, query: &str) -> SearchResult {
    let Some(index) = inner.index.as_ref() else {
        return SearchResult { hits: vec![] };
    };
    let folded_query = fold(query);
    let words: Vec<&str> = folded_query.split_whitespace().collect();
    if words.is_empty() {
        return SearchResult { hits: vec![] };
    }
    let word_chars: Vec<Vec<char>> = words.iter().map(|w| w.chars().collect()).collect();

    let mut found: Vec<(&IndexRecord, bool, Vec<Segment>, Option<Vec<Segment>>)> = Vec::new();

    for (stem, rec) in &index.records {
        let tmp: (String, String);
        let (tf, xf): (&str, &str) = match inner.folded.get(stem) {
            Some(f) if f.mtime_ns == rec.mtime_ns => (&f.title, &f.text),
            _ => {
                tmp = (fold(&rec.entry.title), fold(&rec.text));
                (&tmp.0, &tmp.1)
            }
        };
        let mut all_present = true;
        let mut all_in_title = true;
        for w in &words {
            let in_title = tf.contains(w);
            if !in_title {
                all_in_title = false;
                if !xf.contains(w) {
                    all_present = false;
                    break;
                }
            }
        }
        if !all_present {
            continue;
        }
        let title_segments = segments(&rec.entry.title, &word_chars);
        if all_in_title {
            found.push((rec, true, title_segments, None));
            continue;
        }
        // First match anywhere in the body, by earliest position.
        let mut first: Option<(usize, usize)> = None; // (byte offset, word chars)
        for w in &words {
            if let Some(b) = xf.find(w) {
                if first.map_or(true, |(fb, _)| b < fb) {
                    first = Some((b, w.chars().count()));
                }
            }
        }
        let snippet = first.map(|(b, wl)| {
            let char_idx = xf[..b].chars().count();
            segments(&make_snippet(&rec.text, char_idx, wl), &word_chars)
        });
        found.push((rec, false, title_segments, snippet));
    }

    found.sort_by(|a, b| {
        b.1.cmp(&a.1)
            .then_with(|| b.0.entry.updated_at.cmp(&a.0.entry.updated_at))
    });
    SearchResult {
        hits: found
            .into_iter()
            .map(|(rec, title_rank, title, snippet)| SearchHit {
                id: rec.entry.id.clone(),
                rank: if title_rank { "title" } else { "body" },
                title,
                snippet,
            })
            .collect(),
    }
}

// --------- State and commands ---------

#[derive(Default)]
pub struct LibraryState {
    inner: Mutex<Inner>,
    filling: AtomicBool,
}

/// Locks the state, loads the index on first use, reconciles against the
/// files, saves when anything changed (a failed save is logged and the
/// in-memory index keeps serving), then runs `f`.
fn reconciled<R>(app: &AppHandle, f: impl FnOnce(&Inner) -> R) -> Result<R, String> {
    let dir = storage::essays_dir(app)?;
    let path = index_path(&storage::app_data_dir(app)?);
    let state = app.state::<LibraryState>();
    let mut g = state.inner.lock().unwrap_or_else(|e| e.into_inner());
    if g.index.is_none() {
        g.index = Some(load_index(&path));
    }
    let outcome = reconcile(&dir, g.index.as_mut().expect("index loaded"))?;
    if outcome.changed {
        if let Err(err) = save_index(&path, g.index.as_ref().expect("index loaded")) {
            log::warn!("library: could not save the index: {err}");
        }
    }
    Ok(f(&g))
}

/// Folds titles and bodies in a background thread, outside the lock, for the
/// essays that changed. Search never waits on it: it folds missing ones itself.
fn spawn_fill(app: &AppHandle) {
    let state = app.state::<LibraryState>();
    if state.filling.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        fill(&app);
        app.state::<LibraryState>()
            .filling
            .store(false, Ordering::SeqCst);
    });
}

fn fill(app: &AppHandle) {
    let state = app.state::<LibraryState>();
    let work: Vec<(String, u64, String, String)> = {
        let mut g = state.inner.lock().unwrap_or_else(|e| e.into_inner());
        let Inner { index, folded } = &mut *g;
        let Some(index) = index.as_ref() else { return };
        folded.retain(|k, _| index.records.contains_key(k));
        index
            .records
            .iter()
            .filter(|(k, r)| folded.get(*k).map_or(true, |f| f.mtime_ns != r.mtime_ns))
            .map(|(k, r)| (k.clone(), r.mtime_ns, r.entry.title.clone(), r.text.clone()))
            .collect()
    };
    if work.is_empty() {
        return;
    }
    let done: Vec<(String, Folded)> = work
        .into_iter()
        .map(|(k, m, t, x)| {
            (
                k,
                Folded {
                    mtime_ns: m,
                    title: fold(&t),
                    text: fold(&x),
                },
            )
        })
        .collect();
    let mut g = state.inner.lock().unwrap_or_else(|e| e.into_inner());
    let Inner { index, folded } = &mut *g;
    let Some(index) = index.as_ref() else { return };
    for (k, f) in done {
        if index.records.get(&k).map(|r| r.mtime_ns) == Some(f.mtime_ns) {
            folded.insert(k, f);
        }
    }
}

pub fn entries(app: &AppHandle) -> Result<Vec<LibraryEntry>, String> {
    let list = reconciled(app, |g| g.index.as_ref().map(sorted_entries).unwrap_or_default())?;
    spawn_fill(app);
    Ok(list)
}

pub fn meta_list(app: &AppHandle) -> Result<Vec<EssayMeta>, String> {
    Ok(entries(app)?
        .into_iter()
        .map(|e| EssayMeta {
            id: e.id,
            title: e.title,
            mode: e.mode,
            word_count: e.word_count,
            created_at: e.created_at,
            updated_at: e.updated_at,
        })
        .collect())
}

/// After a delete: drop the gone essay's text from the index right away.
pub fn reconcile_in_background(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(err) = reconciled(&app, |_| ()) {
            log::warn!("library: background reconcile failed: {err}");
        }
    });
}

#[tauri::command]
pub async fn library_list(app: AppHandle) -> Result<Vec<LibraryEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || entries(&app))
        .await
        .map_err(|e| format!("library_list task: {e}"))?
}

#[tauri::command]
pub async fn library_search(app: AppHandle, query: String) -> Result<SearchResult, String> {
    tauri::async_runtime::spawn_blocking(move || reconciled(&app, |g| search_in(g, &query)))
        .await
        .map_err(|e| format!("library_search task: {e}"))?
}
