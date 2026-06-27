import { chromium } from "playwright";
import { writeFileSync } from "fs";
const SCR = "./data/curriculum";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
const CONCURRENCY = 4;
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ userAgent: UA });

// departments
const tmp = await ctx.newPage();
await tmp.goto("https://curri.aca.ntu.edu.tw/NTUVoxCourse/index.php/uquery/search-result?semester=115&dpt=1010%20&lang=zh&inqudata=Academic", { waitUntil: "domcontentloaded", timeout: 45000 });
const dres = await tmp.request.get("https://curri.aca.ntu.edu.tw/NTUVoxCourse/index.php/api/departments?year=115&lang=zh");
const depts = ((await dres.json()).data || []).map(d => ({ value: d.value, code: d.data.trim() }));
await tmp.close();
console.log("departments:", depts.length);

function parse() {
  let best = null;
  for (const t of document.querySelectorAll("table")) {
    const head = [...t.rows[0]?.cells || []].map(c => c.innerText).join("");
    if (head.includes("課程識別碼") && t.rows.length > 1 && (!best || t.rows.length > best.rows.length)) best = t;
  }
  if (!best) return [];
  return [...best.rows].slice(1).map(r => {
    const c = [...r.cells].map(x => x.innerText.trim());
    const id = (c[0] || "").split(/\n/).map(s => s.trim()).find(s => /^\d{3}\s+[0-9A-Za-z]+$/.test(s));
    return id ? id : null;
  }).filter(Boolean);
}

const tasks = [];
for (const d of depts) for (let g = 1; g <= 8; g++) tasks.push({ d, g });
const map = {};
let done = 0;
async function worker(id) {
  const p = await ctx.newPage();
  while (tasks.length) {
    const t = tasks.pop();
    if (!t) break;
    const url = `https://curri.aca.ntu.edu.tw/NTUVoxCourse/index.php/uquery/search-result?semester=115&dpt=${encodeURIComponent(t.d.value)}&lang=zh&inqudata=Academic&MSLGRD=${t.g}`;
    try {
      await p.goto(url, { waitUntil: "domcontentloaded", timeout: 40000 });
      try { await p.waitForFunction(() => [...document.querySelectorAll("table")].some(x => x.rows.length > 1 && [...x.rows[0]?.cells || []].map(c => c.innerText).join("").includes("課程識別碼")), { timeout: 3500 }); } catch {}
      const ids = await p.evaluate(parse);
      for (const code of ids) {
        const e = map[code] || (map[code] = { depts: {}, grades: [] });
        e.depts[t.d.code] = 1;
        const tok = `${t.d.code}:${t.g}`;
        if (!e.grades.includes(tok)) e.grades.push(tok);
      }
    } catch { /* skip */ }
    if (++done % 60 === 0) console.log(`done ${done}/${depts.length * 8} | codes=${Object.keys(map).length}`);
  }
  await p.close();
}
await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
writeFileSync(`${SCR}/curri-required.json`, JSON.stringify(map));
console.log(`DONE. tasks=${depts.length * 8}, distinct required codes=${Object.keys(map).length}`);
await b.close();
