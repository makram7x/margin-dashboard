// Column schemas for the three spreadsheets and header-row detection.
// Headers are matched loosely (case/punctuation-insensitive, synonyms) and the header row is
// searched for in the first rows of the sheet, because it is not always row 1.

import type { Cell } from "./cells";
import { normHeader } from "./cells";
import { parseMonth, type ParsedMonth } from "./dates";
import type { FileKind } from "../types";

type Matcher = (h: string) => boolean;

interface FieldSpec {
  field: string;
  label: string; // shown in "missing column" errors
  required: boolean;
  match: Matcher;
}

const has = (h: string, ...words: string[]) => words.some((w) => new RegExp(`\\b${w}\\b`).test(h));

// Order matters: each header cell is claimed by the first unclaimed field that matches it,
// so more specific fields come before general ones (employee no. before employee name, etc.).
const TIMESHEET_FIELDS: FieldSpec[] = [
  { field: "month", label: "Month", required: true, match: (h) => has(h, "month", "period") },
  {
    field: "employeeNo", label: "Employee No.", required: false,
    match: (h) => has(h, "employee", "emp", "staff") && has(h, "no", "number", "id", "code", "num"),
  },
  {
    field: "employeeName", label: "Employee Name", required: true,
    match: (h) => h === "name" || h === "employee" || (has(h, "employee", "emp", "staff") && has(h, "name")),
  },
  { field: "expenseType", label: "Type of Expense", required: false, match: (h) => has(h, "expense", "dl", "idl") },
  { field: "department", label: "Department", required: false, match: (h) => has(h, "department", "dept", "team") },
  { field: "designation", label: "Designation", required: false, match: (h) => has(h, "designation", "title", "role", "position") },
  { field: "category", label: "Category", required: true, match: (h) => has(h, "category") },
  { field: "refCode", label: "Ref Code", required: true, match: (h) => has(h, "ref", "reference") || h === "code" },
  { field: "taskName", label: "Project / Task Name", required: false, match: (h) => has(h, "project", "task") },
  { field: "company", label: "Company", required: false, match: (h) => has(h, "company", "client") },
  { field: "description", label: "Description", required: false, match: (h) => has(h, "description", "notes", "remarks", "comment") },
  { field: "hours", label: "Hours", required: true, match: (h) => has(h, "hours", "hour", "hrs") },
];

const SALARY_FIELDS: FieldSpec[] = [
  {
    field: "employeeNo", label: "Employee No.", required: false,
    match: (h) => has(h, "employee", "emp", "staff") && has(h, "no", "number", "id", "code", "num"),
  },
  {
    field: "employeeName", label: "Employee Name", required: true,
    match: (h) => h === "name" || h === "employee" || (has(h, "employee", "emp", "staff") && has(h, "name")),
  },
];

const PRICE_FIELDS: FieldSpec[] = [
  { field: "refCode", label: "Ref Code", required: true, match: (h) => has(h, "ref", "reference") || h === "code" },
  { field: "price", label: "Project Price", required: true, match: (h) => has(h, "price", "value", "amount", "contract", "fee") },
  { field: "salesMonth", label: "Sales month", required: false, match: (h) => has(h, "sales", "sold", "month", "date") },
  { field: "category", label: "Category", required: false, match: (h) => has(h, "category", "type") },
  { field: "status", label: "Status", required: false, match: (h) => has(h, "status") },
  { field: "name", label: "Project Name", required: false, match: (h) => has(h, "name", "project") },
];

const SCHEMAS: Record<FileKind, FieldSpec[]> = {
  timesheet: TIMESHEET_FIELDS,
  salaries: SALARY_FIELDS,
  prices: PRICE_FIELDS,
};

export const KIND_LABEL: Record<FileKind, string> = {
  timesheet: "timesheet",
  salaries: "salary overview",
  prices: "project price list",
};

export interface HeaderMatch {
  kind: FileKind;
  rowIndex: number; // index into the grid
  columns: Record<string, number>; // field -> column index
  /** Salary sheets only: column index -> month named in that header cell. */
  monthColumns: Map<number, ParsedMonth>;
  missing: string[]; // labels of required fields not found
  score: number;
}

const HEADER_SEARCH_ROWS = 25;

function matchRow(kind: FileKind, row: Cell[]): Omit<HeaderMatch, "rowIndex"> {
  const specs = SCHEMAS[kind];
  const columns: Record<string, number> = {};
  const monthColumns = new Map<number, ParsedMonth>();

  row.forEach((cell, col) => {
    const h = normHeader(cell);
    if (!h && !(typeof cell === "number" || cell instanceof Date)) return;
    const spec = specs.find((s) => columns[s.field] === undefined && h && s.match(h));
    if (spec) {
      columns[spec.field] = col;
      return;
    }
    if (kind === "salaries") {
      const m = parseMonth(cell);
      if (m) monthColumns.set(col, m);
    }
  });

  const missing = specs.filter((s) => s.required && columns[s.field] === undefined).map((s) => s.label);
  if (kind === "salaries" && monthColumns.size === 0) missing.push("month columns (January … December)");

  const score = Object.keys(columns).length + monthColumns.size;
  return { kind, columns, monthColumns, missing, score };
}

/** Best header row for one kind of sheet, or the closest near-miss (with `missing` non-empty). */
export function findHeader(kind: FileKind, grid: Cell[][]): HeaderMatch {
  let best: HeaderMatch | null = null;
  const limit = Math.min(grid.length, HEADER_SEARCH_ROWS);
  for (let i = 0; i < limit; i++) {
    const m = { ...matchRow(kind, grid[i] ?? []), rowIndex: i };
    const better =
      !best ||
      m.missing.length < best.missing.length ||
      (m.missing.length === best.missing.length && m.score > best.score);
    if (better) best = m;
  }
  return best ?? { kind, rowIndex: 0, columns: {}, monthColumns: new Map(), missing: ["a header row"], score: 0 };
}

/**
 * Decide what a sheet is from its headers alone (not its filename), so a salary file dropped
 * into the wrong slot is recognised for what it is. Returns every kind's match, best first.
 */
export function classifySheet(grid: Cell[][]): HeaderMatch[] {
  return (Object.keys(SCHEMAS) as FileKind[])
    .map((kind) => findHeader(kind, grid))
    .sort((a, b) => a.missing.length - b.missing.length || b.score - a.score);
}
