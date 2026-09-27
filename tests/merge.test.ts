import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ingestFile } from "@/lib/store/ingest";
import { emptyState, type DataState } from "@/lib/types";
import { TIMESHEET_HEADER, tsRow, xlsx } from "./helpers";

const sample = (f: string) => new Uint8Array(fs.readFileSync(path.join(__dirname, "..", "sample-data", f)));

function loaded(): DataState {
  let s = emptyState();
  for (const f of ["timesheet-2025.xlsx", "salaries-2025.xlsx", "project-prices-2025.xlsx"]) {
    s = ingestFile(s, sample(f), f).state;
  }
  return s;
}

describe("re-uploading", () => {
  it("is idempotent for the same file", () => {
    const once = loaded();
    const twice = ingestFile(once, sample("timesheet-2025.xlsx"), "timesheet-2025.xlsx").state;
    expect(twice.timesheet).toHaveLength(once.timesheet.length);
    expect(twice.salaries).toHaveLength(once.salaries.length);
  });

  it("a corrected month replaces only that month", () => {
    const before = loaded();
    const march = before.timesheet.filter((e) => e.month === 3);
    const others = before.timesheet.filter((e) => e.month !== 3);

    const correction = xlsx([
      TIMESHEET_HEADER,
      tsRow("March 2025", "10201", "Ayesha Rahman", "Projects", "Q2025001a", 150),
      tsRow("March 2025", "10201", "Ayesha Rahman", "FC - Leaves", "FC - Leaves", 26),
    ]);
    const { state, log } = ingestFile(before, correction, "march-fix.xlsx");

    const newMarch = state.timesheet.filter((e) => e.month === 3);
    expect(march.length).toBeGreaterThan(2);
    expect(newMarch).toHaveLength(2);
    expect(state.timesheet.filter((e) => e.month !== 3)).toEqual(others);
    expect(log.summary).toMatch(/replaced March 2025/);
  });

  it("salary upserts don't erase figures left blank", () => {
    const before = loaded();
    const fix = xlsx([
      ["Employee No.", "Employee Name", "January 2025", "February 2025"],
      ["10201", "Ayesha Rahman", 19000, "-"],
    ]);
    const { state, log } = ingestFile(before, fix, "salary-fix.xlsx");
    const ayesha = (m: number) => state.salaries.find((r) => r.employeeName === "Ayesha Rahman" && r.month === m)?.amount;
    expect(ayesha(1)).toBe(19000);
    expect(ayesha(2)).toBe(18000); // untouched
    expect(state.salaries).toHaveLength(before.salaries.length);
    expect(log.summary).toMatch(/0 new, 1 changed/);
  });

  it("price upserts by ref code and keeps unlisted projects", () => {
    const before = loaded();
    const fix = xlsx([
      ["Ref Code", "Project Name", "Project Price", "Sales month"],
      ["Q2025001a", "Meridian", "600,000", "January '25"],
      ["Q2026001a", "New thing", 50000, "January 2026"],
    ]);
    const { state } = ingestFile(before, fix, "prices-fix.xlsx");
    expect(state.projects).toHaveLength(before.projects.length + 1);
    expect(state.projects.find((p) => p.refCode === "Q2025001a")?.price).toBe(600000);
    expect(state.projects.find((p) => p.refCode === "Q2026001a")).toMatchObject({ salesYear: 2026, salesMonth: 1 });
  });
});
