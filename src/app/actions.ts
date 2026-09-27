"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { IngestError } from "@/lib/ingest/workbook";
import { ingestFile } from "@/lib/store/ingest";
import { updateState, withSampleData } from "@/lib/store/fileStore";
import { emptyState, type FileKind, type Settings } from "@/lib/types";

export interface FileResult {
  slot: FileKind;
  filename: string;
  ok: boolean;
  message: string;
  warnings: string[];
}

export interface UploadState {
  results: FileResult[];
  at: number;
}

const SLOTS: FileKind[] = ["prices", "salaries", "timesheet"];

/**
 * Each file is ingested on its own: a bad salary sheet doesn't stop a good timesheet from
 * loading, and a rejected file changes nothing.
 */
export async function uploadFiles(_prev: UploadState | null, form: FormData): Promise<UploadState> {
  const yearRaw = Number(form.get("fallbackYear"));
  const fallbackYear = Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : undefined;
  const results: FileResult[] = [];

  for (const slot of SLOTS) {
    const file = form.get(slot);
    if (!(file instanceof File) || file.size === 0) continue;
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const log = await updateState((state) => {
        const out = ingestFile(state, bytes, file.name, { expectedKind: slot, fallbackYear });
        return { state: out.state, result: out.log };
      });
      results.push({ slot, filename: file.name, ok: true, message: log.summary, warnings: log.warnings });
    } catch (err) {
      const message = err instanceof IngestError ? err.message : `Unexpected error reading "${file.name}": ${(err as Error).message}`;
      results.push({ slot, filename: file.name, ok: false, message, warnings: [] });
    }
  }

  if (results.length === 0) {
    results.push({ slot: "timesheet", filename: "", ok: false, message: "Choose at least one file to upload.", warnings: [] });
  }
  revalidatePath("/", "layout");
  return { results, at: Date.now() };
}

export async function loadSampleData(): Promise<void> {
  await updateState((state) => ({ state: withSampleData(state), result: null }));
  revalidatePath("/", "layout");
}

export async function clearData(): Promise<void> {
  await updateState((state) => ({ state: { ...emptyState(), settings: state.settings }, result: null }));
  revalidatePath("/", "layout");
}

export async function saveSettings(form: FormData): Promise<void> {
  const billableCategories = form.getAll("billable").map(String).filter(Boolean);
  const overheadMonthly = Math.max(0, Number(form.get("overheadMonthly")) || 0);

  const overheadOverrides: Record<string, number> = {};
  for (const [key, value] of form.entries()) {
    const m = key.match(/^override-(\d{4}-\d{2})$/);
    if (!m || String(value).trim() === "") continue;
    const n = Number(String(value).replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 0) overheadOverrides[m[1]] = n;
  }

  await updateState((state) => {
    // Overrides for years not shown in the form are kept.
    const shownYear = String(form.get("overrideYear") ?? "");
    const kept = Object.fromEntries(Object.entries(state.settings.overheadOverrides).filter(([k]) => !k.startsWith(`${shownYear}-`)));
    const settings: Settings = {
      billableCategories,
      overheadMonthly,
      overheadOverrides: { ...kept, ...overheadOverrides },
    };
    return { state: { ...state, settings }, result: null };
  });
  revalidatePath("/", "layout");
  redirect(`/settings?saved=1&year=${form.get("overrideYear") ?? ""}`);
}
