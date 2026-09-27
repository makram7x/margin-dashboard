// Parse an uploaded file and fold it into the state. No I/O here, so it's usable from tests,
// the seed script and the upload action alike.

import { readWorkbook, type ReadOptions } from "../ingest/workbook";
import type { DataState, UploadLogEntry } from "../types";
import { mergePrices, mergeSalaries, mergeTimesheet } from "./merge";

const MAX_LOG = 50;

export interface IngestOutcome {
  state: DataState;
  log: UploadLogEntry;
}

export function ingestFile(
  state: DataState,
  bytes: Uint8Array,
  filename: string,
  options: ReadOptions = {},
  now: Date = new Date(),
): IngestOutcome {
  const sheet = readWorkbook(bytes, filename, options);

  const merged =
    sheet.kind === "timesheet" ? mergeTimesheet(state, sheet.entries, sheet.months)
    : sheet.kind === "salaries" ? mergeSalaries(state, sheet.records)
    : mergePrices(state, sheet.projects);

  const rowsImported =
    sheet.kind === "timesheet" ? sheet.entries.length
    : sheet.kind === "salaries" ? sheet.records.length
    : sheet.projects.length;

  const log: UploadLogEntry = {
    id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: now.toISOString(),
    filename,
    kind: sheet.kind,
    rowsImported,
    summary: `${merged.summary} (sheet "${sheet.sheetName}", header on row ${sheet.headerRowNumber})`,
    warnings: sheet.warnings,
  };

  return {
    state: { ...merged.state, uploads: [log, ...merged.state.uploads].slice(0, MAX_LOG) },
    log,
  };
}
