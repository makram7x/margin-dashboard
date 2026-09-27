import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { IngestError, readWorkbook } from "@/lib/ingest/workbook";
import { TIMESHEET_HEADER, tsRow, xlsx } from "./helpers";

const sample = (f: string) => new Uint8Array(fs.readFileSync(path.join(__dirname, "..", "sample-data", f)));

describe("sample workbooks", () => {
  it("recognises each file by its headers", () => {
    const ts = readWorkbook(sample("timesheet-2025.xlsx"), "timesheet-2025.xlsx");
    const sal = readWorkbook(sample("salaries-2025.xlsx"), "salaries-2025.xlsx");
    const pr = readWorkbook(sample("project-prices-2025.xlsx"), "project-prices-2025.xlsx");

    expect(ts.kind).toBe("timesheet");
    expect(sal.kind).toBe("salaries");
    expect(pr.kind).toBe("prices");
    if (ts.kind !== "timesheet" || sal.kind !== "salaries" || pr.kind !== "prices") return;

    expect(ts.entries).toHaveLength(562);
    expect(ts.months).toHaveLength(12);
    expect(sal.headerRowNumber).toBe(2); // title row above the header
    expect(sal.records).toHaveLength(12 * 12);
    expect(sal.records.find((r) => r.employeeName === "Hana Yousef" && r.month === 7)?.amount).toBe(20500);
    expect(pr.projects.find((p) => p.refCode === "Q2025001a")).toMatchObject({ price: 560000, salesYear: 2025, salesMonth: 1 });
  });

  it("keeps leading-zero employee numbers joinable", () => {
    const ts = readWorkbook(sample("timesheet-2025.xlsx"), "t.xlsx");
    const sal = readWorkbook(sample("salaries-2025.xlsx"), "s.xlsx");
    if (ts.kind !== "timesheet" || sal.kind !== "salaries") throw new Error("wrong kinds");
    const tsKeys = new Set(ts.entries.map((e) => e.employeeKey));
    const salKeys = new Set(sal.records.map((r) => r.employeeKey));
    expect([...tsKeys].every((k) => salKeys.has(k))).toBe(true);
  });
});

describe("messy timesheets", () => {
  const messy = xlsx([
    ["Tentwenty timesheet export"],
    [],
    TIMESHEET_HEADER,
    tsRow("May '25", 10201, "Ayesha Rahman", "Projects", "Q1", 100),
    tsRow(null, null, "", "fc-meetings", "FC - Meetings", "20"), // month + person carried down; "20" as text
    tsRow("May '25", "10202", "Rohit Menon", "Projects", "Q1", "-"), // dash = no hours
    tsRow("May '25", "10202", "Rohit Menon", "Projects", "Q1", "lots"), // not a number
    tsRow("June", "10202", "Rohit Menon", "Projects", "Q1", 50), // no year: from filename
    ["Total", null, null, null, null, null, null, null, null, null, null, 170],
    [],
  ]);

  it("finds the header below title rows and absorbs blanks, dashes and odd months", () => {
    const sheet = readWorkbook(messy, "timesheet-2025.xlsx");
    expect(sheet.kind).toBe("timesheet");
    if (sheet.kind !== "timesheet") return;
    expect(sheet.headerRowNumber).toBe(3);

    expect(sheet.entries.map((e) => [e.employeeName, e.year, e.month, e.category, e.hours])).toEqual([
      ["Ayesha Rahman", 2025, 5, "Projects", 100],
      ["Ayesha Rahman", 2025, 5, "FC - Meetings", 20],
      ["Rohit Menon", 2025, 6, "Projects", 50],
    ]);
    expect(sheet.entries[0].employeeNo).toBe("10201");
    expect(sheet.months).toEqual([{ year: 2025, month: 5 }, { year: 2025, month: 6 }]);

    const warnings = sheet.warnings.join("\n");
    expect(warnings).toMatch(/blank or '-' hours \(row 6\)/);
    expect(warnings).toMatch(/weren't a number.*"lots".*row 7/);
    expect(warnings).toMatch(/used the month from the row above/);
    expect(warnings).toMatch(/total\/subtotal row \(row 9\)/);
  });

  it("asks for a year when a bare month can't be placed", () => {
    expect(() => readWorkbook(messy, "timesheet.xlsx")).toThrow(/Choose the year/);
    const sheet = readWorkbook(messy, "timesheet.xlsx", { fallbackYear: 2024 });
    if (sheet.kind !== "timesheet") throw new Error();
    expect(sheet.entries.at(-1)).toMatchObject({ year: 2024, month: 6 });
  });
});

describe("salary sheet quirks", () => {
  it("reads the year from the title and skips '-' cells", () => {
    const sheet = readWorkbook(
      xlsx([
        [null, "Salary Overview 2026 (AED)"],
        ["Employee No.", "Employee Name", "January", "February", "March"],
        ["101", "Hana Yousef", "20,000", "-", 21000],
      ]),
      "salaries.xlsx",
    );
    if (sheet.kind !== "salaries") throw new Error(sheet.kind);
    expect(sheet.records.map((r) => [r.year, r.month, r.amount])).toEqual([
      [2026, 1, 20000],
      [2026, 3, 21000],
    ]);
    expect(sheet.warnings.join()).toMatch(/1 blank or '-' salary cell/);
  });
});

describe("files that aren't what they claim to be", () => {
  it("rejects a salary sheet uploaded as a timesheet", () => {
    expect(() =>
      readWorkbook(sample("salaries-2025.xlsx"), "timesheet.xlsx", { expectedKind: "timesheet" }),
    ).toThrow(/looks like a salary overview, not a timesheet/);
  });

  it("rejects a non-spreadsheet", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 not a workbook");
    expect(() => readWorkbook(pdf, "timesheet.xlsx")).toThrow(IngestError);
  });

  it("says which columns are missing", () => {
    const noHours = xlsx([TIMESHEET_HEADER.slice(0, -1), ["May '25", "1", "A", "DL", "D", "X", "Projects", "Q1", "", "", ""]]);
    expect(() => readWorkbook(noHours, "t.xlsx", { expectedKind: "timesheet" })).toThrow(/no column found for Hours/);
  });
});
