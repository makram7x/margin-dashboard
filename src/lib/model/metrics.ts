// Read-side views over the cost model. Every figure is a filter + group + sum over costed
// entries and month ledgers, so views can't drift from each other.

import type { YearMonth } from "../types";
import { monthKey } from "../types";
import { NO_REF, type CostedEntry, type CostModel, type Issue, type MonthLedger, type ProjectInfo } from "./costModel";

/** A year (or all years) and optionally one month within it. */
export interface Period {
  year: number | null;
  month: number | null;
}

export const ALL_TIME: Period = { year: null, month: null };

export function inPeriod(ym: YearMonth, p: Period): boolean {
  return (p.year === null || ym.year === p.year) && (p.month === null || ym.month === p.month);
}

const sum = <T>(items: T[], f: (t: T) => number) => items.reduce((acc, t) => acc + f(t), 0);

/** a ÷ b, or null when b is zero (so the UI can show "—" rather than NaN or ∞). */
export function ratio(a: number, b: number): number | null {
  return b === 0 ? null : a / b;
}

function group<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    (out.get(k) ?? out.set(k, []).get(k)!).push(item);
  }
  return out;
}

export function entriesIn(model: CostModel, p: Period): CostedEntry[] {
  return model.entries.filter((e) => inPeriod(e, p));
}

export function monthsIn(model: CostModel, p: Period): MonthLedger[] {
  return model.months.filter((m) => inPeriod(m, p));
}

export function issuesIn(model: CostModel, p: Period): Issue[] {
  return model.issues.filter((i) => i.months.length === 0 || i.months.some((m) => inPeriod(m, p)));
}

// ---------------------------------------------------------------------------------------------
// Company totals

export interface Totals {
  totalHours: number;
  billableHours: number;
  productivity: number | null;
  /** Cost carried by billable work, plus any pool that couldn't be allocated. */
  cost: number;
  unallocatedCost: number;
  salaries: number;
  overhead: number;
  revenue: number;
  profit: number;
  margin: number | null;
}

export function totals(model: CostModel, p: Period): Totals {
  const entries = entriesIn(model, p);
  const months = monthsIn(model, p);
  const totalHours = sum(entries, (e) => e.hours);
  const billableHours = sum(entries.filter((e) => e.billable), (e) => e.hours);
  const unallocatedCost = sum(months, (m) => m.unallocatedCost);
  const cost = sum(entries, (e) => e.cost) + unallocatedCost;
  const revenue = sum(entries, (e) => e.revenue);
  return {
    totalHours,
    billableHours,
    productivity: ratio(billableHours, totalHours),
    cost,
    unallocatedCost,
    salaries: sum(months, (m) => m.salaryTotal),
    overhead: sum(months, (m) => m.overhead),
    revenue,
    profit: revenue - cost,
    margin: ratio(revenue - cost, revenue),
  };
}

export interface MonthPoint extends YearMonth, Totals {}

/** One point per month that has data, within the period's year(s). */
export function monthlySeries(model: CostModel, p: Period): MonthPoint[] {
  return model.months
    .filter((m) => p.year === null || m.year === p.year)
    .map((m) => ({ year: m.year, month: m.month, ...totals(model, { year: m.year, month: m.month }) }));
}

// ---------------------------------------------------------------------------------------------
// Projects

export interface ProjectRow {
  refCode: string;
  name: string;
  company: string | null;
  category: string | null;
  status: string | null;
  price: number | null;
  listed: boolean;
  hours: number;
  cost: number;
  revenue: number;
  profit: number;
  margin: number | null;
  /** Share of the project's lifetime hours that fall in the period. */
  shareOfLifetime: number | null;
}

export function projectRows(model: CostModel, p: Period): ProjectRow[] {
  const byRef = group(entriesIn(model, p).filter((e) => e.billable), (e) => e.refCode || NO_REF);
  const allTime = p.year === null && p.month === null;
  const rows: ProjectRow[] = [];
  for (const project of model.projects.values()) {
    const entries = byRef.get(project.refCode) ?? [];
    if (entries.length === 0 && !allTime) continue;
    const hours = sum(entries, (e) => e.hours);
    const cost = sum(entries, (e) => e.cost);
    const revenue = sum(entries, (e) => e.revenue);
    rows.push({
      refCode: project.refCode,
      name: project.name,
      company: project.company,
      category: project.category,
      status: project.status,
      price: project.price,
      listed: project.listed,
      hours,
      cost,
      revenue,
      profit: revenue - cost,
      margin: ratio(revenue - cost, revenue),
      shareOfLifetime: ratio(hours, project.lifetimeHours),
    });
  }
  return rows.sort((a, b) => b.revenue - a.revenue || b.cost - a.cost);
}

