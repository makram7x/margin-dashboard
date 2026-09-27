"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { aed, pct } from "@/lib/format";

export interface MonthPoint {
  year: number;
  month: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number | null;
}

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function niceStep(max: number, ticks = 4): number {
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}

/**
 * Revenue recognised vs cost, one pair of columns per month. One axis (both are AED).
 * Hover or focus a month for exact figures; click it to filter the page to that month.
 */
export function MonthlyChart({ points, selectedMonth }: { points: MonthPoint[]; selectedMonth: number | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [hover, setHover] = useState<number | null>(null);

  const W = 820, H = 250, left = 52, right = 8, top = 12, bottom = 28;
  const plotW = W - left - right, plotH = H - top - bottom;
  const max = Math.max(1, ...points.flatMap((p) => [p.revenue, p.cost]));
  const step = niceStep(max);
  const yMax = Math.ceil(max / step) * step;
  const y = (v: number) => top + plotH - (Math.max(0, v) / yMax) * plotH;
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);

  const slot = plotW / Math.max(points.length, 1);
  const barW = Math.min(20, (slot - 14) / 2);

  function select(p: MonthPoint) {
    const sp = new URLSearchParams(params.toString());
    sp.set("year", String(p.year));
    if (selectedMonth === p.month) sp.delete("month");
    else sp.set("month", String(p.month));
    router.push(`${pathname}?${sp}`, { scroll: false });
  }

  const hp = hover === null ? null : points[hover];

  return (
    <div className="chart">
      <div className="legend" style={{ marginBottom: 8 }}>
        <span><i className="swatch" style={{ background: "var(--series-1)" }} /> Revenue recognised</span>
        <span><i className="swatch" style={{ background: "var(--series-2)" }} /> Cost (salaries + overhead)</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly revenue and cost">
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? "baseline" : "gridline"} x1={left} x2={W - right} y1={y(t)} y2={y(t)} />
            <text className="tick" x={left - 8} y={y(t) + 4} textAnchor="end">
              {aed(t, { compact: true, unit: false })}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = left + slot * i + slot / 2;
          const selected = selectedMonth === p.month;
          return (
            <g
              key={`${p.year}-${p.month}`}
              className={`col${selected ? " selected" : ""}`}
              tabIndex={0}
              role="button"
              aria-label={`${SHORT[p.month - 1]} ${p.year}: revenue ${aed(p.revenue)}, cost ${aed(p.cost)}, margin ${pct(p.margin)}`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => select(p)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), select(p))}
              style={{ cursor: "pointer" }}
            >
              <rect className="hit" x={cx - slot / 2 + 2} y={top} width={slot - 4} height={plotH} rx={6} />
              <Column x={cx - barW - 1} w={barW} y0={y(0)} y1={y(p.revenue)} className="bar-rev" />
              <Column x={cx + 1} w={barW} y0={y(0)} y1={y(p.cost)} className="bar-cost" />
              <text className="tick" x={cx} y={H - 8} textAnchor="middle" style={selected ? { fill: "var(--ink)", fontWeight: 600 } : undefined}>
                {SHORT[p.month - 1]}
              </text>
            </g>
          );
        })}
      </svg>
      {hp && (
        <div
          className="tooltip"
          style={{
            left: `${((left + slot * hover! + slot / 2) / W) * 100}%`,
            top: 0,
            transform: `translateX(${hover! > points.length / 2 ? "calc(-100% - 24px)" : "24px"})`,
          }}
        >
          <div className="tt-title">{SHORT[hp.month - 1]} {hp.year}</div>
          <div className="tt-row"><span className="tt-key"><i style={{ background: "var(--series-1)" }} />Revenue</span><span className="tt-val">{aed(hp.revenue)}</span></div>
          <div className="tt-row"><span className="tt-key"><i style={{ background: "var(--series-2)" }} />Cost</span><span className="tt-val">{aed(hp.cost)}</span></div>
          <div className="tt-row"><span className="tt-key">Profit</span><span className={`tt-val ${hp.profit < 0 ? "neg" : ""}`}>{aed(hp.profit)}</span></div>
          <div className="tt-row"><span className="tt-key">Margin</span><span className={`tt-val ${hp.margin !== null && hp.margin < 0 ? "neg" : ""}`}>{pct(hp.margin)}</span></div>
        </div>
      )}
    </div>
  );
}

/** Column with a 4px rounded top and a square foot on the baseline. */
function Column({ x, w, y0, y1, className }: { x: number; w: number; y0: number; y1: number; className: string }) {
  const h = Math.max(0, y0 - y1);
  if (h === 0) return null;
  const r = Math.min(4, h, w / 2);
  const d = `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`;
  return <path className={className} d={d} />;
}
