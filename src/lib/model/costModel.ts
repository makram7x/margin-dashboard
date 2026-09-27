// The cost model. Implements the brief's maths exactly, one calendar month at a time:
//
//   direct rate (person, month)   = salary ÷ that person's total logged hours
//   indirect pool (month)         = salaries of people with no hours (support staff)
//                                 + everyone's non-billable hours × their direct rate
//                                 + monthly overhead
//   indirect rate (month)         = indirect pool ÷ billable hours
//   cost of a billable entry      = hours × (direct rate + indirect rate)
//
// Every salary dirham therefore lands in exactly one place: on billable hours directly, or in
// the pool, which is then spread over the same billable hours. With overhead = 0 the cost of all
// billable entries sums to total salaries. The one exception is a month with no billable hours
// at all, where the pool has nothing to be spread over; it is kept as "unallocated" cost so that
// totals still reconcile.
//
// Revenue: a project's price is recognised in proportion to hours, i.e. each billable entry earns
// price × entry hours ÷ project lifetime hours. This is the brief's "employee revenue share",
// applied per month, so period views get revenue that matches the work done in the period.

import { projectDisplayName } from "../format";
import { normCategory, normName } from "../ingest/cells";
import type { DataState, ProjectPrice, SalaryRecord, Settings, TimesheetEntry, YearMonth } from "../types";
import { monthKey, monthLabel } from "../types";

export interface EmployeeMonth {
  employeeKey: string;
  employeeName: string;
  department: string;
  /** null when no salary row was found for this person and month. */
  salary: number | null;
  matchedByName: boolean;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  /** salary ÷ total hours; 0 when the salary is missing. */
  directRate: number;
  /** non-billable hours × direct rate: this person's contribution to the indirect pool. */
  nonBillableCost: number;
}

export interface SupportStaff {
  employeeKey: string;
  employeeName: string;
  salary: number;
}

export interface MonthLedger extends YearMonth {
  key: string;
  employees: EmployeeMonth[];
  supportStaff: SupportStaff[];
  /** All salaries counted this month: people with hours + support staff. */
  salaryTotal: number;
  supportStaffCost: number;
  nonBillableCost: number;
  overhead: number;
  pool: number;
  totalHours: number;
  billableHours: number;
  /** pool ÷ billable hours; null when there are no billable hours. */
  indirectRate: number | null;
  /** Σ cost of billable entries. */
  allocatedCost: number;
  /** Pool that couldn't be spread because there were no billable hours. */
  unallocatedCost: number;
}

export interface CostedEntry extends TimesheetEntry {
  billable: boolean;
  directRate: number;
  indirectRate: number;
  /** Billable entries only; non-billable time is already inside the indirect pool. */
  directCost: number;
  indirectCost: number;
  cost: number;
  /** hours × direct rate for every entry: what this time cost in salary, billable or not. */
  salaryValue: number;
  /** Recognised project revenue (billable entries on a priced project). */
  revenue: number;
}

export interface ProjectInfo {
  refCode: string;
  name: string;
  company: string | null;
  category: string | null;
  status: string | null;
  price: number | null;
  salesPeriod: YearMonth | null;
  /** Is the ref code on the price list at all? */
  listed: boolean;
  lifetimeHours: number;
}

export type IssueSeverity = "error" | "warning" | "info";

export interface Issue {
  severity: IssueSeverity;
  code:
    | "missing-salary"
    | "unpriced-project"
    | "no-ref-code"
    | "no-billable-hours"
    | "salary-without-timesheet"
    | "support-staff"
    | "price-without-hours"
    | "matched-by-name";
  title: string;
  detail: string;
  /** Months this issue touches (empty = not tied to a month). */
  months: YearMonth[];
  refCode?: string;
  employeeKey?: string;
}

export interface CostModel {
  settings: Settings;
  months: MonthLedger[];
  entries: CostedEntry[];
  projects: Map<string, ProjectInfo>;
  issues: Issue[];
  years: number[];
}

