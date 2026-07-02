"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AvatarIcon } from "@/components/icons/AvatarIcon";

// Circular avatar that opens a dropdown (email · 我的評論 · 後台 · 登出).
// Replaces the inline email + LogoutButton in the navbar.
export function UserMenu({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="relative ml-1" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="使用者選單"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center rounded-full transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
      >
        <AvatarIcon className="h-8 w-8" />
      </button>
      {open && (
        <div className="absolute -right-2 top-full z-50 mt-4 min-w-[190px]">
          {/* 對話框小三角形，指向頭像；往上突出橋接（可壓到 navbar）。 */}
          <span
            aria-hidden
            className="absolute -top-2 right-4 h-3 w-3 rotate-45 border-l border-t border-border bg-background"
          />
          <div
            role="menu"
            className="relative overflow-hidden rounded-md border border-border bg-background py-1 shadow-lg"
          >
          <div className="truncate px-3 py-2 text-xs text-muted-foreground" title={email}>
            {email}
          </div>
          <div className="h-px bg-border" />
          <Link
            href="/favorites"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            我的收藏
          </Link>
          <Link
            href="/my-reviews"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            我的評論
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm transition-colors hover:bg-muted"
            >
              管理後台
            </Link>
          )}
          <div className="h-px bg-border" />
          <button
            type="button"
            onClick={logout}
            disabled={loading}
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-muted disabled:opacity-50"
          >
            {loading ? "登出中…" : "登出"}
          </button>
          </div>
        </div>
      )}
    </div>
  );
}
