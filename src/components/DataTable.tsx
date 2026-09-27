"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { aed, DASH, hours, pct, rate } from "@/lib/format";

export type ColumnKind = "text" | "aed" | "hours" | "pct" | "rate" | "int" | "meter";

export interface Column {
  key: string;
  label: string;
  kind?: ColumnKind;
  /** Row field holding a URL; the cell becomes a link. */
  href?: string;
  /** Row field shown as a second, muted line under the value. */
  sub?: string;
  /** Colour negatives red and positives green (profit, margin). */
  tone?: boolean;
  /** Tooltip on the header explaining the column. */
  title?: string;
  wrap?: boolean;
}

export type Row = Record<string, string | number | boolean | null | undefined>;

interface Props {
  columns: Column[];
  rows: Row[];
  /** Footer row; keys match columns. */
  footer?: Row;
  /** CSV download filename, without extension. */
  exportName: string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  emptyMessage?: string;
  /** Highlight rows where this field is truthy (e.g. loss-making projects). */
  flagKey?: string;
}

const NUMERIC: ColumnKind[] = ["aed", "hours", "pct", "rate", "int", "meter"];

function display(kind: ColumnKind | undefined, v: Row[string]): string {
  if (v === null || v === undefined || v === "") return DASH;
  if (typeof v !== "number") return String(v);
  switch (kind) {
    case "aed": return aed(v, { unit: false });
    case "hours": return hours(v);
    case "pct":
    case "meter": return pct(v);
    case "rate": return rate(v);
    case "int": return Math.round(v).toLocaleString("en");
    default: return String(v);
  }
}

function csvCell(v: Row[string]): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? String(Math.round(v * 10000) / 10000) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Sortable table with CSV export of exactly what's on screen (raw numbers, not formatted text). */
export function DataTable({ columns, rows, footer, exportName, initialSort, emptyMessage, flagKey }: Props) {
  const [sort, setSort] = useState(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (x == null && y == null) return 0;
      if (x == null) return 1; // blanks last either way
      if (y == null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, sort]);

  function toggle(col: Column) {
    const numeric = NUMERIC.includes(col.kind ?? "text");
    setSort((s) =>
      s?.key === col.key ? { key: col.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: col.key, dir: numeric ? "desc" : "asc" },
    );
  }

  function exportCsv() {
    const lines = [columns.map((c) => csvCell(c.label)).join(",")];
    for (const r of sorted) lines.push(columns.map((c) => csvCell(r[c.key])).join(","));
    if (footer) lines.push(columns.map((c) => csvCell(footer[c.key])).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (rows.length === 0) {
    return <div className="empty"><p>{emptyMessage ?? "Nothing to show for this period."}</p></div>;
  }

  return (
    <div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {columns.map((c) => {
                const numeric = NUMERIC.includes(c.kind ?? "text");
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={numeric ? "r" : undefined}
                    title={c.title}
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    <button type="button" onClick={() => toggle(c)}>
                      {c.label}
                      {active && <span className="sort-ind" aria-hidden>{sort!.dir === "asc" ? "▲" : "▼"}</span>}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} style={flagKey && r[flagKey] ? { background: "var(--bad-soft)" } : undefined}>
                {columns.map((c) => (
                  <Cell key={c.key} col={c} row={r} />
                ))}
              </tr>
            ))}
          </tbody>
          {footer && (
            <tfoot>
              <tr>
                {columns.map((c) => (
                  <td key={c.key} className={NUMERIC.includes(c.kind ?? "text") ? "r" : undefined}>
                    {c.kind === "meter" ? display("pct", footer[c.key]) : footer[c.key] === undefined ? "" : display(c.kind, footer[c.key])}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 12px" }}>
        <button type="button" className="btn btn-small" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
    </div>
  );
}

function Cell({ col, row }: { col: Column; row: Row }) {
  const v = row[col.key];
  const numeric = NUMERIC.includes(col.kind ?? "text");
  const cls = [numeric ? "r" : "", col.wrap ? "wrap" : "", col.tone && typeof v === "number" ? (v < 0 ? "neg" : v > 0 ? "pos" : "") : ""]
    .filter(Boolean)
    .join(" ");

  let content: React.ReactNode = display(col.kind, v);
  if (col.kind === "meter" && typeof v === "number") {
    content = (
      <span className="meter">
        <span className="meter-track" aria-hidden>
          <span className="meter-fill" style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} />
        </span>
        <span style={{ minWidth: 44 }}>{pct(v)}</span>
      </span>
    );
  }
  const href = col.href ? row[col.href] : undefined;
  if (typeof href === "string" && href) content = <Link href={href}>{content}</Link>;

  const sub = col.sub ? row[col.sub] : undefined;
  return (
    <td className={cls || undefined}>
      {content}
      {sub ? <div className="sub">{String(sub)}</div> : null}
    </td>
  );
}
