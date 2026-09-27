// Turns a raw grid of cells (one sheet) into typed rows plus human-readable warnings.
// Nothing here throws on a bad row: bad rows are skipped and reported. Only a sheet that
// can't be understood at all (no header, no year) raises an IngestError.

import type { Cell } from "./cells";
import { employeeKey, isEmptyCell, normCategory, normEmployeeNo, toNumber, toText } from "./cells";
import { findYear, parseMonth } from "./dates";
import type { HeaderMatch } from "./schema";
import type { ProjectPrice, SalaryRecord, TimesheetEntry, YearMonth } from "../types";
import { monthKey } from "../types";

export class IngestError extends Error {}

export interface ParseContext {
  filename: string;
  /** Year to use when a month is written without one ("January"). Chosen in the upload form. */
  fallbackYear?: number;
  /** Excel row number of grid[0], so warnings point at the row the user sees. */
  firstRowNumber: number;
}

/** Collects row numbers per problem, then renders "Skipped 3 rows with no hours (rows 5, 9, 12)". */
class Notes {
  private byMessage = new Map<string, number[]>();
  private plain: string[] = [];

  row(message: string, rowNumber: number) {
    const rows = this.byMessage.get(message) ?? [];
    rows.push(rowNumber);
    this.byMessage.set(message, rows);
  }

  note(message: string) {
    this.plain.push(message);
  }

  render(): string[] {
    const out = [...this.plain];
    for (const [message, rows] of this.byMessage) {
      const shown = rows.slice(0, 8).join(", ") + (rows.length > 8 ? `, … ${rows.length - 8} more` : "");
      out.push(`${message.replace("{n}", String(rows.length)).replace("{s}", rows.length === 1 ? "" : "s")} (row${rows.length === 1 ? "" : "s"} ${shown})`);
    }
    return out;
  }
}

const TOTAL_ROW = /^(grand\s+)?(sub\s*)?totals?\b/i;

function isBlankRow(row: Cell[] | undefined): boolean {
  return !row || row.every(isEmptyCell);
}

function isTotalRow(row: Cell[]): boolean {
  return row.some((c) => typeof c === "string" && TOTAL_ROW.test(c.trim()));
}

/** Year to assume for month cells that don't state one: sheet title, then the form, then the filename. */
function resolveFallbackYear(grid: Cell[][], header: HeaderMatch, ctx: ParseContext): number | null {
  for (let i = 0; i < header.rowIndex; i++) {
    for (const cell of grid[i] ?? []) {
      const y = findYear(toText(cell));
      if (y) return y;
    }
  }
  return ctx.fallbackYear ?? findYear(ctx.filename);
}

function requireYear(year: number | null, what: string): number {
  if (year === null) {
    throw new IngestError(
      `${what} are written without a year and the file doesn't say which year it covers. Choose the year in the upload form and upload again.`,
    );
  }
  return year;
}

function cell(row: Cell[], col: number | undefined): Cell {
  return col === undefined ? null : row[col];
}

// ---------------------------------------------------------------------------------------------

export interface ParsedTimesheet {
  kind: "timesheet";
  entries: TimesheetEntry[];
  /** Months present in the file; an upload replaces exactly these months. */
  months: YearMonth[];
  warnings: string[];
}

