// Fetch 台科(NTUST) 115-1 courses that are OPEN to 台大 (校際, NTURestrict>0),
// parse the 台科 time format, and write data/curriculum/ntust-interschool.json.
// These are taught AT 台科 — a deliberate exception to the "台大 教室課表 only"
// rule, kept as a clearly-sourced external set (校際). NEVER touches 台大 courses.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
const SEM = "1151"; // 115-1
const OUT = "./data/curriculum/ntust-interschool.json";
const WD = { M: 1, T: 2, W: 3, R: 4, F: 5, S: 6, U: 7 }; // 台科 星期字母 → 1..7
const num = v => parseInt(v, 10) || 0;

// "W5,W6,W7" / "M3,M4,W5" → [{ weekday, periods:[...] }] grouped by day, in order.
function parseNode(node) {
  if (!node) return [];
  const byDay = new Map();
  for (const tok of String(node).split(/[,\s]+/)) {
    const m = tok.trim().match(/^([MTWRFSU])(\d{1,2}|[A-Z])$/); // 節次可為數字或字母(夜間A–D)
    if (!m) continue;
    const wd = WD[m[1]];
    if (!byDay.has(wd)) byDay.set(wd, []);
    byDay.get(wd).push(m[2]);
  }
  return [...byDay.entries()].map(([weekday, periods]) => ({ weekday, periods }));
}

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36" });
const p = await ctx.newPage();
await p.goto("https://querycourse.ntust.edu.tw/querycourse/", { waitUntil: "domcontentloaded", timeout: 45000 });
let all = [];
for (let a = 0; a < 5; a++) {
  try {
    const r = await p.request.post("https://querycourse.ntust.edu.tw/QueryCourse/api/Courses", { headers: { "content-type": "application/json", accept: "application/json", referer: "https://querycourse.ntust.edu.tw/querycourse/" }, data: { Semester: SEM, Language: "zh" }, timeout: 90000 });
    all = JSON.parse(await r.text()); break;
  } catch (e) { console.log("retry…", e.message.slice(0, 40)); }
}
const open = all.filter(c => num(c.NTURestrict) > 0);
const courses = open.map(c => ({
  courseNo: c.CourseNo,
  name: (c.CourseName || "").trim(),
  teacher: (c.CourseTeacher || "").trim() || null,
  credits: c.CreditPoint != null ? Number(c.CreditPoint) : null,
  sessions: parseNode(c.Node),
  rawTime: c.Node || null,
  quota: num(c.NTURestrict),       // 開放台大名額
  taken: num(c.NTU_People),        // 已選台大人數
  contents: (c.Contents || "").trim() || null,
}));
mkdirSync("./data/curriculum", { recursive: true });
writeFileSync(OUT, JSON.stringify(courses));
console.log(`台科 ${SEM}: 全部 ${all.length}, 開放台大 ${open.length} → 寫出 ${courses.length} 門`);
console.log("有解析出時間的:", courses.filter(c => c.sessions.length).length);
console.log("樣本:", JSON.stringify(courses.slice(0, 3), null, 1));
await b.close();
