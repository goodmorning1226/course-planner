# course-planner

> **非官方臺大 115-1 暫排課工具。** 資料來自公開可查詢之臺大教室課表整理而來，
> 僅供提前排課參考，正式資訊以臺大課程網為準。

讓臺大學生在正式課程網公告前，依據 115-1 教室課表中已出現的課程，提前搜尋課程、
卡好時段、排出暫定課表的小工具。使用者查詢的是 **我們自己的資料庫**，不會即時打
臺大網站；爬蟲低頻執行、與使用者請求完全解耦。

```
[NTU 教室課表] --(低頻爬蟲, server-only)--> [Supabase Postgres]
                                                 │
[使用者瀏覽器] --(anon key + RLS)--> [Next.js] --> 讀 courses / 讀寫自己的 timetable_courses
```

---

## 一、功能

- **課程搜尋** — 依課名、教師、教室、流水號搜尋（debounce 300ms）。
- **篩選** — 星期、節次（0–10、A–D）、建物／學院、教室、教師。
- **Infinite scroll** — cursor 分頁、捲到底自動載入，無傳統分頁。
- **加入課表** — 一鍵加入／移除，已加入狀態清楚標示。
- **衝堂提示** — 允許時段重疊，但同 weekday + period 多門課會清楚標示衝堂。
- **localStorage 暫存** — 未登入時暫排課表存在瀏覽器（`selected-courses-1151`）。
- **登入後雲端保存** — 登入後課表存到 Supabase，跨裝置同步；可把本機課表合併上雲。
- **非官方聲明** — 首次進站 dialog + 全站頁尾常駐聲明 + 各頁提示。
- **低頻爬蟲** — Node + Cheerio，排程低頻抓取公開教室課表。
- **Supabase RLS** — 使用者只能讀寫自己的課表。
- **Rate limit** — 所有 API 端點限流；錯誤格式統一、不洩漏內部資訊。

---

## 二、技術棧

- **Next.js 14（App Router）** + **TypeScript**
- **Tailwind CSS** — Minimal Clean UI（刻意不使用臺大校徽、不模仿官方 UI）
- **Supabase** — **PostgreSQL** + **Supabase Auth**（email/password）+ **RLS**
- **Node.js scraper** + **Cheerio**（來源為 server-rendered HTML，不需瀏覽器）
- **Playwright** — 端到端瀏覽器互動測試（開發用，未列入 dependencies）
- **zod** — server-side 輸入驗證
- 部署：**Vercel**（建議）或 **Cloudflare Pages**

### 專案結構
```
app/                  Next.js 頁面與 API routes
  page.tsx            首頁
  courses/            課程搜尋頁
  timetable/          我的課表頁
  login/ register/    登入 / 註冊
  api/                courses / timetable / scrape 路由
components/           UI 元件 (layout / courses / timetable / auth / disclaimer / ui)
lib/                  supabase client、節次轉換、衝堂判斷、驗證、rate limit、雲端課表
scripts/              低頻爬蟲
supabase/             所有 SQL（schema / RLS / indexes / seed）— 見 supabase/README.md
middleware.ts         刷新 Supabase session cookie
```

---

## 三、環境變數

複製 `.env.example` 為 `.env.local` 後填入。`.env` / `.env.local` 已 gitignore，
**絕不可 commit**。

| 變數 | 用途 | 可進前端？ |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon 公鑰（受 RLS 約束） | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | service role 金鑰，**繞過 RLS**，僅爬蟲／伺服器用 | ❌ 絕不可 |
| `SCRAPE_ADMIN_SECRET` | 觸發 `POST /api/scrape` 的共用密鑰（`x-scrape-secret` header） | ❌ |
| `UPSTASH_REDIS_REST_URL` | （選用）production rate limit 用 | ❌ |
| `UPSTASH_REDIS_REST_TOKEN` | （選用）production rate limit 用 | ❌ |
| `NTU_SEMESTER` | 爬蟲目標學期（`1151`，`115-1` 亦可，會正規化） | ❌ |
| `NTU_CLASSROOM_URL` | 教室課表來源 URL | ❌ |

> 帶 `NEXT_PUBLIC_` 前綴的值會被打包進前端 bundle；其餘只在伺服器使用。
> `lib/supabase/server.ts` 以 `server-only` 在 **build 階段**阻擋 service-role
> 金鑰進入前端。

---

## 四、Supabase 設定

