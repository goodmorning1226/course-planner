// Insert/refresh the 台科(NTUST) 115-1 校際 courses (open to 台大) into our DB,
// classified as 校際(interschool) + 系所=台科(K020), with 開放台大名額.
// These are an INTENTIONAL external exception (taught at 台科, not 台大 教室課表).
//   node scripts/apply-interschool.mjs            # dry-run
//   node scripts/apply-interschool.mjs --apply    # write
// Only touches courses with building_or_college='臺灣科技大學'; never 台大 courses.
//
// Like the classroom scraper it now: detects added/updated/restored courses and
// writes a change log (course_changes), and SOFT-DELETES (status='removed', 停開)
// 台科 courses that dropped out of the API — reappearing ones are restored.
// Reports 2-step progress (fetch→apply) when run under an admin SCRAPE_RUN_ID.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const APPLY = process.argv.includes("--apply");
const SEM = "115-1";
const NTUST_BUILDING = "臺灣科技大學";
const SECTION = "台科大";
const RUN_ID = process.env.SCRAPE_RUN_ID || null;

// env: prefer the inherited process.env (admin spawn), fall back to .env(.local).
function readEnv() {
  const out = { ...process.env };
  for (const file of [".env", ".env.local"]) {
    try {
      for (const l of readFileSync(file, "utf8").split("\n")) {
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
const courses = JSON.parse(readFileSync("./data/curriculum/ntust-interschool.json", "utf8"));
const NOW = new Date().toISOString();
const twDate = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const CHANGE_ON = twDate();
async function batched(items, size, fn) { for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size)); }
async function withRetry(fn, label, n = 4) { for (let a = 1; ; a++) { let e; try { e = (await fn()).error; } catch (x) { e = x; } if (!e) return; if (a >= n) throw new Error(`${label}: ${e.message || e}`); await new Promise(r => setTimeout(r, 500 * a)); } }

async function setProgress(fields) {
  if (!APPLY || !RUN_ID) return;
  await sb.from("scrape_progress").upsert({ run_id: RUN_ID, building: SECTION, ...fields }, { onConflict: "run_id,building" });
}

const courseRows = courses.map(c => ({
  semester: SEM, pk: c.courseNo, building_or_college: NTUST_BUILDING,
  course_name: c.name, class_group: null, teacher: c.teacher,
  source_url: "https://querycourse.ntust.edu.tw/querycourse/",
  scraped_at: NOW, interschool_quota: c.quota, interschool_taken: c.taken,
  status: "active", removed_at: null,
}));
console.log(`${APPLY ? "APPLYING" : "DRY-RUN"} | 台科校際課 ${courseRows.length} 門 (semester=${SEM})`);
if (!APPLY) { console.log("樣本:", JSON.stringify(courseRows.slice(0, 2))); console.log("(加 --apply 才會寫入)"); process.exit(0); }

// 0) admin run bookkeeping: ensure the run exists (the API may have pre-created
// it before the fetch step) + advance progress to step 1/2.
if (RUN_ID) {
  await sb.from("scrape_runs").upsert({ id: RUN_ID, semester: SEM, status: "running", section: "ntust" }, { onConflict: "id" });
  await setProgress({ total_count: 2, done_rooms: 1, scraped_count: courseRows.length, status: "running" });
}

// 1) load existing 台科 courses (+ sessions) for diff / soft-delete.
const existing = new Map(); // pk -> { id, name, teacher, status, sessKeys:Set }
{
  const { data: rows } = await sb.from("courses")
    .select("id, pk, course_name, teacher, status").eq("building_or_college", NTUST_BUILDING);
  for (const r of rows || []) existing.set(r.pk, { id: r.id, name: r.course_name, teacher: r.teacher, status: r.status || "active", sessKeys: new Set() });
  const ids = (rows || []).map(r => r.id);
  await batched(ids, 300, async (chunk) => {
    const { data } = await sb.from("course_sessions").select("course_id, weekday, raw_time_text, periods").in("course_id", chunk);
    const byId = new Map([...existing].map(([pk, e]) => [e.id, e]));
    for (const s of data || []) byId.get(s.course_id)?.sessKeys.add(`${s.weekday ?? ""}|${s.raw_time_text ?? ""}|${(s.periods ?? []).join(",")}`);
  });
}

// 2) upsert courses, collect id by pk
const idByPk = new Map();
await batched(courseRows, 200, async (chunk) => {
  let data;
  await withRetry(async () => { const r = await sb.from("courses").upsert(chunk, { onConflict: "semester,pk" }).select("id,pk"); data = r.data; return r; }, "courses");
  for (const r of data || []) idByPk.set(r.pk, r.id);
});
console.log(`upserted courses: ${idByPk.size}`);

// 3) sessions: delete old (for these courses) then insert fresh (whole-set replace
// is safe here — single source, full set every run).
const ids = [...idByPk.values()];
await batched(ids, 200, c => withRetry(() => sb.from("course_sessions").delete().in("course_id", c), "sessdel"));
const sessRows = [];
const newSessKeys = new Map(); // pk -> Set(sessKey)
for (const c of courses) {
  const id = idByPk.get(c.courseNo); if (!id) continue;
  const keys = new Set();
  for (const s of c.sessions) {
    sessRows.push({ course_id: id, weekday: s.weekday, classroom: null, raw_time_text: c.rawTime, periods: s.periods, start_time: null, end_time: null });
    keys.add(`${s.weekday ?? ""}|${c.rawTime ?? ""}|${(s.periods ?? []).join(",")}`);
  }
  newSessKeys.set(c.courseNo, keys);
}
await batched(sessRows, 500, c => withRetry(() => sb.from("course_sessions").insert(c), "sessins"));
console.log(`sessions: ${sessRows.length}`);

// 4) metadata: 校際 + 系所=台科(K020)
const metaRows = courses.map(c => ({
  course_id: idByPk.get(c.courseNo), official_semester: SEM, official_course_code: null, official_course_identifier: null,
  credits: c.credits, course_type_raw: null, course_type_normalized: "intercollegiate",
  categories: ["interschool", "dept"], dept_codes: ["K020"], dept_grades: [],
  is_general_education: false, ge_categories: [], ge_labels: [], ge_creditable: null,
  source: "ntust_interschool", confidence: "high", matched_semester: SEM, matched_at: NOW,
})).filter(r => r.course_id);
await batched(metaRows, 500, c => withRetry(() => sb.from("course_metadata").upsert(c, { onConflict: "course_id" }), "meta"));
console.log(`metadata: ${metaRows.length}`);

// 5) change log + soft-delete
const changes = [];
const push = (type, c, detail) => changes.push({ run_id: RUN_ID, course_id: c.id ?? null, course_pk: c.pk ?? null, course_name: c.name ?? null, building_or_college: NTUST_BUILDING, change_type: type, detail: detail ?? null, changed_on: CHANGE_ON });
for (const c of courses) {
  const prev = existing.get(c.courseNo);
  const id = idByPk.get(c.courseNo);
  if (!prev) { push("added", { id, pk: c.courseNo, name: c.name }, null); continue; }
  if (prev.status === "removed") push("restored", { id, pk: c.courseNo, name: c.name }, null);
  const detail = {};
  if ((prev.name ?? "") !== (c.name ?? "")) detail.name = { from: prev.name, to: c.name };
  if ((prev.teacher ?? "") !== (c.teacher ?? "")) detail.teacher = { from: prev.teacher, to: c.teacher };
  const nk = newSessKeys.get(c.courseNo) ?? new Set();
  const added = [...nk].filter(k => !prev.sessKeys.has(k));
  const removed = [...prev.sessKeys].filter(k => !nk.has(k));
  if (added.length || removed.length) detail.sessions = { added, removed };
  if (Object.keys(detail).length) push("updated", { id, pk: c.courseNo, name: c.name }, detail);
}
// soft-delete 台科 courses that vanished from the API
const newPks = new Set(courses.map(c => c.courseNo));
const gone = [...existing].filter(([pk, e]) => !newPks.has(pk) && e.status === "active");
if (gone.length) {
  await batched(gone.map(([, e]) => e.id), 200, c => withRetry(() => sb.from("courses").update({ status: "removed", removed_at: NOW }).in("id", c), "softdel"));
  for (const [pk, e] of gone) push("removed", { id: e.id, pk, name: e.name }, null);
  console.log(`soft-deleted: ${gone.length}`);
}
await batched(changes, 500, c => withRetry(() => sb.from("course_changes").insert(c), "changes"));
console.log(`change log: ${changes.length}`);

// 6) finish run
if (RUN_ID) {
  await setProgress({ total_count: 2, done_rooms: 2, scraped_count: courseRows.length, status: "done" });
  await sb.from("scrape_runs").update({ finished_at: NOW, status: "success", course_count: courseRows.length }).eq("id", RUN_ID);
}
console.log("DONE.");
