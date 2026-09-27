// Month parsing. The sheets write months as "May '25", "January 2026", "Jan-25", "2025-03",
// or just "January"; Excel may also hand us a real date or a date serial number.

import type { Cell } from "./cells";
import { isEmptyCell } from "./cells";

export interface ParsedMonth {
  month: number; // 1–12
  year: number | null; // null when the cell names a month but no year
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

// Excel's day zero is 1899-12-30 (it inherits Lotus 1-2-3's 1900 leap-year bug).
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

function expandYear(y: string): number {
  const n = parseInt(y, 10);
  return y.length <= 2 ? 2000 + n : n;
}

const FULL_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function monthFromWord(word: string): number | null {
  const w = word.toLowerCase();
  if (w.length < 3) return null;
  for (const [abbr, m] of Object.entries(MONTHS)) {
    // Accept "jan", "janu", "january"; reject "junk" by requiring a prefix of the full name.
    if (w.startsWith(abbr) && FULL_NAMES[m - 1].startsWith(w)) return m;
  }
  return null;
}

export function parseMonth(value: Cell): ParsedMonth | null {
  if (isEmptyCell(value)) return null;

  if (value instanceof Date) {
    // Excel dates carry no timezone; depending on the reader they land on local or UTC midnight.
    // Shifting by 12h before reading the UTC month keeps "1 May" in May for any offset under ±12h.
    const d = new Date(value.getTime() + 12 * 3600 * 1000);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  }

  if (typeof value === "number") {
    // Plausible Excel serial for 1990–2100.
    if (value > 32874 && value < 73051) {
      const d = new Date(EXCEL_EPOCH_MS + Math.round(value) * 86400000);
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
    }
    return null;
  }

  const s = String(value).trim();

  // "May '25", "January 2026", "Jan-25", "Sept 2025", "January"
  const named = s.match(/^([A-Za-z]+)\.?(?:[\s\-/,]*'?\s*(\d{4}|\d{2}))?$/);
  if (named) {
    const month = monthFromWord(named[1]);
    if (month) return { month, year: named[2] ? expandYear(named[2]) : null };
  }

  // "2025-03", "2025/3", "2025-03-01"
  const iso = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  if (iso) {
    const month = parseInt(iso[2], 10);
    if (month >= 1 && month <= 12) return { year: parseInt(iso[1], 10), month };
  }

  // "03/2025", "3-25"
  const my = s.match(/^(\d{1,2})[-/](\d{4}|\d{2})$/);
  if (my) {
    const month = parseInt(my[1], 10);
    if (month >= 1 && month <= 12) return { year: expandYear(my[2]), month };
  }

  return null;
}

/** First four-digit year (2000–2099) found in a piece of text, e.g. a sheet title or filename. */
export function findYear(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(/(?:^|[^\d])(20\d{2})(?:[^\d]|$)/);
  return m ? parseInt(m[1], 10) : null;
}