1. **建立 Supabase project** — 到 <https://supabase.com> → New project，選地區、設定資料庫密碼。
2. **打開 SQL Editor** — Dashboard → 左側 **SQL Editor** → New query。
3. **貼上 SQL** — 打開本專案 [`supabase/00_full_setup.sql`](supabase/00_full_setup.sql)，整份內容複製貼上。
4. **執行** — 按 **Run**。會建立 extensions、schema、indexes、RLS、trigger，並灌入少量假種子資料（可重複執行）。
5. **設定 Auth** — Dashboard → **Authentication → Providers → Email** 啟用 Email 登入。密碼最短長度設為 8。視需求開關 **Confirm email**（關閉則註冊後可直接登入；開啟則需收確認信）。
6. **設定環境變數** — 到 **Project Settings → API** 取得 Project URL、anon key、service_role key，填入 `.env.local`（見上節）。

> 詳細的資料表、RLS、重設與檢查方式，見 [`supabase/README.md`](supabase/README.md)。

---

## 五、開發指令

```bash
npm install      # 安裝套件
npm run dev      # 本機開發伺服器 http://localhost:3000
npm run scrape   # 執行低頻爬蟲（需 Supabase env；SCRAPE_DRY_RUN=1 只解析不寫入）
npm run build    # production build
npm run lint     # ESLint
# 另有：npm start（啟動 build）、npm run typecheck（tsc --noEmit）
```

### 部署

- **Vercel（建議）** — 推到 GitHub → New Project → 匯入 → 在 **Environment Variables**
  填入所有變數（`service_role`／`SCRAPE_ADMIN_SECRET` 設為一般加密變數，**勿加
  `NEXT_PUBLIC_` 前綴**）→ Deploy。排程爬蟲用 Vercel Cron 或 GitHub Actions。
- **Cloudflare Pages** — 需 `@cloudflare/next-on-pages` 轉接，環境變數同上。
- 其他支援 Next.js 的平台亦可，重點不變：service-role 金鑰與爬蟲 secret 僅放伺服器端。

---

## 六、爬蟲說明

爬蟲位於 [`scripts/scrape-ntu-classrooms.ts`](scripts/scrape-ntu-classrooms.ts)，
低頻抓取 → 寫進 Supabase（service-role）→ 使用者只讀我們的 DB。

**用 Playwright（headless Chromium）驅動**：來源的查詢需要 `SelectButton=查詢`、
課程資料藏在頁面的 JS 變數 `timeDT`、且來源前有 WAF——用真實瀏覽器最穩。執行環境需先
安裝瀏覽器：

```bash
npx playwright install chromium
NTU_BUILDINGS=共同 SCRAPE_MAX_ROOMS=3 SCRAPE_DRY_RUN=1 npm run scrape  # 先小範圍試跑
npm run scrape                                                         # 正式抓取全部建物
```

可用環境變數：`SCRAPE_DRY_RUN`（只解析不寫）、`NTU_BUILDINGS`（逗號分隔限定建物，
預設讀來源下拉全部）、`SCRAPE_MAX_ROOMS`（每棟最多幾間，測試用）、`SCRAPE_DELAY_MS`
（請求間隔，預設 1500）。同一門課跨多節／多天會以**流水號（`cr_cono`）**歸成一門、
時段去重。

- **低頻執行** — 建議一天一兩次，用排程觸發，不會在使用者查詢時即時打臺大網站。
- **不登入臺大系統** — 只讀公開可查詢的教室課表。
- **不繞過驗證** — 不規避任何來源端的存取控制。
- **不高頻請求** — 單執行緒、不平行、每次請求間隔 delay、送正常 User-Agent；
  個別教室／建物被來源拒絕時略過並記錄，不中斷整體。
- **使用者只查我們的資料庫** — 前端永遠不會直接連到臺大來源。

> 線上可用 `POST /api/scrape`（需 `x-scrape-secret`、極低 rate limit）手動觸發，
> 但 **production 不建議公開此 endpoint**，較佳做法是把 `npm run scrape` 排在受信任
> 環境執行。實作細節與來源結構分析見爬蟲檔頭註解。

---

## 六之二、課程分類 enrichment

教室課表只有上課時間/教室，**沒有課程分類**（通識領域、共同必修、系必選修…）。
`scripts/enrich-course-metadata.ts` 用來把分類補進兩張**附加表**（不動既有 courses）：

- `course_metadata` — 課程本身的分類（通識 A1–A8、共同必修/選修、學分、課號…）。
- `course_requirements` — 對某系/院而言是必修還是選修（同一門課對不同系可能不同）。

```bash
# 先在 Supabase SQL Editor 貼上 supabase/05_course_metadata.sql 建表，再執行：
npm run enrich
```

