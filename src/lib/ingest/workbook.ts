// Entry point for ingestion: bytes of an uploaded file -> a recognised, parsed sheet.

import * as XLSX from "xlsx";
import type { Cell } from "./cells";
import { classifySheet, KIND_LABEL, type HeaderMatch } from "./schema";
import {
  IngestError,
  parsePrices,
  parseSalaries,
  parseTimesheet,
  type ParsedPrices,
  type ParsedSalaries,
  type ParsedTimesheet,
} from "./parse";
import type { FileKind } from "../types";

export { IngestError };

export type ParsedSheet = (ParsedTimesheet | ParsedSalaries | ParsedPrices) & {
  filename: string;
  sheetName: string;
  headerRowNumber: number;
};

export interface ReadOptions {
  fallbackYear?: number;
  /** When set, the file must be this kind; a mismatch is reported instead of silently accepted. */
  expectedKind?: FileKind;
}

function readGrid(ws: XLSX.WorkSheet): { grid: Cell[][]; firstRowNumber: number } {
  const ref = ws["!ref"];
  if (!ref) return { grid: [], firstRowNumber: 1 };
  const range = XLSX.utils.decode_range(ref);
  const grid = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
  return { grid, firstRowNumber: range.s.r + 1 };
}

function looksLikeSpreadsheet(bytes: Uint8Array): boolean {
  // .xlsx is a zip ("PK"), legacy .xls is OLE2 (D0 CF 11 E0). CSV is accepted as text.
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const ole = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  return zip || ole;
}

export function readWorkbook(bytes: Uint8Array, filename: string, options: ReadOptions = {}): ParsedSheet {
  const isCsv = /\.csv$/i.test(filename);
  if (!isCsv && !looksLikeSpreadsheet(bytes)) {
    throw new IngestError(`"${filename}" isn't an Excel workbook (.xlsx/.xls) or a CSV file.`);
  }

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, { type: "array", cellDates: true, dense: false });
  } catch {
    throw new IngestError(`"${filename}" couldn't be opened as a spreadsheet — it may be corrupt or password-protected.`);
  }

  // Pick the sheet whose headers best match the expected layout (or any of the three).
  let best: { sheetName: string; grid: Cell[][]; firstRowNumber: number; match: HeaderMatch } | null = null;
  let recognisedAs: FileKind | null = null; // a complete match of some *other* kind, for the error message
  for (const sheetName of wb.SheetNames) {
    const { grid, firstRowNumber } = readGrid(wb.Sheets[sheetName]);
    if (grid.length === 0) continue;
    const matches = classifySheet(grid);
    const match = options.expectedKind ? matches.find((m) => m.kind === options.expectedKind)! : matches[0];
    recognisedAs ??= matches.find((m) => m.missing.length === 0 && m.kind !== match.kind)?.kind ?? null;
    const isBetter =
      !best ||
      match.missing.length < best.match.missing.length ||
      (match.missing.length === best.match.missing.length && match.score > best.match.score);
    if (isBetter) best = { sheetName, grid, firstRowNumber, match };
  }

  if (!best) throw new IngestError(`"${filename}" is empty.`);

  const { sheetName, grid, firstRowNumber, match } = best;
  if (match.missing.length > 0) {
    if (options.expectedKind && recognisedAs) {
      throw new IngestError(
        `"${filename}" looks like a ${KIND_LABEL[recognisedAs]}, not a ${KIND_LABEL[options.expectedKind]}. Check you picked the right file.`,
      );
    }
    throw new IngestError(
      `"${filename}" doesn't look like a ${KIND_LABEL[match.kind]}: no column found for ${match.missing.join(", ")}.`,
    );
  }

  const ctx = { filename, fallbackYear: options.fallbackYear, firstRowNumber };
  const parsed =
    match.kind === "timesheet" ? parseTimesheet(grid, match, ctx)
    : match.kind === "salaries" ? parseSalaries(grid, match, ctx)
    : parsePrices(grid, match, ctx);

  return { ...parsed, filename, sheetName, headerRowNumber: firstRowNumber + match.rowIndex };
}
