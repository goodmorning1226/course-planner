// Server-side Supabase clients.
//
// The `server-only` import below makes the build FAIL if this module is ever
// imported into a Client Component, so the service-role key can never leak into
// the browser bundle.
//
// `createServerSupabaseClient()` — request-scoped, uses the anon key + the
//   user's auth cookies, so RLS still applies. Use this in Server Components /
//   route handlers that act on behalf of the logged-in user.
//
// `createServiceRoleClient()` — uses the SERVICE ROLE key, which BYPASSES RLS.
//   Use this ONLY in trusted server contexts (the scraper / scrape route).
import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Request-scoped client bound to the caller's session cookies. All queries run
 * under the user's identity, so RLS policies are enforced.
 */
export function createServerSupabaseClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component — safe to ignore when a
            // middleware refresh is responsible for writing the session cookie.
          }
        },
      },
    }
  );
}

/**
 * Cookie-free anon client for PUBLIC reads (e.g. course search). Because it does
 * not touch request cookies, responses built with it can be safely cached at the
 * CDN (public Cache-Control). RLS still applies (anon can only read public data).
 */
export function createPublicServerClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * Service-role client — bypasses RLS. SERVER-ONLY. Throws if the key is missing
 * so we never silently fall back to an under-privileged client. Use only for
 * trusted writes (the scraper). Never expose its results' write paths to users.
 */
export function createServiceRoleClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (server-only).");
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