export function parseTimesheet(grid: Cell[][], header: HeaderMatch, ctx: ParseContext): ParsedTimesheet {
  const c = header.columns;
  const notes = new Notes();
  const fallbackYear = resolveFallbackYear(grid, header, ctx);
  const entries: TimesheetEntry[] = [];

  // Values carried down from the row above when a cell is left blank (common in grouped sheets).
  let carry: { period: YearMonth | null; no: string | null; name: string | null; dept: string | null; designation: string | null; type: string | null } =
    { period: null, no: null, name: null, dept: null, designation: null, type: null };

  for (let i = header.rowIndex + 1; i < grid.length; i++) {
    const row = grid[i];
    const rowNo = ctx.firstRowNumber + i;
    if (isBlankRow(row)) continue;
    if (isTotalRow(row)) {
      notes.row("Ignored {n} total/subtotal row{s}", rowNo);
      continue;
    }

    // Month
    const rawMonth = cell(row, c.month);
    let period: YearMonth | null;
    if (isEmptyCell(rawMonth)) {
      period = carry.period;
      if (period) notes.row("{n} row{s} had no month; used the month from the row above", rowNo);
    } else {
      const pm = parseMonth(rawMonth);
      if (!pm) {
        notes.row(`Skipped {n} row{s} with an unrecognised month such as "${toText(rawMonth)}"`, rowNo);
        continue;
      }
      period = { year: pm.year ?? requireYear(fallbackYear, `Months such as "${toText(rawMonth)}"`), month: pm.month };
    }
    if (!period) {
      notes.row("Skipped {n} row{s} with no month", rowNo);
      continue;
    }

    // Person. A row with neither number nor name inherits the person above it.
    let no = normEmployeeNo(cell(row, c.employeeNo));
    let name = toText(cell(row, c.employeeName));
    let dept = toText(cell(row, c.department));
    let designation = toText(cell(row, c.designation));
    let type = toText(cell(row, c.expenseType));
    if (!no && !name && carry.name) {
      ({ no, name } = carry);
      dept ??= carry.dept;
      designation ??= carry.designation;
      type ??= carry.type;
      notes.row("{n} row{s} had no employee; used the employee from the row above", rowNo);
    }
    if (!name) {
      notes.row("Skipped {n} row{s} with no employee name", rowNo);
      continue;
    }

    const rawCategory = toText(cell(row, c.category));
    if (!rawCategory) {
      notes.row("Skipped {n} row{s} with no category", rowNo);
      continue;
    }
    const category = normCategory(rawCategory);

    const rawHours = cell(row, c.hours);
    const hours = toNumber(rawHours);
    if (hours === null) {
      if (isEmptyCell(rawHours)) notes.row("Skipped {n} row{s} with blank or '-' hours", rowNo);
      else notes.row(`Skipped {n} row{s} where hours weren't a number (e.g. "${toText(rawHours)}")`, rowNo);
      continue;
    }
    if (hours === 0) {
      notes.row("Skipped {n} row{s} with zero hours", rowNo);
      continue;
    }
    if (hours < 0) notes.row("{n} row{s} have negative hours (kept as corrections)", rowNo);

    if (!dept) notes.row('{n} row{s} had no department; filed under "Unassigned"', rowNo);

    carry = { period, no, name, dept, designation, type };
    entries.push({
      year: period.year,
      month: period.month,
      employeeKey: employeeKey(no, name),
      employeeNo: no,
      employeeName: name,
      expenseType: type,
      department: dept ?? "Unassigned",
      designation,
      category,
      refCode: toText(cell(row, c.refCode)) ?? "",
      taskName: toText(cell(row, c.taskName)),
      company: toText(cell(row, c.company)),
      description: toText(cell(row, c.description)),
      hours,
    });
  }

  if (entries.length === 0) throw new IngestError("The timesheet has a header row but no rows with hours.");

  const months = new Map<string, YearMonth>();
  for (const e of entries) months.set(monthKey(e), { year: e.year, month: e.month });

  return {
    kind: "timesheet",
    entries,
    months: [...months.values()].sort((a, b) => a.year - b.year || a.month - b.month),
    warnings: notes.render(),
  };
}

// ---------------------------------------------------------------------------------------------

export interface ParsedSalaries {
  kind: "salaries";
  records: SalaryRecord[];
  warnings: string[];
}

