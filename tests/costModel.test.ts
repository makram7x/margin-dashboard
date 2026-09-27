import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildCostModel } from "@/lib/model/costModel";
import { people, projectDetail, totals } from "@/lib/model/metrics";
import { ingestFile } from "@/lib/store/ingest";
import { emptyState, type DataState, type SalaryRecord, type TimesheetEntry } from "@/lib/types";

const JAN = { year: 2025, month: 1 };

function entry(name: string, category: string, refCode: string, hours: number, month = JAN): TimesheetEntry {
  return {
    ...month,
    employeeKey: `name:${name}`,
    employeeNo: null,
    employeeName: name,
    expenseType: "DL",
    department: name === "Alice" ? "Design" : "Backend",
    designation: null,
    category,
    refCode,
    taskName: refCode,
    company: null,
    description: null,
    hours,
  };
}

function salary(name: string, amount: number, month = JAN): SalaryRecord {
  return { ...month, employeeKey: `name:${name}`, employeeNo: null, employeeName: name, amount };
}

/**
 * Hand-worked example.
 *   Alice  salary 10,000  P1 80h, meetings 20h  -> 100h, direct 100/h
 *   Bob    salary  6,400  P1 20h, P2 40h, idle 20h -> 80h, direct 80/h
 *   Carol  salary  5,000  no hours (support staff)
 *   Overhead 1,900
 *   Pool = 5,000 + 20×100 + 20×80 + 1,900 = 10,500 ; billable hours 140 ; indirect = 75/h
 */
function example(overhead = 1900): DataState {
  return {
    ...emptyState(),
    timesheet: [
      entry("Alice", "Projects", "P1", 80),
      entry("Alice", "FC - Meetings", "FC - Meetings", 20),
      entry("Bob", "Projects", "P1", 20),
      entry("Bob", "Enhancements", "P2", 40),
      entry("Bob", "FC - Idle", "FC - Idle", 20),
    ],
    salaries: [salary("Alice", 10000), salary("Bob", 6400), salary("Carol", 5000)],
    projects: [
      { refCode: "P1", name: "Project One", price: 20000, salesYear: 2025, salesMonth: 1, category: "Projects", status: null },
      { refCode: "P2", name: "Project Two", price: 6000, salesYear: 2025, salesMonth: 1, category: "Enhancements", status: null },
    ],
    settings: { billableCategories: ["Projects", "Enhancements", "Hosting"], overheadMonthly: overhead, overheadOverrides: {} },
  };
}

describe("cost model — hand-worked example", () => {
  const model = buildCostModel(example());
  const jan = model.months[0];

  it("derives direct and indirect rates", () => {
    const rate = (n: string) => jan.employees.find((e) => e.employeeName === n)!.directRate;
    expect(rate("Alice")).toBe(100);
    expect(rate("Bob")).toBe(80);
    expect(jan.supportStaff.map((s) => s.employeeName)).toEqual(["Carol"]);
    expect(jan.pool).toBe(10500);
    expect(jan.billableHours).toBe(140);
    expect(jan.indirectRate).toBe(75);
  });

  it("allocates every dirham of salary + overhead", () => {
    expect(jan.allocatedCost).toBeCloseTo(10000 + 6400 + 5000 + 1900, 6);
    expect(totals(model, { year: 2025, month: 1 }).cost).toBeCloseTo(23300, 6);
  });

  it("costs projects and people per the brief", () => {
    const p1 = projectDetail(model, "P1")!;
    expect(p1.cost).toBeCloseTo(80 * 175 + 20 * 155, 6); // 17,100
    expect(p1.margin).toBeCloseTo((20000 - 17100) / 20000, 9);

    const alice = p1.contributors.find((c) => c.employeeName === "Alice")!;
    const bob = p1.contributors.find((c) => c.employeeName === "Bob")!;
    expect(alice.revenueShare).toBeCloseTo(16000, 6); // 20,000 × 80/100
    expect(alice.profitability).toBeCloseTo((16000 - 14000) / 16000, 9);
    expect(bob.revenueShare).toBeCloseTo(4000, 6);
    expect(bob.profitability).toBeCloseTo((4000 - 3100) / 4000, 9);

    const p2 = projectDetail(model, "P2")!;
    expect(p2.margin).toBeCloseTo((6000 - 6200) / 6000, 9);
  });

  it("computes productivity", () => {
    const rows = people(model, { year: 2025, month: 1 });
    expect(rows.find((r) => r.employeeName === "Alice")!.productivity).toBeCloseTo(0.8, 9);
    expect(rows.find((r) => r.employeeName === "Bob")!.productivity).toBeCloseTo(0.75, 9);
  });

  it("honours configurable billable categories", () => {
    const state = example(0);
    state.settings.billableCategories = ["Projects"]; // Enhancements now internal
    const m = buildCostModel(state).months[0];
    expect(m.billableHours).toBe(100);
    expect(m.allocatedCost).toBeCloseTo(21400, 6);
  });
});

