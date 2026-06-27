"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Main nav links with an active-page highlight. Client component so it can read
// the current pathname; the rest of the Navbar stays a server component.
const NAV_LINKS = [
  { href: "/", label: "課程搜尋" },
  { href: "/timetable", label: "我的課表" },
];

export function NavLinks() {
  return (
    <>
      {NAV_LINKS.map((link) => (
        <ActiveNavLink key={link.href} href={link.href} label={link.label} />
      ))}
    </>
  );
}

// A single nav link that highlights itself when it matches the current route.
// `variant` "primary" is the filled style used by 註冊.
export function ActiveNavLink({
  href,
  label,
  variant = "ghost",
}: {
  href: string;
  label: string;
  variant?: "ghost" | "primary";
}) {
  const pathname = usePathname();
  const active = pathname === href;

  let className: string;
  if (variant === "primary") {
    className = active
      ? "ml-1 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background"
      : "ml-1 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-foreground/15 hover:text-foreground";
  } else {
    className = active
      ? "rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background"
      : "rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-foreground/15 hover:text-foreground";
  }

  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={className}>
      {label}
    </Link>
  );
}
