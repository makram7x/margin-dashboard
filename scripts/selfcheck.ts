// Prints the year's totals and checks the brief's reconciliation:
// with overhead = 0, company-wide cost must equal total salaries, to the dirham.
//
//   npm run selfcheck               # uses the sample workbooks in sample-data/
//   npm run selfcheck -- --store    # uses whatever is currently loaded in the app (data/store.json)

import { buildCostModel } from "../src/lib/model/costModel";
import { totals } from "../src/lib/model/metrics";
import { loadState, withSampleData } from "../src/lib/store/fileStore";
import { emptyState, monthLabel } from "../src/lib/types";

const useStore = process.argv.includes("--store");
const base = useStore ? loadState() : withSampleData(emptyState());
const state = { ...base, settings: { ...base.settings, overheadMonthly: 0, overheadOverrides: {} } };
const model = buildCostModel(state);

const aed = (n: number) => n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (s: string, n: number) => s.padStart(n);
const zero = (n: number) => (Math.abs(n) < 5e-7 ? 0 : n); // avoid printing "-0.000000"

console.log(`Source: ${useStore ? "data/store.json" : "sample-data/*.xlsx"} · overhead forced to 0`);
console.log(`Billable categories: ${state.settings.billableCategories.join(", ")}\n`);
console.log(
  ["Month", "Salaries", "Pool", "Bill. h", "Ind. rate", "Allocated", "Unalloc.", "Diff"].map((h, i) => pad(h, i === 0 ? 14 : 13)).join(""),
);

let failed = false;
for (const m of model.months) {
  const diff = m.allocatedCost + m.unallocatedCost - m.salaryTotal;
  if (Math.abs(diff) >= 0.005) failed = true;
  console.log(
    [
      pad(monthLabel(m), 14),
      pad(aed(m.salaryTotal), 13),
      pad(aed(m.pool), 13),
      pad(m.billableHours.toFixed(1), 13),
      pad(m.indirectRate === null ? "—" : m.indirectRate.toFixed(2), 13),
      pad(aed(m.allocatedCost), 13),
      pad(aed(m.unallocatedCost), 13),
      pad(zero(diff).toFixed(4), 13),
    ].join(""),
  );
}

for (const year of model.years) {
  const t = totals(model, { year, month: null });
  const diff = t.cost - t.salaries;
  console.log(`\n${year}`);
  console.log(`  Total hours     ${pad(t.totalHours.toFixed(1), 16)}`);
  console.log(`  Billable hours  ${pad(t.billableHours.toFixed(1), 16)}  (${((t.productivity ?? 0) * 100).toFixed(1)}%)`);
  console.log(`  Salaries        ${pad(aed(t.salaries), 16)}`);
  console.log(`  Cost            ${pad(aed(t.cost), 16)}`);
  console.log(`  Revenue         ${pad(aed(t.revenue), 16)}`);
  console.log(`  Margin          ${pad(aed(t.profit), 16)}  (${((t.margin ?? 0) * 100).toFixed(1)}%)`);
  console.log(`  Cost − salaries ${pad(zero(diff).toFixed(6), 16)}  ${Math.abs(diff) < 0.005 ? "✓ reconciles" : "✗ DOES NOT RECONCILE"}`);
  if (Math.abs(diff) >= 0.005) failed = true;
}

const warnings = model.issues.filter((i) => i.severity !== "info");
console.log(`\nData issues: ${warnings.length} warning/error, ${model.issues.length - warnings.length} info`);
for (const i of warnings) console.log(`  [${i.severity}] ${i.title}`);

process.exit(failed ? 1 : 0);
