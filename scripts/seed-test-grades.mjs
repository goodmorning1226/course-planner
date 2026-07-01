// Seed a TEST course + many grade-distribution / grade-report cases so the
// 成績分布 A 版 display can be eyeballed end-to-end (special/complete/partial,
// edge-localisation, gaps, 無資料, and conflict detection).
//   node scripts/seed-test-grades.mjs            # dry-run
//   node scripts/seed-test-grades.mjs --apply    # write
// Idempotent: re-running replaces the test data. Local only (service-role key).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const APPLY = process.argv.includes("--apply");
const SEM = "115-1";
const COURSE_NAME = "【測試】成績分布課程";
const TEACHER = "測試老師";
const PK = "TEST-GRADES";

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

// match_key must match lib/reviews/key.ts (course identity).
const normName = (s) => s.replace(/[\s　]+/g, " ").trim();
const normTeacher = (t) => (t ? t.replace(/[（(]\s*\d+\s*[)）]\s*$/, "").replace(/[\s　]+/g, "").trim() : "");
const KEY = `${normName(COURSE_NAME)}|${normTeacher(TEACHER)}`;

// Legacy per-bucket rows — one semester per display case.
const B = (o) => ({ a_plus: null, a: null, a_minus: null, b_plus: null, b: null, b_minus: null, c_plus: null, c: null, c_minus: null, f: null, ...o });
const DISTS = [
  ["114-2", B({ a: 20, a_minus: 30, b_plus: 25, b: 15, b_minus: 10 }), "完整分散 → 全實心長條"],
  ["114-1", B({ a: 20, a_minus: 50, b_plus: 30 }), "3連續=100 特例 → 更高|A-|更低"],
  ["113-2", B({ a_plus: 60, a: 40 }), "頂2=100 特例 → A+|更低"],
  ["113-1", B({ c_minus: 30, f: 70 }), "底2=100 特例 → 更高|F"],
  ["112-2", B({ c_minus: 3.2, f: 2.1 }), "零星+底端邊緣 → 更高(推)|C-|F"],
  ["112-1", B({ a_plus: 83.8 }), "零星+頂端邊緣 → A+|更低(推)"],
  ["111-2", B({ a: 30, b: 25 }), "零星無邊緣 → A|B|無資料"],
  ["111-1", B({ a: 50, c: 50 }), "完整含空格(中間為0) → A|C"],
  ["110-2", B({ a: 100 }), "單一等第 100%"],
];

// User-report cases (need distinct users). semester → [ {u, pivot, same, above, below} ]
const REPORTS = {
  "110-1": [
    { u: 0, pivot: "A-", same: 20, above: 30, below: 50 },
    { u: 1, pivot: "B", same: 40, above: 55, below: 5 },
  ], // 多筆回報還原（含中間 gap）
  "109-2": [
    { u: 0, pivot: "A", same: 30, above: 0, below: 70 },
    { u: 1, pivot: "A", same: 80, above: 0, below: 20 },
  ], // 衝突：同等第差距過大
  "109-1": [
    { u: 0, pivot: "A+", same: 90, above: null, below: 10 },
    { u: 1, pivot: "A", same: 30, above: 15, below: 55 },
  ], // 衝突：加總 > 100%
  "108-2": [{ u: 2, pivot: "B+", same: 35, above: 40, below: 25 }], // 單一使用者回報
};
const TEST_USERS = ["test-grade-1@example.com", "test-grade-2@example.com", "test-grade-3@example.com"];

async function ensureUser(email) {
  // listUsers is paginated; scan a couple pages for the email.
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data?.users ?? []).find((u) => u.email === email);
    if (hit) return hit.id;
    if ((data?.users ?? []).length < 200) break;
  }
  const { data, error } = await sb.auth.admin.createUser({ email, password: "test-grade-pw-123456", email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  console.log(`${APPLY ? "APPLYING" : "DRY-RUN"} | 測試課程「${COURSE_NAME} / ${TEACHER}」`);
  console.log(`  match_key = ${KEY}`);
  console.log(`  課程分布 ${DISTS.length} 學期、使用者回報 ${Object.keys(REPORTS).length} 學期`);
  for (const [sem, , desc] of DISTS) console.log(`   · ${sem}  ${desc}`);
  for (const sem of Object.keys(REPORTS)) console.log(`   · ${sem}  ${REPORTS[sem].map((r) => r.pivot).join(",")} (回報)`);
  if (!APPLY) {
    console.log("\n(加 --apply 才會寫入；會先清除同 match_key 的舊測試資料)");
    return;
  }

  // 1. Course row (so it's browsable + has the 修課情報 button).
  await sb.from("courses").upsert(
    { semester: SEM, pk: PK, course_name: COURSE_NAME, teacher: TEACHER, building_or_college: "測試", status: "active", scraped_at: new Date().toISOString() },
    { onConflict: "semester,pk" }
  );

  // 2. Wipe prior test data for this identity (idempotent).
  await sb.from("grade_distributions").delete().eq("match_key", KEY);
  await sb.from("grade_reports").delete().eq("match_key", KEY);

  // 3. Legacy distributions.
  const distRows = DISTS.map(([semester, buckets]) => ({
    course_name: COURSE_NAME, teacher: TEACHER, match_key: KEY, semester,
    ...buckets, note: null, source: "test", submitted_by: null,
  }));
  const de = (await sb.from("grade_distributions").insert(distRows)).error;
  if (de) throw de;

  // 4. Resolve test users, then insert reports.
  const uids = [];
  for (const email of TEST_USERS) uids.push(await ensureUser(email));
  const reportRows = [];
  for (const [semester, list] of Object.entries(REPORTS)) {
    for (const r of list) {
      reportRows.push({
        user_id: uids[r.u], course_name: COURSE_NAME, teacher: TEACHER, match_key: KEY, semester,
        pivot: r.pivot, same_pct: r.same, above_pct: r.above ?? null, below_pct: r.below ?? null,
      });
    }
  }
  const re = (await sb.from("grade_reports").insert(reportRows)).error;
  if (re) throw re;

  console.log(`\n✅ 完成：${distRows.length} 筆分布 + ${reportRows.length} 筆回報`);
  console.log(`   看這裡：/course-info?name=${encodeURIComponent(COURSE_NAME)}&teacher=${encodeURIComponent(TEACHER)}`);
}
main().catch((e) => { console.error("FAILED:", e.message || e); process.exit(1); });
