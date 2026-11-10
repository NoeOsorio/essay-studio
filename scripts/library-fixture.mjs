#!/usr/bin/env node
// Dev only, not bundled. Generates a disposable essay library and checks
// the library index against it (spec 007).
//
//   node scripts/library-fixture.mjs generate <absolute-dir> <n>
//   node scripts/library-fixture.mjs check <absolute-dir>
//
// Prints only ids and field names, never essay text. Refuses the real app
// data directory.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REAL_DIRS = [
  path.join(os.homedir(), "Library", "Application Support", "com.noeosorio.essaystudio"),
  path.join(os.homedir(), "Library", "Application Support", "Essay Studio"),
  path.join(os.homedir(), "Library", "Application Support"),
];
const FIXTURE_PREFIX = "fx-";

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

/** Resolves symlinks through the deepest existing ancestor. */
function realish(p) {
  let cur = path.resolve(p);
  const tail = [];
  while (!fs.existsSync(cur)) {
    tail.unshift(path.basename(cur));
    const up = path.dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return path.join(fs.realpathSync(cur), ...tail);
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function guardDir(dir) {
  if (!dir || !path.isAbsolute(dir)) fail("the directory must be an absolute path");
  const real = realish(dir);
  for (const forbidden of REAL_DIRS) {
    const f = realish(forbidden);
    // Refuse the real dir, anything inside it, and anything that contains it.
    if (isInside(real, f) || isInside(f, real)) {
      fail("refusing the real app data directory");
    }
  }
  const home = fs.realpathSync(os.homedir());
  if (real === home || real === path.parse(real).root) fail("refusing a home or root directory");
  return real;
}

// ---- deterministic generation ----

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = (
  "cultura organizacional equipo seguridad psicológica confianza liderazgo hermenéutica evidencia " +
  "sistema bucle incentivo aprendizaje error feedback decisión grupo norma valor creencia " +
  "análisis método fuente teoría práctica crítica argumento supuesto mecanismo año señal " +
  "proceso estructura relación contexto conducta motivación cambio resultado estudio autor"
).split(" ");
const SAGES = ["em", "sis", "pra", "cri"];
const PASES = ["coherencia", "estilo", "argumento", "apa"];
const SEVERIDAD = ["alta", "media", "baja"];

// Words that exist in exactly one place, so a check can tell where a search looked.
const BOARD_ONLY = "zzgranito";
const BODY_RARE = "zzbasalto";

function sentence(r, n, extra) {
  const w = [];
  for (let i = 0; i < n; i++) w.push(WORDS[Math.floor(r() * WORDS.length)]);
  if (extra) w.splice(Math.floor(r() * w.length), 0, extra);
  const s = w.join(" ");
  return s[0].toUpperCase() + s.slice(1) + ".";
}

function makeEssay(i, total) {
  const r = rng(1000 + i);
  const id = `${FIXTURE_PREFIX}${String(i + 1).padStart(4, "0")}`;
  const words = 250 + Math.floor(r() * 4300);
  const reviewed = r() < 0.6;
  const titleWords = r() < 0.04 ? "" : sentence(r, 3 + Math.floor(r() * 5)).slice(0, -1);

  const blocks = [];
  let remaining = words;
  let marksLeft = reviewed ? Math.floor(r() * 31) : 0;
  const markIds = [];
  blocks.push({
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text: sentence(r, 4).slice(0, -1) }],
  });
  while (remaining > 0) {
    const n = Math.min(remaining, 40 + Math.floor(r() * 80));
    remaining -= n;
    const text = sentence(r, n, i % 97 === 5 && remaining < 400 ? BODY_RARE : undefined);
    const node = { type: "text", text };
    if (marksLeft > 0 && r() < 0.5) {
      marksLeft--;
      const mid = `a-${id}-${markIds.length}`;
      markIds.push(mid);
      node.marks = [
        {
          type: "annotation",
          attrs: {
            id: mid,
            sage: SAGES[Math.floor(r() * 4)],
            pase: PASES[Math.floor(r() * 4)],
            severidad: SEVERIDAD[Math.floor(r() * 3)],
            mensaje: sentence(r, 30),
            reemplazo: sentence(r, 12),
            evidence: { sourceIds: ["s1"], ranges: [[0, 10]] },
            provenance: { model: "fixture", promptHash: "00" },
          },
        },
      ];
    }
    blocks.push({ type: "paragraph", content: [node] });
  }

  const noteCount = Math.floor(r() * 41);
  const records = {};
  for (let k = 0; k < noteCount; k++) {
    const nid = `shape:note${k}`;
    records[nid] = {
      id: nid,
      typeName: "shape",
      type: "note",
      x: k * 40,
      y: k * 10,
      props: {
        richText: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: sentence(r, 12, i === 7 && k === 0 ? BOARD_ONLY : undefined) }] }],
        },
      },
      meta: { author: "tu", kind: "concepto" },
    };
  }

  const day = 24 * 3600 * 1000;
  const updated = new Date(Date.UTC(2026, 10, 8) - Math.floor(r() * 3 * 365) * day - Math.floor(r() * day));
  const created = new Date(updated.getTime() - Math.floor(r() * 90) * day);
  const essay = {
    id,
    title: titleWords,
    content: { type: "doc", content: blocks },
    mode: r() < 0.7 ? "academico" : "blog",
    wordCount: words,
    createdAt: created.toISOString(),
    updatedAt: updated.toISOString(),
  };
  if (noteCount > 0) essay.board = { store: records, schema: { schemaVersion: 2 } };
  if (i % 3 === 0) {
    essay.fuentes = [
      { id: "s1", nombre: `Fuente ${i}`, contenido: sentence(r, 400), origen: "manual", agregadoEn: created.toISOString() },
    ];
  }
  if (reviewed) {
    essay.rubrica = {
      criterios: [
        { id: "c1", nombre: "Claridad", peso: 3, descripcion: "x" },
        { id: "c2", nombre: "Evidencia", peso: 2, descripcion: "y" },
      ],
      consigna: sentence(r, 200),
    };
    essay.evaluacionMeta = {
      evaluadoEn: updated.toISOString(),
      pasadasCubiertas: ["coherencia", "estilo", "argumento"],
      currentFingerprint: `fp-${i}`,
      reviewerRuns: [{ id: "run1", log: sentence(r, 100) }],
    };
    if (i % 5 === 0) {
      essay.findings = markIds.slice(0, 3).map((m) => ({
        id: m,
        sage: "cri",
        pase: "argumento",
        severidad: "media",
        criterioId: "c1",
        status: "open",
        mensaje: sentence(r, 20),
      }));
    }
  }
  return essay;
}

