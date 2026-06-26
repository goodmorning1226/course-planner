"use client";

// Browser Supabase client. Uses the PUBLIC anon key only.
// All access through this client is constrained by RLS policies.

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
