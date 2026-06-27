"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // Navigate then refresh so the shared layout (Navbar) re-renders logged-out.
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      className="whitespace-nowrap rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-foreground/15 hover:text-foreground disabled:opacity-50 sm:px-3"
    >
      {loading ? "登出中…" : "登出"}
    </button>
  );
}
