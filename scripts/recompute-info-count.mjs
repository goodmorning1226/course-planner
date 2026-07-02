// Recompute courses.info_count = 評論數 + 成績分布學期數 (distinct semesters
// across grade_distributions + grade_reports), keyed by course identity
// (match_key). Run after imports / when 情報 data changes.
//   node scripts/recompute-info-count.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = { ...process.env };
for (const f of [".env", ".env.local"]) {
  try { for (const l of readFileSync(f, "utf8").split("\n")) { if (!l.includes("=") || l.trim().startsWith("#")) continue; const i = l.indexOf("="); const k = l.slice(0, i).trim(); if (env[k] === undefined) env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, ""); } } catch {}
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const normName = (s) => s.replace(/[\s　]+/g, " ").trim();
const normTeacher = (t) => (t ? t.replace(/[（(]\s*\d+\s*[)）]\s*$/, "").replace(/[\s　]+/g, "").trim() : "");
const mk = (n, t) => `${normName(n)}|${normTeacher(t)}`;

async function all(t, c) { let o = [], f = 0; for (;;) { const { data, error } = await sb.from(t).select(c).range(f, f + 999); if (error) throw error; o = o.concat(data); if (data.length < 1000) break; f += 1000; } return o; }

// info per match_key = reviews count + distinct grade semesters.
const reviews = await all("course_reviews", "match_key");
const gd = await all("grade_distributions", "match_key, semester");
const gr = await all("grade_reports", "match_key, semester");
const reviewCount = {}; for (const r of reviews) reviewCount[r.match_key] = (reviewCount[r.match_key] || 0) + 1;
const gradeSems = {}; for (const g of [...gd, ...gr]) (gradeSems[g.match_key] ??= new Set()).add(g.semester);
const infoByKey = {};
for (const k of new Set([...Object.keys(reviewCount), ...Object.keys(gradeSems)])) {
  infoByKey[k] = (reviewCount[k] || 0) + (gradeSems[k]?.size || 0);
}

// Apply to each course by its identity.
const courses = await all("courses", "id, course_name, teacher, info_count");
const updates = [];
for (const c of courses) {
  const want = infoByKey[mk(c.course_name, c.teacher)] || 0;
  if ((c.info_count ?? 0) !== want) updates.push({ id: c.id, info_count: want });
}
console.log(`課程 ${courses.length}｜有情報的身分 ${Object.keys(infoByKey).length}｜需更新 ${updates.length} 門`);
for (let i = 0; i < updates.length; i += 500) {
  await Promise.all(updates.slice(i, i + 500).map((u) => sb.from("courses").update({ info_count: u.info_count }).eq("id", u.id)));
}
console.log(`✅ 完成，更新 ${updates.length} 門`);