export interface ContributorRow {
  employeeKey: string;
  employeeName: string;
  department: string;
  designation: string | null;
  hours: number;
  shareOfHours: number | null;
  revenueShare: number;
  directCost: number;
  indirectCost: number;
  cost: number;
  profit: number;
  /** (revenue share − cost) ÷ revenue share */
  profitability: number | null;
}

export interface DepartmentSlice {
  department: string;
  hours: number;
  cost: number;
  revenueShare: number;
  people: number;
}

export interface ProjectMonthRow extends YearMonth {
  hours: number;
  cost: number;
  revenue: number;
  indirectRate: number;
}

export interface ProjectDetail {
  project: ProjectInfo;
  hours: number;
  directCost: number;
  indirectCost: number;
  cost: number;
  revenue: number;
  profit: number;
  /** (price − total cost) ÷ price */
  margin: number | null;
  first: YearMonth | null;
  last: YearMonth | null;
  departments: DepartmentSlice[];
  contributors: ContributorRow[];
  months: ProjectMonthRow[];
  issues: Issue[];
}

/** Lifetime picture of one project (the project page). */
export function projectDetail(model: CostModel, refCode: string): ProjectDetail | null {
  const project = model.projects.get(refCode);
  if (!project) return null;
  const entries = model.entries.filter((e) => e.billable && (e.refCode || NO_REF) === refCode);

  const hours = sum(entries, (e) => e.hours);
  const directCost = sum(entries, (e) => e.directCost);
  const indirectCost = sum(entries, (e) => e.indirectCost);
  const cost = directCost + indirectCost;
  const revenue = sum(entries, (e) => e.revenue);
  const price = project.price;

  const contributors: ContributorRow[] = [...group(entries, (e) => e.employeeKey).values()]
    .map((rows) => {
      const last = rows[rows.length - 1];
      const h = sum(rows, (r) => r.hours);
      const share = sum(rows, (r) => r.revenue);
      const dc = sum(rows, (r) => r.directCost);
      const ic = sum(rows, (r) => r.indirectCost);
      return {
        employeeKey: last.employeeKey,
        employeeName: last.employeeName,
        department: last.department,
        designation: last.designation,
        hours: h,
        shareOfHours: ratio(h, hours),
        revenueShare: share,
        directCost: dc,
        indirectCost: ic,
        cost: dc + ic,
        profit: share - dc - ic,
        profitability: price === null ? null : ratio(share - dc - ic, share),
      };
    })
    .sort((a, b) => b.hours - a.hours);

  const departments: DepartmentSlice[] = [...group(entries, (e) => e.department).entries()]
    .map(([department, rows]) => ({
      department,
      hours: sum(rows, (r) => r.hours),
      cost: sum(rows, (r) => r.cost),
      revenueShare: sum(rows, (r) => r.revenue),
      people: new Set(rows.map((r) => r.employeeKey)).size,
    }))
    .sort((a, b) => b.hours - a.hours);

  const months: ProjectMonthRow[] = [...group(entries, monthKey).values()]
    .map((rows) => ({
      year: rows[0].year,
      month: rows[0].month,
      hours: sum(rows, (r) => r.hours),
      cost: sum(rows, (r) => r.cost),
      revenue: sum(rows, (r) => r.revenue),
      indirectRate: rows[0].indirectRate,
    }))
    .sort((a, b) => a.year - b.year || a.month - b.month);

  return {
    project,
    hours,
    directCost,
    indirectCost,
    cost,
    revenue,
    profit: (price ?? 0) - cost,
    margin: price === null ? null : ratio(price - cost, price),
    first: months[0] ?? null,
    last: months[months.length - 1] ?? null,
    departments,
    contributors,
    months,
    issues: model.issues.filter((i) => i.refCode === refCode),
  };
}

// ---------------------------------------------------------------------------------------------
// People

export interface PersonRow {
  employeeKey: string;
  employeeName: string;
  department: string;
  designation: string | null;
  expenseType: string | null;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  productivity: number | null;
  /** Largest non-billable category by hours, e.g. "FC - Meetings". */
  topNonBillable: { category: string; hours: number } | null;
  salary: number;
  missingSalaryMonths: number;
  /** Salary spent on billable hours (direct cost carried by projects). */
  directCost: number;
  /** Salary spent on non-billable hours (goes into the indirect pool). */
  nonBillableCost: number;
  /** Direct + indirect cost charged to projects for this person's billable hours. */
  chargedToProjects: number;
  revenue: number;
}

