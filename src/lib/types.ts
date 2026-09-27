// Domain types shared by ingestion, persistence, the cost model and the UI.

/** Month is 1–12. */
export interface YearMonth {
  year: number;
  month: number;
}

/** One row of the timesheet: a person's hours on one project/task in one month. */
export interface TimesheetEntry extends YearMonth {
  /** Stable identity used for joins (see employeeKey in lib/ingest/cells). */
  employeeKey: string;
  employeeNo: string | null;
  employeeName: string;
  expenseType: string | null; // DL / IDL
  department: string;
  designation: string | null;
  category: string;
  /** Project ref code for billable rows; internal rows repeat the category here. */
  refCode: string;
  taskName: string | null;
  company: string | null;
  description: string | null;
  hours: number;
}

/** One person's salary for one month. */
export interface SalaryRecord extends YearMonth {
  employeeKey: string;
  employeeNo: string | null;
  employeeName: string;
  amount: number;
}

export interface ProjectPrice {
  refCode: string;
  name: string | null;
  /** null when the sheet has the project but no price yet. */
  price: number | null;
  salesYear: number | null;
  salesMonth: number | null;
  category: string | null;
  status: string | null;
}

export interface Settings {
  /** Timesheet categories whose hours are billable to a project (case-insensitive). */
  billableCategories: string[];
  /** Overhead added to the indirect cost pool every month, in AED. */
  overheadMonthly: number;
  /** Per-month overrides of the overhead figure, keyed "YYYY-MM". */
  overheadOverrides: Record<string, number>;
}

export const DEFAULT_SETTINGS: Settings = {
  billableCategories: ["Projects", "Enhancements", "Hosting"],
  overheadMonthly: 0,
  overheadOverrides: {},
};

export type FileKind = "timesheet" | "salaries" | "prices";

export interface UploadLogEntry {
  id: string;
  at: string; // ISO timestamp
  filename: string;
  kind: FileKind;
  rowsImported: number;
  summary: string;
  warnings: string[];
}

/** Everything the app persists. */
export interface DataState {
  version: 1;
  timesheet: TimesheetEntry[];
  salaries: SalaryRecord[];
  projects: ProjectPrice[];
  settings: Settings;
  uploads: UploadLogEntry[];
}

export function emptyState(): DataState {
  return {
    version: 1,
    timesheet: [],
    salaries: [],
    projects: [],
    settings: structuredClone(DEFAULT_SETTINGS),
    uploads: [],
  };
}

export function monthKey({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export function monthLabel({ year, month }: YearMonth, short = false): string {
  const name = MONTH_NAMES[month - 1];
  return `${short ? name.slice(0, 3) : name} ${year}`;
}
