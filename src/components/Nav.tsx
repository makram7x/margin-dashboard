"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/projects", label: "Projects" },
  { href: "/productivity", label: "Productivity" },
  { href: "/categories", label: "Categories" },
  { href: "/departments", label: "Departments" },
  { href: "/audit", label: "Cost audit" },
  { href: "/data", label: "Data" },
  { href: "/settings", label: "Settings" },
];

// Pages that share the year/month filter keep it when you move between them.
const PERIOD_PAGES = new Set(["/", "/productivity", "/categories", "/departments", "/audit"]);

export function Nav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const period = new URLSearchParams();
  for (const k of ["year", "month"]) {
    const v = params.get(k);
    if (v) period.set(k, v);
  }
  const qs = period.toString();

  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        const href = qs && PERIOD_PAGES.has(l.href) ? `${l.href}?${qs}` : l.href;
        return (
          <Link key={l.href} href={href} aria-current={active ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
