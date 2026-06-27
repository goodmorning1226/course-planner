import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { LogoutButton } from "./LogoutButton";
import { NavLinks, ActiveNavLink } from "./NavLinks";
import { TimetableIcon } from "@/components/icons/TimetableIcon";

// Plain wordmark only — deliberately no NTU logo / crest and no official styling.
export async function Navbar() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background shadow-sm">
      <nav className="flex h-14 w-full items-center justify-between gap-2 px-4 sm:px-6 lg:px-10">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <TimetableIcon className="h-5 w-5 shrink-0" />
          <span className="whitespace-nowrap text-base font-semibold tracking-tight">
            急急排排
          </span>
          <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline">
            非官方 · 台大 115-1
          </span>
        </Link>

        <div className="flex items-center gap-0.5 sm:gap-1">
          <NavLinks />

          {user ? (
            <>
              <span
                className="ml-1 hidden max-w-[160px] truncate text-xs text-muted-foreground sm:inline"
                title={user.email ?? ""}
              >
                {user.email}
              </span>
              {isAdminEmail(user.email) && (
                <ActiveNavLink href="/admin" label="後台" />
              )}
              <LogoutButton />
            </>
          ) : (
            <>
              <ActiveNavLink href="/login" label="登入" />
              <ActiveNavLink href="/register" label="註冊" variant="primary" />
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