**分類來源優先序**（記在 `source` / `confidence`）：
1. `official_1151` 官方課程資料（可信度 **高**）
2. `historical_match` 依歷史學期（114-1/113-1…）比對（**中**）
3. `course_code_inference` 依課號推估（僅限系所/學院，**低/中**）
4. 取不到 → **尚未分類**（unknown）

> **重要：不靠課名或 LLM 猜測。** 通識、必選修等分類必須來自官方或歷史資料；取不到
> 就顯示「尚未分類」，前端對歷史/課號推估會明確標示「依歷史 / 課號資料推估，正式資訊
> 請以臺大課程網為準」。

> **風險聲明：** 通識、共同、必選修等分類**會影響畢業/選課判斷**。若來源不是
> `official_1151`，僅供參考，正式資訊一律以臺大課程網公告為準。

**維護：** 115-1 課程網正式公告後重跑 `npm run enrich`，可把分類更新為高可信度；
仍不確定的就維持「尚未分類」，不猜。

> 目前 `fetchClassification()`（script 內）是**唯一待接的整合點** —— NTU 課程網
> （官方/歷史）來源尚未接上，所以現在跑 enrich 會把所有課維持「尚未分類」。

## 七、隱私說明

- **不要求學號**、**不要求真實姓名**（schema 無對應欄位）。
- **不公開個人課表** — 沒有分享／公開功能；RLS 確保只有本人能存取。
- **未登入** — 暫排課表只存在瀏覽器 localStorage。
- **登入** — 課表存在 Supabase，受 RLS 保護。
- **不自行儲存密碼** — 一律由 **Supabase Auth** 處理。
- 若日後加入 analytics，**只使用匿名統計**，不蒐集可識別個資。

---

## Rate limiting

[`lib/rate-limit.ts`](lib/rate-limit.ts) 是 **in-memory 固定視窗** 限流，零設定、
適合本機開發與單一實例。各端點上限（每 IP，定義於 `RATE_LIMITS`）：

| 端點 | 上限 |
|---|---|
| `GET /api/courses` | 90 / 分鐘 |
| `GET /api/timetable` | 60 / 分鐘 |
| `POST` / `DELETE /api/timetable/courses` | 60 / 分鐘 |
| `POST /api/scrape` | **3 / 小時**（且需 admin secret） |
| 登入 / 註冊 | 由 Supabase Auth 伺服器端限流；前端表單送出時 disable 防連點 |

超過上限回 `429` 並附 `Retry-After`。**Production / 多實例部署請改用共享儲存**：
**Upstash Redis**（已預留 `UPSTASH_REDIS_REST_URL` / `_TOKEN`）、**Vercel KV**、
**Cloudflare KV** 或自架 **Redis**；`rateLimit()` call site 介面不變。

### API 錯誤格式

所有 `/api/*` 路由錯誤統一回傳，且**不洩漏** Supabase/SQL/stack/金鑰：

```json
{ "error": { "code": "invalid_request", "message": "查詢參數不合法。" } }
```

`code` ∈ `rate_limited | invalid_request | unauthorized | forbidden | internal_error`。
輸入經 zod 驗證（`q≤100`、`limit≤50`、`weekday 1–7`、`period` 限合法節次、
`courseId` 為 uuid、`cursor` 限安全字元、未知欄位一律 strip）。

---

## 八、非官方聲明

> **本專案非臺大官方網站，與臺大教務處或臺大課程網無關。資料可能不完整、不準確且
> 可能變動。正式資訊請以臺大課程網公告為準。**

請勿將本站資料視為正式選課依據。

---

## 九、下架與聯絡

> 若臺大相關單位認為本專案資料使用、呈現方式或系統行為不妥，專案維護者會配合修正
> 或下架。

---

## 開發進度

- [x] 基礎專案架構、頁面骨架、Navbar、頁尾聲明、首次進站聲明 dialog
- [x] Supabase schema / RLS / indexes / seed（`supabase/`）
- [x] TS 型別、節次轉換、衝堂判斷、zod 驗證
- [x] Supabase 連線設定（browser / server / service-role / public client）
- [x] 爬蟲抓取與節次轉換接上真實端點（fetch + Cheerio）
- [x] 課程搜尋（篩選 + infinite scroll）接上 API
- [x] 我的課表（weekly grid / 手機 list / 衝堂標示 / 移除）
- [x] Supabase Auth 登入／註冊／登出（含 middleware session、Navbar 狀態）
- [x] 我的課表雲端同步與合併（登入後讀寫 Supabase、localStorage→雲端合併）
- [x] 資安強化（rate limit、統一錯誤格式、scrape endpoint 保護）
- [x] 全站瀏覽器互動驗證（Playwright，33/33）
- [ ] production 將 rate limit 換成 Redis；爬蟲接上排程；distinct 篩選選項
