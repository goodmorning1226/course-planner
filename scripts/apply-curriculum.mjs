// Assign dept_codes + 必/選 from the curriculum sources (coursemap + 必修表) to
// EXISTING courses only — NEVER inserts courses. Batched, idempotent writes.
//   node scripts/apply-curriculum.mjs            # dry-run (no writes)
//   node scripts/apply-curriculum.mjs --apply    # write to DB
// Reads data/curriculum/{coursemap,grad-required,curri-required}.json.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const DATA = "./data/curriculum"; // repo-committed data (survives sessions)
const APPLY = process.argv.includes("--apply") || process.env.APPLY === "1";
const env = Object.fromEntries(readFileSync(".env", "utf8").split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#")).map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const cmap = JSON.parse(readFileSync(DATA + "/coursemap.json", "utf8"));    // code -> {depts:{deptCode:text}}
const grad = JSON.parse(readFileSync(DATA + "/grad-required.json", "utf8"));
let curri = {}; try { curri = JSON.parse(readFileSync(DATA + "/curri-required.json", "utf8")); } catch {}

async function batched(items, size, fn) { for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size)); }
async function withRetry(fn, label, attempts = 4) {
  for (let a = 1; ; a++) {
    let err; try { err = (await fn()).error; } catch (e) { err = e; }
    if (!err) return;
    if (a >= attempts) throw new Error(`${label}: ${err.message || err}`);
    await new Promise(r => setTimeout(r, 500 * a));
  }
}

const courses = [];
for (let f = 0; ; f += 1000) { const { data } = await sb.from("courses").select("id,pk,course_name").range(f, f + 999); if (!data?.length) break; courses.push(...data); if (data.length < 1000) break; }
const meta = new Map();
for (let f = 0; ; f += 1000) { const { data } = await sb.from("course_metadata").select("*").range(f, f + 999); if (!data?.length) break; for (const m of data) meta.set(m.course_id, m); if (data.length < 1000) break; }

// 「會計學甲」與「會計學原理」是替代課：凡有「會計原理」列為必修的系，不採計會計甲為
// (系訂)選修。先蒐集所有「會計學原理」在必修表(curri/grad)中被列為必修的系所。
const accPrincipleDepts = new Set();
for (const c of courses) {
  if (!c.course_name || !c.course_name.startsWith("會計學原理")) continue;
  const code = c.pk ? c.pk.replace(/-\d+$/, "") : null;
  for (const d of Object.keys(curri[code]?.depts || {})) accPrincipleDepts.add(d);
  for (const d of Object.keys(grad[code]?.depts || {})) accPrincipleDepts.add(d);
}

const NOW = new Date().toISOString();
const metaUpserts = [], reqRows = [], affectedIds = [];
let uncatFixed = 0, skippedGE = 0, skippedAcc = 0;
for (const c of courses) {
  const code = c.pk ? c.pk.replace(/-\d+$/, "") : null;
  const cm = code && cmap[code];
  if (!cm) continue;
  const depts = Object.keys(cm.depts);
  if (!depts.length) continue;
  const m = meta.get(c.id);
  if (!m) continue;
  const isGE = !!m.is_general_education;
  const ownPrefix = (code.match(/^([0-9A-Za-z]{3})/) || [])[1] || "";
  const isAccJia = !!(c.course_name && c.course_name.startsWith("會計學甲"));

  // Decide which coursemap depts this course actually counts toward.
  const allowed = [], skipped = [];
  for (const d of depts) {
    const isReqD = grad[code]?.depts?.[d] || curri[code]?.depts?.[d];
    // (a) 自己系開的通識、且非該系必修 → 不計系訂選修（採計規則：本系所開通識不計選修）。
    if (isGE && ownPrefix && d.slice(0, 3) === ownPrefix && !isReqD) { skipped.push(d); skippedGE++; continue; }
    // (b) 會計甲：有「會計原理」必修的系，不採計甲為選修。
    if (isAccJia && !isReqD && accPrincipleDepts.has(d)) { skipped.push(d); skippedAcc++; continue; }
    allowed.push({ d, isReqD: !!isReqD });
  }

  const cats = new Set(m.categories || []);
  if (cats.has("uncategorized")) { cats.delete("uncategorized"); uncatFixed++; }
  // dept_codes = union(既有, 允許)，再移除被跳過(自系通識/會計甲)的代碼。
  const newDepts = [...new Set([...(m.dept_codes || []), ...allowed.map(a => a.d)])].filter(d => !skipped.includes(d));
  // 只剩通識/不隸屬任何系所 → 移除「系所」標籤。
  const hasDept = newDepts.length > 0;
  if (hasDept) cats.add("dept"); else cats.delete("dept");
  const ctn = m.course_type_normalized === "unknown" ? (hasDept ? "departmental" : "unknown") : m.course_type_normalized;
  metaUpserts.push({ ...m, dept_codes: newDepts, categories: [...cats], course_type_normalized: ctn,
    source: "coursemap", confidence: "high", matched_at: NOW });
  affectedIds.push(c.id);
  for (const { d, isReqD } of allowed) {
    reqRows.push({ course_id: c.id, target_department_name: cm.depts[d], target_department_code: d, target_college_name: null,
      audience_raw: cm.depts[d], requirement_raw: isReqD ? "必修" : "選修", requirement_normalized: isReqD ? "required" : "elective",
      source: "coursemap", confidence: "high", matched_semester: "115" });
  }
}
const reqCount = reqRows.filter(r => r.requirement_normalized === "required").length;
console.log(`${APPLY ? "APPLYING" : "DRY-RUN"} | 影響課程=${affectedIds.length} 未分類修好=${uncatFixed} 必修=${reqCount} 選修=${reqRows.length - reqCount} | 跳過(自系通識選修=${skippedGE}, 會計甲=${skippedAcc})`);

if (APPLY) {
  console.log("writing metadata…");
  await batched(metaUpserts, 500, c => withRetry(() => sb.from("course_metadata").upsert(c, { onConflict: "course_id" }), "meta"));
  console.log("replacing requirements…");
  await batched(affectedIds, 200, c => withRetry(() => sb.from("course_requirements").delete().in("course_id", c), "reqdel"));
  await batched(reqRows, 500, c => withRetry(() => sb.from("course_requirements").insert(c), "reqins"));
  console.log("DONE.");
}
