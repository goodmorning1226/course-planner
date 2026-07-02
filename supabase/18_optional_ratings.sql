-- 課程評價：只有「整體」為必填，甜度／涼度改為選填（可為 null）。
-- chk_review_ratings 的 IN 檢查對 null 會得到 UNKNOWN，CHECK 視為通過，故不需改動；
-- 只要移除這兩欄的 NOT NULL 限制即可。rating_overall／rating_solid 維持必填。
alter table public.course_reviews alter column rating_sweet drop not null;
alter table public.course_reviews alter column rating_chill drop not null;
