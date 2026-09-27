// Cell-level normalisation. Spreadsheets arrive with "-" for empty, numbers stored as text,
// stray whitespace and inconsistent casing; everything funnels through these helpers.

export type Cell = string | number | boolean | Date | null | undefined;

const EMPTY_MARKERS = new Set(["", "-", "–", "—", "n/a", "na", "nil", "none", "null"]);

export function isEmptyCell(value: Cell): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return EMPTY_MARKERS.has(value.trim().toLowerCase());
  if (typeof value === "number") return Number.isNaN(value);
  return false;
}

/** Trimmed text with internal whitespace collapsed, or null for empty cells. */
export function toText(value: Cell): string | null {
  if (isEmptyCell(value)) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/\s+/g, " ").trim();
}

/**
 * Parse a numeric cell. Accepts real numbers and text such as "1,234.50", "AED 18,000", "(500)".
 * Returns null for empty cells and for text that is not a number.
 */
export function toNumber(value: Cell): number | null {
  if (isEmptyCell(value)) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value instanceof Date) return null;
  let s = String(value).trim();
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, "").replace(/aed|dhs?|,|\s/gi, "");
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return negative ? -n : n;
}

/** Header text reduced to lowercase words, e.g. "Project (Billable) / Task" -> "project billable task". */
export function normHeader(value: Cell): string {
  const t = toText(value);
  if (!t) return "";
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Loose name comparison key: case, spacing and punctuation insensitive ("Kevin D'Souza" == "kevin dsouza"). */
export function normName(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");
}

/**
 * Employee numbers are text with leading zeros ("00101"), but Excel often turns them into
 * numbers (101). Strip leading zeros from purely numeric IDs so both spellings join.
 */
export function normEmployeeNo(value: Cell): string | null {
  const t = toText(value);
  if (!t) return null;
  if (/^\d+(\.0+)?$/.test(t)) return String(parseInt(t, 10));
  return t.toUpperCase();
}

/** Join key for a person: employee number when present, otherwise their normalised name. */
export function employeeKey(employeeNo: string | null, employeeName: string): string {
  const no = normEmployeeNo(employeeNo);
  return no ? `no:${no}` : `name:${normName(employeeName)}`;
}

/** Canonical category label: "FC-Leaves", "fc -  leaves" -> "FC - Leaves". */
export function normCategory(value: string): string {
  const t = value.replace(/\s+/g, " ").trim();
  const fc = t.match(/^fc\s*[-–:]\s*(.+)$/i);
  if (fc) return `FC - ${fc[1].charAt(0).toUpperCase()}${fc[1].slice(1)}`;
  return t;
}

export function sameCategory(a: string, b: string): boolean {
  return normCategory(a).toLowerCase() === normCategory(b).toLowerCase();
}
