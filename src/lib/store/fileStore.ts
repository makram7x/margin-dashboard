// Persistence: the whole dataset lives in one JSON file (data/store.json by default).
//
// Why not SQLite? A year is ~600 timesheet rows; the full model is rebuilt from scratch on
// every request in a few milliseconds, so a database buys nothing here but a native build step,
// and native modules are the most common reason a Node app fails to start from a clean checkout.
// Writes are atomic (temp file + rename) and serialised through a queue within the process.

import fs from "node:fs";
import path from "node:path";
import { emptyState, type DataState } from "../types";
import { ingestFile } from "./ingest";

const DATA_DIR = process.env.MARGIN_DATA_DIR ?? path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
export const SAMPLE_DIR = path.join(process.cwd(), "sample-data");

export const SAMPLE_FILES = ["project-prices-2025.xlsx", "salaries-2025.xlsx", "timesheet-2025.xlsx"];

function writeAtomic(state: DataState) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, STORE_PATH);
}

/** Load the sample workbooks shipped in sample-data/ on top of the given state. */
export function withSampleData(state: DataState): DataState {
  let next = state;
  for (const file of SAMPLE_FILES) {
    const bytes = fs.readFileSync(path.join(SAMPLE_DIR, file));
    next = ingestFile(next, new Uint8Array(bytes), file).state;
  }
  return next;
}

/** Current state. The very first run seeds the sample data so the dashboard opens populated. */
export function loadState(): DataState {
  if (!fs.existsSync(STORE_PATH)) {
    const seeded = withSampleData(emptyState());
    writeAtomic(seeded);
    return seeded;
  }
  const state = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as DataState;
  return { ...emptyState(), ...state, settings: { ...emptyState().settings, ...state.settings } };
}

let queue: Promise<unknown> = Promise.resolve();

/** Read-modify-write, one at a time. */
export function updateState<T>(fn: (state: DataState) => { state: DataState; result: T }): Promise<T> {
  const run = queue.then(() => {
    const { state, result } = fn(loadState());
    writeAtomic(state);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}
