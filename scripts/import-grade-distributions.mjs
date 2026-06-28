// Import historical grade distributions from public Google Sheets into
// public.grade_distributions, keyed by course identity (match_key = 課名|教師).
//
//   node scripts/import-grade-distributions.mjs            # dry-run
//   node scripts/import-grade-distributions.mjs --apply    # write
//
// Sheets differ in shape (form-response vs curated, column order), so columns are
// matched by HEADER KEYWORD, not position. Rows missing a course name or a valid
// semester are skipped. One distribution per (match_key, semester) — on conflict
// the more-complete (more filled buckets) row wins. Stores ALL rows (historical);
// "完全對上" happens when a course card queries by its own match_key.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const APPLY = process.argv.includes("--apply");

// Add more { id, gid } entries here for extra tabs of the same spreadsheet.
const SOURCES = [
  { id: "16gbSh_rb-VJceTcw_pcRg-tAkRtWfdcOR2EjevQXarg", gid: "512320334" }, // 表單回應
  { id: "19SBmbcWyqOb6T5s4HS5NDVxaNxheDztwHMlpNcAlHqo", gid: "0" },          // 整理表
  { id: "118hDrnkP7QFr8BCMfkNATuseH-ZRqavLBLxDffbo_JE", gid: "1969606352" }, // 表單回應
];

