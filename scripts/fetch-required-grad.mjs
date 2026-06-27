import { chromium } from "playwright";
import { writeFileSync } from "fs";
const SCR = "./data/curriculum";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ userAgent: UA });
const p = await ctx.newPage();

// DPGCODE list from the grad index dropdown
await p.goto("https://gra108.aca.ntu.edu.tw/graVoxCourse/index.php/gquery/index?INYEAR=115", { waitUntil: "networkidle", timeout: 45000 });
await p.waitForTimeout(1200);
const programs = await p.evaluate(() => {
  const sel = document.querySelector("select[name=DPGCODE]");
  if (!sel) return [];
  return [...sel.options].map(o => ({ code: o.value, text: o.text.trim() }))
    .filter(o => /^[A-Z]\d?-/.test(o.code)); // real DPGCODEs only
});
console.log("grad programs:", programs.length);

async function reqList(dpg) {
  const url = `https://gra108.aca.ntu.edu.tw/graVoxCourse/index.php/gquery/MainPage?DPGCODE=${encodeURIComponent(dpg)}&INYEAR=115`;
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  try {
    await p.waitForFunction(() => [...document.querySelectorAll("table")].some(t => t.rows.length > 1 && [...t.rows[0]?.cells || []].map(c => c.innerText).join("").includes("課程識別碼")), { timeout: 8000 });
  } catch { /* no 必修 table */ }
  return await p.evaluate(() => {
    let best = null;
    for (const t of document.querySelectorAll("table")) {
      const head = [...t.rows[0]?.cells || []].map(c => c.innerText).join("");
      if (head.includes("課程識別碼") && t.rows.length > 1 && (!best || t.rows.length > best.rows.length)) best = t;
    }
    if (!best) return [];
    return [...best.rows].slice(1).map(r => {
      const c = [...r.cells].map(x => x.innerText.trim());
      const id = (c[0] || "").split(/\n/).map(s => s.trim()).find(s => /^\d{3}\s+[0-9A-Za-z]+$/.test(s));
      return id ? { id, name: (c[1] || "").replace(/\s+/g, " ") } : null;
    }).filter(Boolean);
  });
}

const map = {}; // identifier -> { name, depts:{code:name}, programs:[] }
let withData = 0;
for (let i = 0; i < programs.length; i++) {
  const prog = programs[i];
  const deptCode = (prog.text.match(/^(\d{3,4})/) || [])[1];
  if (!deptCode) continue;
  let list = [];
  try { list = await reqList(prog.code); } catch { /* skip */ }
  if (list.length) withData++;
  for (const c of list) {
    const e = map[c.id] || (map[c.id] = { name: c.name, depts: {}, programs: [] });
    e.depts[deptCode] = prog.text.replace(/^\d{3,4}\s*/, "");
    if (!e.programs.includes(prog.code)) e.programs.push(prog.code);
  }
  if (i % 25 === 0) console.log(`prog ${i}/${programs.length} (${prog.code} ${prog.text}) | ids=${Object.keys(map).length}`);
  await sleep(300);
}
writeFileSync(`${SCR}/grad-required.json`, JSON.stringify(map));
console.log(`DONE. programs=${programs.length}, withData=${withData}, distinct required identifiers=${Object.keys(map).length}`);
await b.close();
