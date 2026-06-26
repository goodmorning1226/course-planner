import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { LogoutButton } from "./LogoutButton";

// Plain wordmark only — deliberately no NTU logo / crest and no official styling.
const NAV_LINKS = [
  { href: "/courses", label: "課程搜尋" },
  { href: "/timetable", label: "我的課表" },
];

export async function Navbar() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <nav className="flex h-14 w-full items-center justify-between px-10">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-base font-semibold tracking-tight">急急排排</span>
          <span className="text-xs text-muted-foreground">非官方 · 台大 115-1</span>
        </Link>

        <div className="flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}

          {user ? (
            <>
              <span
                className="ml-1 hidden max-w-[160px] truncate text-xs text-muted-foreground sm:inline"
                title={user.email ?? ""}
              >
                {user.email}
              </span>
              {isAdminEmail(user.email) && (
                <Link
                  href="/admin"
                  className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  後台
                </Link>
              )}
              <LogoutButton />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                登入
              </Link>
              <Link
                href="/register"
                className="ml-1 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
              >
                註冊
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
