/**
 * NTU course-catalog (課程網, nol.ntu.edu.tw) reader for classification enrichment.
 *
 * The classroom schedule has no classification; nol does. nol is plain UTF-8,
 * GET-based, no WAF — so fetch + regex is enough (no browser needed).
 *
 *   GET search_for_02_dpt.php?current_sem=<sem>&dptname=<deptCode>&selcode=-1
 *       &alltime=yes&allproced=yes&allsel=yes&op=&startrec=<N>&page_cnt=<size>
 *
 * Result table data rows have 18 cells; the columns we use:
 *   [1] 授課對象 (department audience)   [2] 課號 (course code)
 *   [3] 班次 (class)                     [4] 課程名稱
 *   [5] 領域專長 (GE area / 國文領域…)    [6] 學分 (credits)
 *   [7] 課程識別碼 (= our courses.pk base) [9] 必/選修
 *
 * MATCH KEY: `${識別碼}` + (班次 ? `-${班次}` : "")  ===  our courses.pk
 *
 * NOTE: nol's latest semester is 114-x (115-1 not published yet) → this is a
 * HISTORICAL source. Callers should record source=historical_match / medium.
 */

const BASE = "https://nol.ntu.edu.tw/nol/coursesearch";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export interface NolRecord {
  pk: string; // matches our courses.pk
  identifier: string; // 課程識別碼
  classGroup: string | null; // 班次
  courseCode: string | null; // 課號
  courseName: string | null;
  field: string | null; // 領域專長 (academic specialization, NOT GE area)
  credits: number | null;
  audience: string | null; // 授課對象 (系所)
  reqRaw: string | null; // 必/選修
  remark: string | null; // 備註 — holds the GE marker e.g. "兼通識A4*"
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<t[dh][\s\S]*?<\/t[dh]>/gi)].map((m) =>
    m[0]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Department codes from the search form (e.g. "2010" 數學系). */
async function fetchDeptCodes(semester: string): Promise<string[]> {
  const res = await fetch(`${BASE}/search_for_02_dpt.php?current_sem=${semester}`, {
    headers: { "User-Agent": UA },
  });
  const html = await res.text();
  const sel = html.match(/name="dptname"[\s\S]*?<\/select>/i)?.[0] ?? "";
  const codes = [...sel.matchAll(/value="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((v) => /^\w{3,4}$/.test(v)); // skip "" / "查詢" etc.
  return Array.from(new Set(codes));
}

/** Parse one result page's data rows into NolRecords. */
function parsePage(html: string): NolRecord[] {
  // The results live in the table with the most <tr>.
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  if (tables.length === 0) return [];
  const big = tables.reduce((a, b) =>
    (b.match(/<tr/gi)?.length ?? 0) > (a.match(/<tr/gi)?.length ?? 0) ? b : a
  );
  const out: NolRecord[] = [];
  for (const row of big.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const c = cells(row);
    if (c.length < 10) continue;
    const identifier = c[7];
    // identifier looks like "201 001A0" / "000 10110".
    if (!/^\w{3}\s\w{4,6}$/.test(identifier)) continue;
    const classGroup = c[3] || null;
    const creditsNum = parseFloat(c[6]);
    out.push({
      identifier,
      classGroup,
      pk: classGroup ? `${identifier}-${classGroup}` : identifier,
      courseCode: c[2] || null,
      courseName: c[4] || null,
      field: c[5] || null,
      credits: Number.isFinite(creditsNum) ? creditsNum : null,
      audience: c[1] || null,
      reqRaw: c[9] || null,
      remark: c[15] || null,
    });
  }
  return out;
}

async function fetchDeptRecords(
  semester: string,
  dept: string,
  delayMs: number,
  pageSize = 150
): Promise<NolRecord[]> {
  const all: NolRecord[] = [];
  for (let startrec = 0; ; startrec += pageSize) {
    const url =
      `${BASE}/search_for_02_dpt.php?current_sem=${semester}` +
      `&dptname=${encodeURIComponent(dept)}&coursename=&teachername=&yearcode=` +
      `&selcode=-1&alltime=yes&allproced=yes&allsel=yes&op=&startrec=${startrec}` +
      `&page_cnt=${pageSize}`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) break;
    const recs = parsePage(await res.text());
    all.push(...recs);
    if (recs.length < pageSize) break; // last page
    await sleep(delayMs);
  }
  return all;
}

/**
 * Crawl the whole catalog for `semester` → Map keyed by our pk. A pk can have
 * several records (same course offered to several 授課對象) → array.
 */
export async function fetchNolCatalog(
  semester: string,
  opts: { delayMs?: number; depts?: string[]; onDept?: (d: string, n: number, total: number) => void } = {}
): Promise<Map<string, NolRecord[]>> {
  const delayMs = opts.delayMs ?? 800;
  const depts = opts.depts ?? (await fetchDeptCodes(semester));
  const map = new Map<string, NolRecord[]>();
  let i = 0;
  for (const dept of depts) {
    i++;
    try {
      const recs = await fetchDeptRecords(semester, dept, delayMs);
      for (const r of recs) {
        const list = map.get(r.pk) ?? [];
        list.push(r);
        map.set(r.pk, list);
      }
      opts.onDept?.(dept, recs.length, depts.length);
    } catch {
      opts.onDept?.(dept, -1, depts.length);
    }
    await sleep(delayMs);
  }
  return map;
}
