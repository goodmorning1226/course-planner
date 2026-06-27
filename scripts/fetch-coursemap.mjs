import { chromium } from "playwright";
import { writeFileSync } from "fs";
const SCR = "./data/curriculum";
const BASE = "https://coursemap.aca.ntu.edu.tw/course_map_all/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const COLLEGES = ["1000", "2000", "3000", "4000", "5000", "6000", "7000", "8000", "9000", "A000", "B000", "SP01", "SP02", "SP99"];

// class code -> 4-digit dept code (1040 stays; 124M/124D -> 1240)
function deptOf(classCode) {
  if (/^\d{4}$/.test(classCode)) return classCode;
  const m = classCode.match(/^(\d{3})[A-Za-z]/);
  return m ? m[1] + "0" : null;
}

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ userAgent: UA });
const p = await ctx.newPage();
async function links(url, rx) {
  await p.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 45000 });
  try { await p.waitForSelector("a", { timeout: 5000 }); } catch {}
  return await p.evaluate((rxs) => {
    const re = new RegExp(rxs);
    return [...document.querySelectorAll("a")].map(a => ({ href: a.getAttribute("href") || "", text: a.innerText.trim() }))
      .filter(l => re.test(l.href)).map(l => ({ code: decodeURIComponent((l.href.match(/code=([^&"]+)/) || [])[1] || ""), text: l.text }));
  }, rx);
}

// 1) colleges -> departments
const deptCodes = new Map();
for (const c of COLLEGES) {
  try { for (const d of await links(`college.php?code=${c}&lang=zh_TW`, "department\\.php\\?code=")) if (d.code) deptCodes.set(d.code, d.text); } catch {}
  await sleep(250);
}
console.log("departments:", deptCodes.size);

// 2) departments -> class codes (班別)
const classCodes = new Map(); // classCode -> text
for (const dc of deptCodes.keys()) {
  try { for (const cl of await links(`department.php?code=${dc}`, "class\\.php\\?code=")) if (cl.code) classCodes.set(cl.code, cl.text); } catch {}
  await sleep(200);
}
console.log("class (班別) codes:", classCodes.size);

// 3) each class -> course codes ; build courseCode -> {depts:{deptCode:classText}}
const map = {};
let i = 0, withData = 0;
for (const [cls, text] of classCodes) {
  const dept = deptOf(cls);
  let courses = [];
  try {
    await p.goto(BASE + `class.php?code=${encodeURIComponent(cls)}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    try { await p.waitForSelector('a[href*="course.php?code="]', { timeout: 5000 }); } catch {}
    courses = await p.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="course.php?code="]')]
      .map(a => decodeURIComponent((a.getAttribute("href").match(/code=([^&"]+)/) || [])[1] || "").replace(/\+/g, " ").trim()).filter(Boolean))]);
  } catch {}
  if (courses.length) withData++;
  for (const code of courses) {
    const e = map[code] || (map[code] = { depts: {}, classes: [] });
    if (dept) e.depts[dept] = text;
    if (!e.classes.includes(cls)) e.classes.push(cls);
  }
  if (i++ % 30 === 0) console.log(`class ${i}/${classCodes.size} (${cls} ${text}) | courses=${Object.keys(map).length}`);
  await sleep(200);
}
writeFileSync(`${SCR}/coursemap.json`, JSON.stringify(map));
console.log(`DONE. depts=${deptCodes.size} classes=${classCodes.size} withData=${withData} distinctCourseCodes=${Object.keys(map).length}`);
await b.close();
