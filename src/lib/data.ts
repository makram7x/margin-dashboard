// Server-side data access for pages: load the store, build the model, read the period filter.

import "server-only";
import { buildCostModel, type CostModel } from "./model/costModel";
import type { Period } from "./model/metrics";
import { loadState } from "./store/fileStore";
import { MONTH_NAMES, type DataState } from "./types";

export function getState(): DataState {
  return loadState();
}

export function getModel(): CostModel {
  return buildCostModel(loadState());
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * ?year=2025&month=3. Defaults to the latest year with data, whole year. year=all means all time.
 * Out-of-range values fall back to defaults rather than rendering an empty page.
 */
export async function readPeriod(searchParams: SearchParams, model: CostModel): Promise<Period> {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const latest = model.years.at(-1) ?? null;

  const y = one(sp.year);
  let year: number | null = latest;
  if (y === "all") year = null;
  else if (y && model.years.includes(Number(y))) year = Number(y);

  const m = Number(one(sp.month));
  const month = Number.isInteger(m) && m >= 1 && m <= 12 ? m : null;
  return { year, month: year === null ? null : month };
}

export function periodLabel(p: Period): string {
  if (p.year === null) return "All time";
  if (p.month === null) return `Full year ${p.year}`;
  return `${MONTH_NAMES[p.month - 1]} ${p.year}`;
}

/** Query string that preserves the current period when linking between pages. */
export function periodQuery(p: Period): string {
  const params = new URLSearchParams();
  params.set("year", p.year === null ? "all" : String(p.year));
  if (p.month !== null) params.set("month", String(p.month));
  return `?${params}`;
}
