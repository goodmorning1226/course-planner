// Insert/refresh the 台科(NTUST) 115-1 校際 courses (open to 台大) into our DB,
// classified as 校際(interschool) + 系所=台科(K020), with 開放台大名額.
// These are an INTENTIONAL external exception (taught at 台科, not 台大 教室課表).
//   node scripts/apply-interschool.mjs            # dry-run
//   node scripts/apply-interschool.mjs --apply    # write
// Only touches courses with source=ntust_interschool; never modifies 台大 courses.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const APPLY = process.argv.includes("--apply");
const SEM = "115-1";
const env = Object.fromEntries(readFileSync(".env", "utf8").split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#")).map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const courses = JSON.parse(readFileSync("./data/curriculum/ntust-interschool.json", "utf8"));
const NOW = new Date().toISOString();
async function batched(items, size, fn) { for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size)); }
async function withRetry(fn, label, n = 4) { for (let a = 1; ; a++) { let e; try { e = (await fn()).error; } catch (x) { e = x; } if (!e) return; if (a >= n) throw new Error(`${label}: ${e.message || e}`); await new Promise(r => setTimeout(r, 500 * a)); } }

const courseRows = courses.map(c => ({
  semester: SEM, pk: c.courseNo, building_or_college: "臺灣科技大學",
  course_name: c.name, class_group: null, teacher: c.teacher,
  source_url: "https://querycourse.ntust.edu.tw/querycourse/",
  scraped_at: NOW, interschool_quota: c.quota, interschool_taken: c.taken,
}));
console.log(`${APPLY ? "APPLYING" : "DRY-RUN"} | 台科校際課 ${courseRows.length} 門 (semester=${SEM})`);
if (!APPLY) { console.log("樣本:", JSON.stringify(courseRows.slice(0, 2))); console.log("(加 --apply 才會寫入)"); process.exit(0); }

// 1) upsert courses, collect id by pk
const idByPk = new Map();
await batched(courseRows, 200, async (chunk) => {
  let data;
  await withRetry(async () => { const r = await sb.from("courses").upsert(chunk, { onConflict: "semester,pk" }).select("id,pk"); data = r.data; return r; }, "courses");
  for (const r of data || []) idByPk.set(r.pk, r.id);
});
console.log(`upserted courses: ${idByPk.size}`);

// 2) sessions: delete old (for these courses) then insert fresh
const ids = [...idByPk.values()];
await batched(ids, 200, c => withRetry(() => sb.from("course_sessions").delete().in("course_id", c), "sessdel"));
const sessRows = [];
for (const c of courses) {
  const id = idByPk.get(c.courseNo); if (!id) continue;
  for (const s of c.sessions) sessRows.push({ course_id: id, weekday: s.weekday, classroom: null, raw_time_text: c.rawTime, periods: s.periods, start_time: null, end_time: null });
}
await batched(sessRows, 500, c => withRetry(() => sb.from("course_sessions").insert(c), "sessins"));
console.log(`sessions: ${sessRows.length}`);

// 3) metadata: 校際 + 系所=台科(K020)
const metaRows = courses.map(c => ({
  course_id: idByPk.get(c.courseNo), official_semester: SEM, official_course_code: null, official_course_identifier: null,
  credits: c.credits, course_type_raw: null, course_type_normalized: "intercollegiate",
  categories: ["interschool", "dept"], dept_codes: ["K020"], dept_grades: [],
  is_general_education: false, ge_categories: [], ge_labels: [], ge_creditable: null,
  source: "ntust_interschool", confidence: "high", matched_semester: SEM, matched_at: NOW,
})).filter(r => r.course_id);
await batched(metaRows, 500, c => withRetry(() => sb.from("course_metadata").upsert(c, { onConflict: "course_id" }), "meta"));
console.log(`metadata: ${metaRows.length}`);
console.log("DONE.");
