// Unified API error responses. Every route returns the same shape:
//   { error: { code: string; message: string } }
// Messages are deliberately generic — we never leak Supabase/SQL errors,
// stack traces, or any secret. Log the real error server-side instead.

import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "rate_limited"
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "internal_error";

const STATUS: Record<ApiErrorCode, number> = {
  rate_limited: 429,
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  internal_error: 500,
};

export function apiError(
  code: ApiErrorCode,
  message: string,
  init?: ResponseInit
) {
  return NextResponse.json(
    { error: { code, message } },
    { status: STATUS[code], ...init }
  );
}

/** 429 with a Retry-After header derived from the limiter's reset time. */
export function rateLimited(resetAt: number) {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return apiError("rate_limited", "請求過於頻繁，請稍後再試。", {
    headers: { "Retry-After": String(retryAfter) },
  });
}
