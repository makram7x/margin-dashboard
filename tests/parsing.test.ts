import { describe, expect, it } from "vitest";
import { employeeKey, isEmptyCell, normCategory, toNumber } from "@/lib/ingest/cells";
import { findYear, parseMonth } from "@/lib/ingest/dates";
import { projectDisplayName } from "@/lib/format";

describe("parseMonth", () => {
  it.each([
    ["May '25", { month: 5, year: 2025 }],
    ["January 2026", { month: 1, year: 2026 }],
    ["January", { month: 1, year: null }],
    ["Jan-25", { month: 1, year: 2025 }],
    ["Sept 2025", { month: 9, year: 2025 }],
    ["  march  2025 ", { month: 3, year: 2025 }],
    ["2025-03", { month: 3, year: 2025 }],
    ["03/2025", { month: 3, year: 2025 }],
  ])("%s", (input, expected) => {
    expect(parseMonth(input)).toEqual(expected);
  });

  it("reads Excel date serials and Date objects", () => {
    expect(parseMonth(45778)).toEqual({ month: 5, year: 2025 }); // 2025-05-01
    // Local-midnight 1 May in UTC+4 is 30 April 20:00 UTC; must still be May.
    expect(parseMonth(new Date("2025-04-30T20:00:00Z"))).toEqual({ month: 5, year: 2025 });
  });

  it("rejects things that aren't months", () => {
    expect(parseMonth("-")).toBeNull();
    expect(parseMonth("Junk")).toBeNull();
    expect(parseMonth("Total")).toBeNull();
    expect(parseMonth(176)).toBeNull();
  });
});

describe("cells", () => {
  it("treats dashes and blanks as empty", () => {
    for (const v of ["-", " - ", "–", "", null, undefined, "N/A"]) expect(isEmptyCell(v)).toBe(true);
    expect(isEmptyCell(0)).toBe(false);
  });

  it("parses numbers stored as text", () => {
    expect(toNumber("1,234.50")).toBe(1234.5);
    expect(toNumber("AED 18,000")).toBe(18000);
    expect(toNumber("(500)")).toBe(-500);
    expect(toNumber("-")).toBeNull();
    expect(toNumber("eight")).toBeNull();
  });

  it("canonicalises category spelling", () => {
    expect(normCategory("FC-Leaves")).toBe("FC - Leaves");
    expect(normCategory("fc -  meetings")).toBe("FC - Meetings");
    expect(normCategory(" Projects ")).toBe("Projects");
  });

  it("joins employee numbers with or without leading zeros", () => {
    expect(employeeKey("00101", "Hana Yousef")).toBe(employeeKey("101", "Hana"));
    expect(employeeKey(null, "Kevin  D'Souza")).toBe(employeeKey(null, "kevin dsouza"));
  });

  it("turns proposal filenames into readable project names", () => {
    expect(projectDisplayName("Meridian-Website-UIUXdesign-Development-14012025-COMMERCIAL.pdf")).toBe("Meridian Website UI/UX design Development");
    expect(projectDisplayName("Alwasl-Annual-Hosting-2025")).toBe("Alwasl Annual Hosting 2025");
  });

  it("finds a year in titles and filenames", () => {
    expect(findYear("Salary Overview 2025 (AED)")).toBe(2025);
    expect(findYear("timesheet-2024.xlsx")).toBe(2024);
    expect(findYear("Salary Overview")).toBeNull();
  });
});