// --- env / client (prefer inherited process.env; fall back to .env files) ----
function readEnv() {
  const out = { ...process.env };
  for (const f of [".env", ".env.local"]) {
    try {
      for (const l of readFileSync(f, "utf8").split("\n")) {
        if (!l.includes("=") || l.trim().startsWith("#")) continue;
        const i = l.indexOf("=");
        const k = l.slice(0, i).trim();
        if (out[k] === undefined) out[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      }
    } catch { /* absent */ }
  }
  return out;
}
const env = readEnv();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- normalisation (keep in sync with lib/reviews/key.ts) --------------------
const normName = (s) => (s ?? "").replace(/[\s　]+/g, " ").trim();
const normTeacher = (s) => (s ?? "").replace(/[（(]\s*\d+\s*[)）]\s*$/, "").replace(/[\s　]+/g, "").trim();
const matchKey = (name, teacher) => `${normName(name)}|${normTeacher(teacher)}`;
const MAX_SEMESTER = "114-2"; // 115 學期尚未開始
function normSemester(s) {
  const t = (s ?? "").trim();
  let canon = null;
  if (/^\d{3}-[12]$/.test(t)) canon = t;
  else if (/^\d{4}$/.test(t) && (t[3] === "1" || t[3] === "2")) canon = `${t.slice(0, 3)}-${t[3]}`;
  if (!canon || canon > MAX_SEMESTER) return null; // 跳過格式錯誤或晚於 114-2 的學期
  return canon;
}

// --- tiny RFC-4180 CSV parser (handles quotes, embedded commas/newlines) ------
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const BUCKETS = [
  { label: "A+", col: "a_plus" }, { label: "A", col: "a" }, { label: "A-", col: "a_minus" },
  { label: "B+", col: "b_plus" }, { label: "B", col: "b" }, { label: "B-", col: "b_minus" },
  { label: "C+", col: "c_plus" }, { label: "C", col: "c" }, { label: "C-", col: "c_minus" },
  { label: "F", col: "f" },
];
const normHeader = (h) => (h ?? "").replace(/比例/g, "").replace(/[（(].*?[)）]/g, "").replace(/[\s　]+/g, "").trim();
const parsePct = (v) => {
  if (v == null) return null;
  const t = String(v).replace(/%/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function mapColumns(header) {
  const idx = { name: -1, teacher: -1, semester: -1, note: -1, buckets: {} };
  header.forEach((h, i) => {
    const raw = h ?? "";
    if (idx.name === -1 && raw.includes("課程名稱")) idx.name = i;
    else if (idx.teacher === -1 && (raw.includes("教師") || raw.includes("老師"))) idx.teacher = i;
    else if (idx.semester === -1 && raw.includes("學期")) idx.semester = i;
    else if (idx.note === -1 && raw.includes("備註")) idx.note = i;
    const nh = normHeader(raw);
    const b = BUCKETS.find((b) => b.label === nh);
    if (b && idx.buckets[b.col] === undefined) idx.buckets[b.col] = i;
  });
  return idx;
}

async function fetchSheet(id, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${id}/${gid}: HTTP ${res.status}`);
  return await res.text();
}

async function batched(items, size, fn) { for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size)); }
async function withRetry(fn, label, n = 4) { for (let a = 1; ; a++) { let e; try { e = (await fn()).error; } catch (x) { e = x; } if (!e) return; if (a >= n) throw new Error(`${label}: ${e.message || e}`); await new Promise((r) => setTimeout(r, 500 * a)); } }

function completeness(row) { return BUCKETS.reduce((n, b) => n + (row[b.col] != null ? 1 : 0), 0); }

(async () => {
  const dedup = new Map(); // `${match_key}|${semester}` -> row
  let totalRows = 0, skipped = 0;
  for (const src of SOURCES) {
    let text;
    try { text = await fetchSheet(src.id, src.gid); }
    catch (e) { console.warn(`! ${e.message}`); continue; }
    const rows = parseCsv(text);
    if (rows.length < 2) { console.warn(`! ${src.id}/${src.gid}: empty`); continue; }
    const idx = mapColumns(rows[0]);
    if (idx.name === -1 || idx.semester === -1) { console.warn(`! ${src.id}/${src.gid}: 缺 課名/學期 欄`); continue; }
    let kept = 0;
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      totalRows++;
      const name = normName(cells[idx.name]);
      const sem = normSemester(idx.semester >= 0 ? cells[idx.semester] : "");
      if (!name || !sem) { skipped++; continue; }
      const teacher = idx.teacher >= 0 ? normTeacher(cells[idx.teacher]) : "";
      const row = {
        course_name: name,
        teacher: teacher || null,
        match_key: matchKey(name, teacher),
        semester: sem,
        note: idx.note >= 0 && cells[idx.note]?.trim() ? cells[idx.note].trim() : null,
        source: `sheet:${src.id.slice(0, 8)}`,
      };
      for (const b of BUCKETS) row[b.col] = idx.buckets[b.col] != null ? parsePct(cells[idx.buckets[b.col]]) : null;
      const k = `${row.match_key}|${row.semester}`;
      const prev = dedup.get(k);
      if (!prev || completeness(row) > completeness(prev)) dedup.set(k, row);
      kept++;
    }
    console.log(`· ${src.id.slice(0, 8)}/${src.gid}: ${kept} 列 (欄位 name=${idx.name} teacher=${idx.teacher} sem=${idx.semester} buckets=${Object.keys(idx.buckets).length})`);
  }

  const out = [...dedup.values()];
  console.log(`\n解析 ${totalRows} 列；略過 ${skipped}（缺課名/學期）；去重後 ${out.length} 筆 (match_key+學期)`);

  // Coverage: how many will actually surface on a 115-1 course card?
  const cur = new Set();
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("courses").select("course_name, teacher").range(from, from + 999);
    const rows = data ?? [];
    for (const c of rows) cur.add(matchKey(c.course_name, c.teacher));
    if (rows.length < 1000) break;
  }
  const matched = out.filter((r) => cur.has(r.match_key)).length;
  console.log(`其中 ${matched} 筆對得上目前課表(115-1)的課（其餘為歷史課，仍會存起來備用）`);

  if (!APPLY) {
    console.log("\n樣本:", JSON.stringify(out.slice(0, 3), null, 1));
    console.log("(加 --apply 才會寫入)");
    return;
  }
  await batched(out, 500, (chunk) => withRetry(() => sb.from("grade_distributions").upsert(chunk, { onConflict: "match_key,semester" }), "grades"));
  console.log(`✓ 已寫入/更新 ${out.length} 筆 grade_distributions`);
})().catch((e) => { console.error(e); process.exit(1); });