export function people(model: CostModel, p: Period, department?: string): PersonRow[] {
  const entries = entriesIn(model, p).filter((e) => !department || e.department === department);
  const ledgerPeople = monthsIn(model, p).flatMap((m) => m.employees);

  return [...group(entries, (e) => e.employeeKey).values()]
    .map((rows) => {
      const last = rows[rows.length - 1];
      const billable = rows.filter((r) => r.billable);
      const nonBillable = rows.filter((r) => !r.billable);
      const byCategory = [...group(nonBillable, (r) => r.category).entries()]
        .map(([category, rs]) => ({ category, hours: sum(rs, (r) => r.hours) }))
        .sort((a, b) => b.hours - a.hours);
      const months = ledgerPeople.filter((m) => m.employeeKey === last.employeeKey);
      const totalHours = sum(rows, (r) => r.hours);
      const billableHours = sum(billable, (r) => r.hours);
      return {
        employeeKey: last.employeeKey,
        employeeName: last.employeeName,
        department: last.department,
        designation: last.designation,
        expenseType: last.expenseType,
        totalHours,
        billableHours,
        nonBillableHours: totalHours - billableHours,
        productivity: ratio(billableHours, totalHours),
        topNonBillable: byCategory[0] ?? null,
        salary: sum(months, (m) => m.salary ?? 0),
        missingSalaryMonths: months.filter((m) => m.salary === null).length,
        directCost: sum(billable, (r) => r.directCost),
        nonBillableCost: sum(nonBillable, (r) => r.salaryValue),
        chargedToProjects: sum(billable, (r) => r.cost),
        revenue: sum(billable, (r) => r.revenue),
      };
    })
    .sort((a, b) => a.department.localeCompare(b.department) || a.employeeName.localeCompare(b.employeeName));
}

export interface DepartmentRow {
  department: string;
  people: number;
  totalHours: number;
  billableHours: number;
  productivity: number | null;
  salary: number;
  nonBillableCost: number;
  chargedToProjects: number;
  revenue: number;
}

export function departments(model: CostModel, p: Period): DepartmentRow[] {
  return [...group(people(model, p), (r) => r.department).entries()]
    .map(([department, rows]) => {
      const totalHours = sum(rows, (r) => r.totalHours);
      const billableHours = sum(rows, (r) => r.billableHours);
      return {
        department,
        people: rows.length,
        totalHours,
        billableHours,
        productivity: ratio(billableHours, totalHours),
        salary: sum(rows, (r) => r.salary),
        nonBillableCost: sum(rows, (r) => r.nonBillableCost),
        chargedToProjects: sum(rows, (r) => r.chargedToProjects),
        revenue: sum(rows, (r) => r.revenue),
      };
    })
    .sort((a, b) => b.totalHours - a.totalHours);
}

// ---------------------------------------------------------------------------------------------
// Categories

export interface CategoryRow {
  category: string;
  billable: boolean;
  hours: number;
  share: number | null;
  people: number;
  /** Salary value of the time (hours × each person's direct rate). */
  salaryValue: number;
}

export function categories(model: CostModel, p: Period): CategoryRow[] {
  const entries = entriesIn(model, p);
  const total = sum(entries, (e) => e.hours);
  return [...group(entries, (e) => e.category).entries()]
    .map(([category, rows]) => {
      const hours = sum(rows, (r) => r.hours);
      return {
        category,
        billable: rows[0].billable,
        hours,
        share: ratio(hours, total),
        people: new Set(rows.map((r) => r.employeeKey)).size,
        salaryValue: sum(rows, (r) => r.salaryValue),
      };
    })
    .sort((a, b) => Number(b.billable) - Number(a.billable) || b.hours - a.hours);
}

export interface Matrix {
  categories: { category: string; billable: boolean }[];
  rows: { employeeKey: string; employeeName: string; department: string; hours: Record<string, number>; total: number }[];
  columnTotals: Record<string, number>;
  total: number;
}

/** Employee × category hours: the pivot finance builds by hand. */
export function employeeCategoryMatrix(model: CostModel, p: Period): Matrix {
  const entries = entriesIn(model, p);
  const cats = categories(model, p).map((c) => ({ category: c.category, billable: c.billable }));
  const rows = [...group(entries, (e) => e.employeeKey).values()]
    .map((rs) => {
      const hours: Record<string, number> = {};
      for (const r of rs) hours[r.category] = (hours[r.category] ?? 0) + r.hours;
      const last = rs[rs.length - 1];
      return { employeeKey: last.employeeKey, employeeName: last.employeeName, department: last.department, hours, total: sum(rs, (r) => r.hours) };
    })
    .sort((a, b) => a.department.localeCompare(b.department) || a.employeeName.localeCompare(b.employeeName));
  const columnTotals: Record<string, number> = {};
  for (const e of entries) columnTotals[e.category] = (columnTotals[e.category] ?? 0) + e.hours;
  return { categories: cats, rows, columnTotals, total: sum(entries, (e) => e.hours) };
}
