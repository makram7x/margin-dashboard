// How an upload is folded into what's already stored. Pure functions: state in, state out.
//
//   Timesheet — the file is authoritative for every month it contains. Those months are replaced
//               wholesale (so deleted rows really disappear); every other month is untouched.
//   Salaries  — upsert per person per month. Blank cells don't erase an existing figure.
//   Prices    — upsert per ref code. Projects absent from the file are kept.

import type { DataState, ProjectPrice, SalaryRecord, TimesheetEntry, YearMonth } from "../types";
import { monthKey, monthLabel } from "../types";

export interface MergeResult {
  state: DataState;
  summary: string;
}

export function mergeTimesheet(state: DataState, entries: TimesheetEntry[], months: YearMonth[]): MergeResult {
  const replacing = new Set(months.map(monthKey));
  const kept = state.timesheet.filter((e) => !replacing.has(monthKey(e)));
  const previous = new Map<string, number>();
  for (const e of state.timesheet) {
    if (replacing.has(monthKey(e))) previous.set(monthKey(e), (previous.get(monthKey(e)) ?? 0) + 1);
  }

  const replaced = months.filter((m) => previous.has(monthKey(m)));
  const added = months.filter((m) => !previous.has(monthKey(m)));
  const parts: string[] = [];
  if (added.length) parts.push(`added ${describeMonths(added)}`);
  if (replaced.length) parts.push(`replaced ${describeMonths(replaced)}`);

  return {
    state: { ...state, timesheet: [...kept, ...entries] },
    summary: `${entries.length} timesheet rows: ${parts.join("; ")}. Other months unchanged.`,
  };
}

export function mergeSalaries(state: DataState, records: SalaryRecord[]): MergeResult {
  const key = (r: SalaryRecord) => `${r.employeeKey}|${monthKey(r)}`;
  const byKey = new Map(state.salaries.map((r) => [key(r), r]));
  let updated = 0;
  let added = 0;
  let unchanged = 0;
  for (const r of records) {
    const existing = byKey.get(key(r));
    if (!existing) added++;
    else if (existing.amount !== r.amount || existing.employeeName !== r.employeeName) updated++;
    else unchanged++;
    byKey.set(key(r), r);
  }
  const people = new Set(records.map((r) => r.employeeKey)).size;
  return {
    state: { ...state, salaries: [...byKey.values()] },
    summary: `${records.length} salary figures for ${people} people: ${added} new, ${updated} changed, ${unchanged} unchanged.`,
  };
}

export function mergePrices(state: DataState, projects: ProjectPrice[]): MergeResult {
  const byRef = new Map(state.projects.map((p) => [p.refCode, p]));
  let added = 0;
  let updated = 0;
  for (const p of projects) {
    const existing = byRef.get(p.refCode);
    if (!existing) added++;
    else if (JSON.stringify(existing) !== JSON.stringify(p)) updated++;
    byRef.set(p.refCode, p);
  }
  return {
    state: { ...state, projects: [...byRef.values()] },
    summary: `${projects.length} projects: ${added} new, ${updated} changed, ${projects.length - added - updated} unchanged.`,
  };
}

/** "Jan–Mar 2025" style when contiguous in one year, otherwise a list. */
function describeMonths(months: YearMonth[]): string {
  if (months.length === 1) return monthLabel(months[0]);
  const sorted = [...months].sort((a, b) => a.year - b.year || a.month - b.month);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const contiguous =
    first.year === last.year && sorted.every((m, i) => m.year === first.year && m.month === first.month + i);
  if (contiguous) return `${monthLabel(first, true).split(" ")[0]}–${monthLabel(last, true)}`;
  return sorted.map((m) => monthLabel(m, true)).join(", ");
}
