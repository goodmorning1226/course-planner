"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Main nav links with an active-page highlight. Client component so it can read
// the current pathname; the rest of the Navbar stays a server component.
// `shortLabel` is shown on narrow screens where the full label wouldn't fit.
const NAV_LINKS = [
  { href: "/", label: "課程搜尋" },
  { href: "/timetable", label: "我的課表" },
];

// 收藏 now lives in the avatar dropdown (「我的收藏」) instead of the navbar.
export function NavLinks() {
  return (
    <>
      {NAV_LINKS.map((link) => (
        <ActiveNavLink
          key={link.href}
          href={link.href}
          label={link.label}
          shortLabel={link.shortLabel}
        />
      ))}
    </>
  );
}

// A single nav link that highlights itself when it matches the current route.
// `variant` "primary" is the filled style used by 註冊. When `shortLabel` is
// given, it replaces the full label on narrow screens (below the sm breakpoint).
export function ActiveNavLink({
  href,
  label,
  shortLabel,
  variant = "ghost",
}: {
  href: string;
  label: string;
  shortLabel?: string;
  variant?: "ghost" | "primary";
}) {
  const pathname = usePathname();
  const active = pathname === href;

  // Shared shape; primary (註冊) keeps a small left gap from 登入.
  const base =
    "whitespace-nowrap rounded-md px-2 py-2 text-sm transition-colors sm:px-3";
  const tone = active
    ? "bg-foreground font-medium text-background"
    : "text-muted-foreground hover:bg-foreground/15 hover:text-foreground";
  const className = cn(base, tone, variant === "primary" && "ml-0.5 sm:ml-1");

  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={className}>
      {shortLabel ? (
        <>
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}
    </Link>
  );
}