export const NO_REF = "(no ref code)";

export function isBillable(category: string, settings: Settings): boolean {
  const c = normCategory(category).toLowerCase();
  return settings.billableCategories.some((b) => normCategory(b).toLowerCase() === c);
}

export function overheadFor(period: YearMonth, settings: Settings): number {
  return settings.overheadOverrides[monthKey(period)] ?? settings.overheadMonthly;
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

const sum = <T>(items: T[], f: (t: T) => number) => items.reduce((acc, t) => acc + f(t), 0);

function periodFromKey(key: string): YearMonth {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

function refOf(e: TimesheetEntry): string {
  return e.refCode || NO_REF;
}

// ---------------------------------------------------------------------------------------------

export function buildCostModel(state: DataState): CostModel {
  const { settings } = state;
  const issues: Issue[] = [];

  const entriesByMonth = groupBy(state.timesheet, monthKey);
  const salariesByMonth = groupBy(state.salaries, monthKey);

  // Salaries for months with no timesheet can't be costed against anything yet.
  for (const [key, records] of salariesByMonth) {
    if (!entriesByMonth.has(key)) {
      const period = periodFromKey(key);
      issues.push({
        severity: "info",
        code: "salary-without-timesheet",
        title: `Salaries for ${monthLabel(period)} but no timesheet yet`,
        detail: `${records.length} salary figures are loaded for ${monthLabel(period)}, but there are no hours for that month, so the month is left out of every figure until its timesheet is uploaded.`,
        months: [period],
      });
    }
  }

  // Billable project hours over all time: the denominator for revenue recognition.
  const lifetimeHours = new Map<string, number>();
  for (const e of state.timesheet) {
    if (isBillable(e.category, settings)) lifetimeHours.set(refOf(e), (lifetimeHours.get(refOf(e)) ?? 0) + e.hours);
  }
  const projects = buildProjects(state.projects, state.timesheet, lifetimeHours, settings);

  const months: MonthLedger[] = [];
  const entries: CostedEntry[] = [];

  const monthKeys = [...entriesByMonth.keys()].sort();
  for (const key of monthKeys) {
    const period = periodFromKey(key);
    const monthEntries = entriesByMonth.get(key)!;
    const monthSalaries = salariesByMonth.get(key) ?? [];
    const ledger = buildMonth(period, monthEntries, monthSalaries, settings, issues);
    months.push(ledger);

    const byPerson = new Map(ledger.employees.map((p) => [p.employeeKey, p]));
    const indirectRate = ledger.indirectRate ?? 0;
    for (const e of monthEntries) {
      const person = byPerson.get(e.employeeKey)!;
      const billable = isBillable(e.category, settings);
      const directCost = billable ? e.hours * person.directRate : 0;
      const indirectCost = billable ? e.hours * indirectRate : 0;
      const project = projects.get(refOf(e));
      const revenue =
        billable && project?.price != null && project.lifetimeHours > 0
          ? project.price * (e.hours / project.lifetimeHours)
          : 0;
      entries.push({
        ...e,
        billable,
        directRate: person.directRate,
        indirectRate: billable ? indirectRate : 0,
        directCost,
        indirectCost,
        cost: directCost + indirectCost,
        salaryValue: e.hours * person.directRate,
        revenue,
      });
    }
    ledger.allocatedCost = sum(entries.filter((e) => monthKey(e) === key && e.billable), (e) => e.cost);
  }

  issues.push(...projectIssues(projects, entries));

  // Support staff are expected, not errors, but say who was treated that way so it's visible.
  const supportRows = months.flatMap((m) => m.supportStaff.map((s) => ({ ...s, year: m.year, month: m.month })));
  for (const rows of groupBy(supportRows, (s) => s.employeeKey).values()) {
    const periods = uniqueMonths(rows);
    issues.push({
      severity: "info",
      code: "support-staff",
      title: `${rows[0].employeeName} treated as support staff`,
      detail: `${rows[0].employeeName} has a salary but logged no hours in ${periods.length} month${periods.length === 1 ? "" : "s"}, so AED ${Math.round(sum(rows, (r) => r.salary)).toLocaleString("en")} of salary goes into the indirect pool for those months.`,
      months: periods,
      employeeKey: rows[0].employeeKey,
    });
  }

  const years = [...new Set(months.map((m) => m.year))].sort();
  return { settings, months, entries, projects, issues, years };
}

function buildMonth(
  period: YearMonth,
  monthEntries: TimesheetEntry[],
  monthSalaries: SalaryRecord[],
  settings: Settings,
  issues: Issue[],
): MonthLedger {
  const label = monthLabel(period);
  const salaryByKey = new Map(monthSalaries.map((s) => [s.employeeKey, s]));
  const salaryByName = new Map(monthSalaries.map((s) => [normName(s.employeeName), s]));
  const usedSalaries = new Set<SalaryRecord>();

  const employees: EmployeeMonth[] = [];
  for (const [employeeKey, rows] of groupBy(monthEntries, (e) => e.employeeKey)) {
    const first = rows[0];
    let salaryRow = salaryByKey.get(employeeKey);
    let matchedByName = false;
    if (!salaryRow) {
      const byName = salaryByName.get(normName(first.employeeName));
      if (byName && !usedSalaries.has(byName)) {
        salaryRow = byName;
        matchedByName = true;
      }
    }
    if (salaryRow) usedSalaries.add(salaryRow);

    const totalHours = sum(rows, (r) => r.hours);
    const billableHours = sum(rows.filter((r) => isBillable(r.category, settings)), (r) => r.hours);
    const salary = salaryRow?.amount ?? null;
    const directRate = salary !== null && totalHours > 0 ? salary / totalHours : 0;

    if (salary === null) {
      issues.push({
        severity: "warning",
        code: "missing-salary",
        title: `No salary for ${first.employeeName} in ${label}`,
        detail: `${first.employeeName} logged ${totalHours.toFixed(1)} h in ${label} but has no salary figure for that month, so their time is costed at AED 0 direct. Project costs are understated until the salary is uploaded.`,
        months: [period],
        employeeKey,
      });
    } else if (matchedByName) {
      issues.push({
        severity: "info",
        code: "matched-by-name",
        title: `${first.employeeName} matched to salary by name`,
        detail: `The employee number on the timesheet didn't match the salary sheet in ${label}, so the salary row was matched on the name "${salaryRow!.employeeName}". Check the employee numbers agree.`,
        months: [period],
        employeeKey,
      });
    }

    employees.push({
      employeeKey,
      employeeName: first.employeeName,
      department: first.department,
      salary,
      matchedByName,
      totalHours,
      billableHours,
      nonBillableHours: totalHours - billableHours,
      directRate,
      nonBillableCost: (totalHours - billableHours) * directRate,
    });
  }

  const supportStaff: SupportStaff[] = monthSalaries
    .filter((s) => !usedSalaries.has(s))
    .map((s) => ({ employeeKey: s.employeeKey, employeeName: s.employeeName, salary: s.amount }));

  const supportStaffCost = sum(supportStaff, (s) => s.salary);
  const nonBillableCost = sum(employees, (p) => p.nonBillableCost);
  const overhead = overheadFor(period, settings);
  const pool = supportStaffCost + nonBillableCost + overhead;
  const billableHours = sum(employees, (p) => p.billableHours);
  const indirectRate = billableHours > 0 ? pool / billableHours : null;

  if (indirectRate === null && pool !== 0) {
    issues.push({
      severity: "error",
      code: "no-billable-hours",
      title: `No billable hours in ${label}`,
      detail: `AED ${Math.round(pool).toLocaleString("en")} of indirect cost in ${label} has no billable hours to be spread over. It's counted in totals as unallocated cost, but no project carries it.`,
      months: [period],
    });
  }

  return {
    ...period,
    key: monthKey(period),
    employees,
    supportStaff,
    salaryTotal: sum(employees, (p) => p.salary ?? 0) + supportStaffCost,
    supportStaffCost,
    nonBillableCost,
    overhead,
    pool,
    totalHours: sum(employees, (p) => p.totalHours),
    billableHours,
    indirectRate,
    allocatedCost: 0, // filled in once entries are costed
    unallocatedCost: indirectRate === null ? pool : 0,
  };
}

function buildProjects(
  prices: ProjectPrice[],
  timesheet: TimesheetEntry[],
  lifetimeHours: Map<string, number>,
  settings: Settings,
): Map<string, ProjectInfo> {
  const projects = new Map<string, ProjectInfo>();
  for (const p of prices) {
    projects.set(p.refCode, {
      refCode: p.refCode,
      name: p.name ? projectDisplayName(p.name) : p.refCode,
      company: null,
      category: p.category,
      status: p.status,
      price: p.price,
      salesPeriod: p.salesYear && p.salesMonth ? { year: p.salesYear, month: p.salesMonth } : null,
      listed: true,
      lifetimeHours: lifetimeHours.get(p.refCode) ?? 0,
    });
  }
  // Ref codes that only appear in the timesheet still get a project record, marked unlisted.
  for (const e of timesheet) {
    if (!isBillable(e.category, settings)) continue;
    const ref = refOf(e);
    let p = projects.get(ref);
    if (!p) {
      p = {
        refCode: ref,
        name: e.taskName ? projectDisplayName(e.taskName) : ref,
        company: null,
        category: e.category,
        status: null,
        price: null,
        salesPeriod: null,
        listed: false,
        lifetimeHours: lifetimeHours.get(ref) ?? 0,
      };
      projects.set(ref, p);
    }
    p.company ??= e.company;
  }
  return projects;
}

function projectIssues(projects: Map<string, ProjectInfo>, entries: CostedEntry[]): Issue[] {
  const issues: Issue[] = [];
  const billableByRef = groupBy(entries.filter((e) => e.billable), (e) => refOf(e));

  for (const p of projects.values()) {
    const rows = billableByRef.get(p.refCode) ?? [];
    const months = uniqueMonths(rows);
    const cost = sum(rows, (r) => r.cost);
    const hours = sum(rows, (r) => r.hours);

    if (p.refCode === NO_REF) {
      issues.push({
        severity: "warning",
        code: "no-ref-code",
        title: `${hours.toFixed(1)} billable hours have no ref code`,
        detail: `These hours are in a billable category but aren't tagged to any project, so their AED ${Math.round(cost).toLocaleString("en")} cost can't be charged to a price.`,
        months,
        refCode: p.refCode,
      });
    } else if (p.price === null && rows.length > 0) {
      issues.push({
        severity: "warning",
        code: "unpriced-project",
        title: `${p.refCode} has hours but no price`,
        detail: `${hours.toFixed(1)} h (AED ${Math.round(cost).toLocaleString("en")} cost) were logged against ${p.refCode}${p.listed ? ", which is on the price list without a price" : ", which isn't on the price list"}. It earns no revenue until a price is uploaded.`,
        months,
        refCode: p.refCode,
      });
    } else if (p.listed && rows.length === 0) {
      issues.push({
        severity: "info",
        code: "price-without-hours",
        title: `${p.refCode} is priced but has no hours`,
        detail: `${p.name} is on the price list but nobody has logged billable time to it, so it doesn't appear in revenue yet.`,
        months: [],
        refCode: p.refCode,
      });
    }
  }
  return issues;
}

function uniqueMonths(rows: YearMonth[]): YearMonth[] {
  const map = new Map<string, YearMonth>();
  for (const r of rows) map.set(monthKey(r), { year: r.year, month: r.month });
  return [...map.values()].sort((a, b) => a.year - b.year || a.month - b.month);
}