function generate(dir, n) {
  const real = guardDir(dir);
  if (!Number.isInteger(n) || n < 1 || n > 20000) fail("n must be an integer from 1 to 20000");
  const essays = path.join(real, "essays");
  fs.mkdirSync(essays, { recursive: true });
  const stray = fs.readdirSync(essays).filter((f) => !f.startsWith(FIXTURE_PREFIX));
  if (stray.length > 0) fail("the essays folder holds files that are not fixture files; use an empty directory");
  for (let i = 0; i < n; i++) {
    const e = makeEssay(i, n);
    fs.writeFileSync(path.join(essays, `${e.id}.json`), JSON.stringify(e, null, 2));
  }
  console.log(`generated ${n} essays in ${essays}`);
}

// ---- check ----

function check(dir) {
  const real = guardDir(dir);
  const essays = path.join(real, "essays");
  const indexFile = path.join(real, "library", "index.v1.json");
  if (!fs.existsSync(indexFile)) fail("no index file at library/index.v1.json");
  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
  } catch {
    fail("the index file is not valid JSON");
  }
  const problems = [];
  const add = (id, what) => problems.push(`${id}: ${what}`);
  if (index.version !== 1) add("index", "version field");
  const records = index.records ?? {};
  const seen = new Set();
  let derived = 0;
  let damaged = 0;

  for (const file of fs.readdirSync(essays)) {
    if (!file.endsWith(".json")) continue;
    const stem = file.slice(0, -5);
    const full = path.join(essays, file);
    let essay;
    try {
      essay = JSON.parse(fs.readFileSync(full, "utf8"));
      for (const k of ["id", "title", "content", "mode", "createdAt", "updatedAt"]) {
        if (essay[k] === undefined) throw new Error("missing");
      }
    } catch {
      damaged++;
      if (records[stem]) add(stem, "record exists for a damaged file");
      continue;
    }
    seen.add(stem);
    const rec = records[stem];
    if (!rec) {
      add(stem, "no record");
      continue;
    }
    const st = fs.statSync(full, { bigint: true });
    if (rec.mtimeNs !== Number(st.mtimeNs)) add(stem, "field mtimeNs");
    if (rec.size !== Number(st.size)) add(stem, "field size");
    const en = rec.entry ?? {};
    for (const [k, v] of [
      ["id", essay.id],
      ["title", essay.title],
      ["mode", essay.mode],
      ["wordCount", essay.wordCount ?? 0],
      ["createdAt", essay.createdAt],
      ["updatedAt", essay.updatedAt],
    ]) {
      if (en[k] !== v) add(stem, `field ${k}`);
    }
    if (en.text !== undefined) add(stem, "entry carries text");

    // Body text and marks, recomputed independently.
    const texts = [];
    const markIds = new Set();
    const walk = (n) => {
      if (!n || typeof n !== "object") return;
      if (n.type === "text" && typeof n.text === "string") {
        texts.push(n.text);
        for (const m of n.marks ?? []) if (m.type === "annotation") markIds.add(m.attrs?.id);
      }
      for (const c of n.content ?? []) walk(c);
    };
    walk(essay.content);
    const hasText = texts.some((t) => t.trim() !== "");
    if (hasText !== (typeof rec.text === "string" && rec.text.trim() !== "")) add(stem, "field text");
    if (hasText && typeof en.excerpt !== "string") add(stem, "field excerpt");
    if (typeof en.excerpt === "string" && en.excerpt.length > 320) add(stem, "field excerpt too long");

    const shouldReview = !!essay.evaluacionMeta || (essay.findings ?? []).length > 0 || markIds.size > 0;
    if (shouldReview !== !!en.review) add(stem, "field review presence");
    if (en.review) {
      if ((en.review.marks ?? []).length !== markIds.size) add(stem, "field review.marks count");
      for (const m of en.review.marks ?? []) {
        for (const banned of ["mensaje", "reemplazo", "sugerencia", "evidence", "provenance"]) {
          if (m.attrs && banned in m.attrs) add(stem, `review.marks carries ${banned}`);
        }
      }
      if (en.review.evaluacionMeta && "reviewerRuns" in en.review.evaluacionMeta) add(stem, "evaluacionMeta carries reviewerRuns");
      if (en.review.rubrica && Object.keys(en.review.rubrica).join() !== "criterios") add(stem, "rubrica has more than criterios");
    }
    derived++;
  }
  for (const stem of Object.keys(records)) {
    if (!seen.has(stem)) add(stem, "record without a readable essay file");
  }

  if (problems.length > 0) {
    console.error(`check FAILED, ${problems.length} problem(s):`);
    for (const p of problems.slice(0, 40)) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`check passed: ${derived} essays match the index, ${damaged} damaged file(s) not indexed`);
}

const [, , cmd, dir, nArg] = process.argv;
if (cmd === "generate") generate(dir, Number(nArg ?? 1000));
else if (cmd === "check") check(dir);
else fail("usage: library-fixture.mjs generate <absolute-dir> <n> | check <absolute-dir>");
