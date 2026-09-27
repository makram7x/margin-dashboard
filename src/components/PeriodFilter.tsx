"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Props {
  years: number[];
  year: number | null;
  month: number | null;
  /** Months that have data in the selected year; others are shown disabled. */
  availableMonths: number[];
  allowAllTime?: boolean;
}

/** Year + month selects that write ?year=&month= to the URL; every figure on the page follows. */
export function PeriodFilter({ years, year, month, availableMonths, allowAllTime = true }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function go(nextYear: string, nextMonth: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set("year", nextYear);
    if (nextMonth && nextYear !== "all") sp.set("month", nextMonth);
    else sp.delete("month");
    startTransition(() => router.push(`${pathname}?${sp}`, { scroll: false }));
  }

  const yearValue = year === null ? "all" : String(year);
  return (
    <div className="filters" style={{ opacity: pending ? 0.6 : 1 }}>
      <label htmlFor="pf-year">Period</label>
      <select id="pf-year" value={yearValue} onChange={(e) => go(e.target.value, "")}>
        {[...years].reverse().map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
        {allowAllTime && years.length > 1 && <option value="all">All years</option>}
      </select>
      <select
        aria-label="Month"
        value={month === null ? "" : String(month)}
        disabled={year === null}
        onChange={(e) => go(yearValue, e.target.value)}
      >
        <option value="">Full year</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1} disabled={!availableMonths.includes(i + 1)}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}