export function parseSalaries(grid: Cell[][], header: HeaderMatch, ctx: ParseContext): ParsedSalaries {
  const c = header.columns;
  const notes = new Notes();
  const fallbackYear = resolveFallbackYear(grid, header, ctx);

  const monthCols = [...header.monthColumns.entries()].map(([col, pm]) => ({
    col,
    period: { year: pm.year ?? requireYear(fallbackYear, "Salary month columns"), month: pm.month },
  }));

  const byKey = new Map<string, SalaryRecord>();
  let blankCells = 0;

  for (let i = header.rowIndex + 1; i < grid.length; i++) {
    const row = grid[i];
    const rowNo = ctx.firstRowNumber + i;
    if (isBlankRow(row)) continue;
    if (isTotalRow(row)) {
      notes.row("Ignored {n} total row{s}", rowNo);
      continue;
    }
    const no = normEmployeeNo(cell(row, c.employeeNo));
    const name = toText(cell(row, c.employeeName));
    if (!name) {
      notes.row("Skipped {n} row{s} with no employee name", rowNo);
      continue;
    }
    const key = employeeKey(no, name);

    for (const { col, period } of monthCols) {
      const raw = row[col];
      const amount = toNumber(raw);
      if (amount === null) {
        if (isEmptyCell(raw)) blankCells++;
        else notes.row(`Ignored {n} salary cell{s} that weren't numbers (e.g. "${toText(raw)}")`, rowNo);
        continue;
      }
      const recKey = `${key}|${monthKey(period)}`;
      if (byKey.has(recKey)) notes.row(`{n} duplicate row{s} for the same person; the later row was used`, rowNo);
      byKey.set(recKey, { employeeKey: key, employeeNo: no, employeeName: name, ...period, amount });
    }
  }

  if (blankCells > 0) {
    notes.note(`${blankCells} blank or '-' salary cell${blankCells === 1 ? " was" : "s were"} left as "no salary for that month" (existing figures for those cells are kept).`);
  }
  if (byKey.size === 0) throw new IngestError("The salary sheet has a header row but no salary figures.");

  return { kind: "salaries", records: [...byKey.values()], warnings: notes.render() };
}

// ---------------------------------------------------------------------------------------------

export interface ParsedPrices {
  kind: "prices";
  projects: ProjectPrice[];
  warnings: string[];
}

export function parsePrices(grid: Cell[][], header: HeaderMatch, ctx: ParseContext): ParsedPrices {
  const c = header.columns;
  const notes = new Notes();
  const fallbackYear = resolveFallbackYear(grid, header, ctx);
  const byRef = new Map<string, ProjectPrice>();

  for (let i = header.rowIndex + 1; i < grid.length; i++) {
    const row = grid[i];
    const rowNo = ctx.firstRowNumber + i;
    if (isBlankRow(row)) continue;
    if (isTotalRow(row)) {
      notes.row("Ignored {n} total row{s}", rowNo);
      continue;
    }
    const refCode = toText(cell(row, c.refCode));
    if (!refCode) {
      notes.row("Skipped {n} row{s} with no ref code (a price can't be matched to hours without one)", rowNo);
      continue;
    }

    const rawPrice = cell(row, c.price);
    const price = toNumber(rawPrice);
    if (price === null) {
      notes.row("{n} project{s} have no price yet; they're listed as unpriced", rowNo);
    }

    const rawSales = cell(row, c.salesMonth);
    const sales = parseMonth(rawSales);
    if (!sales && !isEmptyCell(rawSales)) notes.row(`{n} sales month{s} not recognised (e.g. "${toText(rawSales)}")`, rowNo);

    if (byRef.has(refCode)) notes.row("{n} duplicate ref code{s}; the later row was used", rowNo);
    byRef.set(refCode, {
      refCode,
      name: toText(cell(row, c.name)),
      price,
      salesYear: sales ? sales.year ?? fallbackYear : null,
      salesMonth: sales?.month ?? null,
      category: toText(cell(row, c.category)),
      status: toText(cell(row, c.status)),
    });
  }

  if (byRef.size === 0) throw new IngestError("The price list has a header row but no projects.");
  return { kind: "prices", projects: [...byRef.values()], warnings: notes.render() };
}
