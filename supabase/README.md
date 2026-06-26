# supabase/

所有資料庫相關的 SQL（schema、RLS policy、索引、function/trigger、種子資料）都放在這個資料夾。
直接打開檔案，把內容貼到 **Supabase Dashboard → SQL Editor** 執行即可。

## 檔案說明

| 檔案 | 用途 |
|---|---|
| `00_full_setup.sql` | **一次性完整安裝**。整份貼到 SQL Editor 跑一次，建好 extensions、function、schema、indexes、RLS，並（可選）灌入假種子資料。 |
| `01_schema.sql` | 資料表、`set_updated_at()` function 與 `updated_at` 觸發器。 |
| `02_rls_policies.sql` | Row Level Security 政策。 |
| `03_indexes.sql` | 搜尋／篩選用索引（含 `pg_trgm` 課名/教師模糊搜尋、`periods` 的 GIN）。 |
| `04_seed_sample.sql` | **假的** 範例課程＋時段，僅供前端開發，非真實臺大資料。 |

## 使用方式

### A. 最快：用 `00_full_setup.sql`
1. Supabase 專案 → SQL Editor → New query。
2. 貼上 `00_full_setup.sql` 全部內容 → Run。
3. 完成。可重複執行（idempotent）。

### B. 分步執行（方便維護／檢視）
依序執行：
`01_schema.sql` → `03_indexes.sql` → `02_rls_policies.sql` → （可選）`04_seed_sample.sql`

> `00_full_setup.sql` 是上述四個檔案的合併版；維護時請讓兩邊保持一致。

## 資料表

| 表 | 說明 | 存取 |
|---|---|---|
| **courses** | 課程主檔（學期＋流水號 `pk`）。一門課一列。 | 公開唯讀；只有 service role 可寫 |
| **course_sessions** | 課程的上課時段／教室（一門課可有多筆）。含 `weekday`、`periods`、`raw_time_text`、`start_time`、`end_time`。 | 公開唯讀；只有 service role 可寫 |
| **user_timetables** | 使用者的具名暫排課表（可有多張）。 | RLS：只能存取自己的 |
| **timetable_courses** | 課表 ↔ 課程的關聯。 | RLS：透過所屬課表的擁有者控管 |
| **scrape_runs** | 爬蟲執行紀錄。 | service role 專用；一般使用者完全不可讀寫 |

### 關聯
```
courses 1───* course_sessions
courses 1───* timetable_courses *───1 user_timetables *───1 auth.users
```

### 防重複匯入的 unique constraint
- `courses` → `unique (semester, pk)`：同學期同流水號只會有一列（爬蟲 upsert 目標）。
- `course_sessions` → `unique (course_id, weekday, raw_time_text, classroom)`。
- `timetable_courses` → `unique (timetable_id, course_id)`：同一門課不會在一張課表重複。

## RLS 摘要

| 表 | select | insert | update | delete |
|---|---|---|---|---|
| courses | 所有人 | ✗（service role） | ✗ | ✗ |
| course_sessions | 所有人 | ✗（service role） | ✗ | ✗ |
| user_timetables | 自己 | 自己 | 自己 | 自己 |
| timetable_courses | 自己的課表 | 自己的課表 | ✗ | 自己的課表 |
| scrape_runs | ✗ | ✗ | ✗ | ✗ |（service role 繞過 RLS）|

> 「✗（service role）」表示一般 anon／登入使用者沒有對應 policy，因此被拒絕；
> 只有 service-role key 會繞過 RLS 來寫入。

## updated_at trigger

`set_updated_at()` 會在 **courses** 與 **user_timetables** 的 `UPDATE` 時自動把
`updated_at` 設為 `now()`。

## 插入 sample data

`04_seed_sample.sql` 內含**假的**範例課程與時段（非真實臺大資料），僅供前端開發時
有資料可看。`00_full_setup.sql` 末段也已包含同一份種子，所以跑完整安裝就已經有了。

若只想單獨補上種子（例如資料被清掉後）：

1. SQL Editor → New query。
2. 貼上 `04_seed_sample.sql` 全部內容 → Run。可重複執行（upsert／`on conflict do nothing`）。

> 種子只灌 `courses` / `course_sessions` 與一筆 `scrape_runs`；
> `user_timetables` / `timetable_courses` 需要真實 `auth.users` id，請從 app 註冊後
> 加課產生。真實資料則由爬蟲 `npm run scrape` 寫入。

## 查看 RLS 是否開啟

在 SQL Editor 執行，確認 `public` 各表 `rowsecurity` 皆為 `true`：

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
-- courses / course_sessions / user_timetables / timetable_courses / scrape_runs
-- 全部都應為 true
```

查看每張表實際掛了哪些 policy：

```sql
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

> Supabase Dashboard 也可在 **Table Editor → 該表 → RLS** 直接看到是否開啟與 policy 列表。
> 注意：`scrape_runs` 開了 RLS 但**沒有任何 policy**，因此一般 anon／登入使用者一律被拒，
> 只有 service-role（繞過 RLS）能存取——這是預期行為。

## 重要注意事項

- **不會動到 Supabase Auth**：只 `references auth.users`，不重建、不取代 `auth.users`，不自建 users table。
- **service-role key 僅用於伺服器／爬蟲**，絕不可放進前端或 commit 進 repo。
- 前端只用 anon key，所有存取都受上述 RLS 約束。
- 本專案不蒐集學號、不蒐集真實姓名；課表不公開。

## 重設資料表

`00_full_setup.sql` 用 `create table if not exists`，所以**已存在的表不會被改欄位**。
若需要完全重來（例如改過 schema、或先前跑過舊版 scaffold 的 `user_courses`/`crawl_meta`），
在你的專案是**全新、無重要資料**的前提下，可在 SQL Editor 先執行下列 **破壞性** 重設，
再貼 `00_full_setup.sql`：

```sql
-- ⚠️ 會刪除這些表與其資料，請確認沒有要保留的資料再執行
drop table if exists public.timetable_courses cascade;
drop table if exists public.user_timetables  cascade;
drop table if exists public.course_sessions  cascade;
drop table if exists public.scrape_runs      cascade;
drop table if exists public.courses          cascade;
-- 舊版可能存在的表
drop table if exists public.user_courses     cascade;
drop table if exists public.crawl_meta       cascade;
```