describe("cost model — gaps", () => {
  it("flags a missing salary and costs that time at zero direct", () => {
    const state = example(0);
    state.salaries = state.salaries.filter((s) => s.employeeName !== "Bob");
    const model = buildCostModel(state);
    expect(model.issues.find((i) => i.code === "missing-salary")?.title).toMatch(/Bob/);
    expect(model.months[0].employees.find((e) => e.employeeName === "Bob")!.directRate).toBe(0);
    // Still reconciles to the salaries we do have.
    expect(model.months[0].allocatedCost).toBeCloseTo(15000, 6);
  });

  it("flags hours on an unpriced ref code", () => {
    const state = example(0);
    state.timesheet.push(entry("Alice", "Projects", "P9", 10));
    const model = buildCostModel(state);
    const issue = model.issues.find((i) => i.code === "unpriced-project");
    expect(issue?.refCode).toBe("P9");
    expect(projectDetail(model, "P9")!.project.listed).toBe(false);
  });

  it("keeps an unallocatable pool as unallocated cost when a month has no billable hours", () => {
    const state = example(0);
    const feb = { year: 2025, month: 2 };
    state.timesheet.push(entry("Alice", "FC - Leaves", "FC - Leaves", 160, feb));
    state.salaries.push(salary("Alice", 10000, feb));
    const model = buildCostModel(state);
    const febLedger = model.months.find((m) => m.month === 2)!;
    expect(febLedger.indirectRate).toBeNull();
    expect(febLedger.unallocatedCost).toBe(10000);
    expect(totals(model, { year: 2025, month: 2 }).cost).toBe(10000);
    expect(model.issues.some((i) => i.code === "no-billable-hours")).toBe(true);
  });

  it("recognises each project's full price across the months it was worked", () => {
    const state = example(0);
    state.timesheet.push(entry("Alice", "Projects", "P1", 100, { year: 2025, month: 2 }));
    state.salaries.push(salary("Alice", 10000, { year: 2025, month: 2 }));
    const model = buildCostModel(state);
    const jan = totals(model, { year: 2025, month: 1 }).revenue;
    const feb = totals(model, { year: 2025, month: 2 }).revenue;
    expect(jan + feb).toBeCloseTo(26000, 6);
    expect(feb).toBeCloseTo(20000 * (100 / 200), 6);
  });
});

describe("self-check on the sample year", () => {
  const sample = (f: string) => new Uint8Array(fs.readFileSync(path.join(__dirname, "..", "sample-data", f)));
  let state = emptyState();
  for (const f of ["timesheet-2025.xlsx", "salaries-2025.xlsx", "project-prices-2025.xlsx"]) {
    state = ingestFile(state, sample(f), f).state;
  }

  it("with overhead 0, total cost equals total salaries to the dirham", () => {
    const t = totals(buildCostModel(state), { year: 2025, month: null });
    expect(t.salaries).toBe(2_400_000);
    expect(Math.abs(t.cost - t.salaries)).toBeLessThan(0.005);
    expect(t.revenue).toBeCloseTo(5_012_000, 4);
  });

  it("with overhead, total cost equals salaries plus overhead", () => {
    const model = buildCostModel({ ...state, settings: { ...state.settings, overheadMonthly: 25000 } });
    const t = totals(model, { year: 2025, month: null });
    expect(t.cost).toBeCloseTo(2_400_000 + 12 * 25000, 4);
  });
});
