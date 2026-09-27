import { PageHead } from "@/components/PageHead";
import { Card, NoData } from "@/components/ui";
import { DataTable } from "@/components/DataTable";
import { getModel, periodLabel, readPeriod, type SearchParams } from "@/lib/data";
import { aed, hours, rate } from "@/lib/format";
import { monthsIn } from "@/lib/model/metrics";
import { monthLabel } from "@/lib/types";

export const dynamic = "force-dynamic";

const TOLERANCE = 0.005; // half a fils

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const model = getModel();
  if (model.months.length === 0) {
    return (
      <>
        <PageHead title="Cost audit" />
        <NoData />
      </>
    );
  }
  const period = await readPeriod(searchParams, model);
  const months = monthsIn(model, period);
  const s = (f: (m: (typeof months)[number]) => number) => months.reduce((a, m) => a + f(m), 0);

  const salaries = s((m) => m.salaryTotal);
  const overhead = s((m) => m.overhead);
  const costed = s((m) => m.allocatedCost + m.unallocatedCost);
  const diff = costed - (salaries + overhead);
  const reconciles = Math.abs(diff) < TOLERANCE;

  return (
    <div className="stack">
      <PageHead
        title="Cost audit"
        sub={`${periodLabel(period)}. How each month's cost rates were derived, and proof that every salary and overhead dirham is counted exactly once.`}
        model={model}
        period={period}
      />

      <div className={`callout ${reconciles ? "good" : "bad"}`}>
        <strong>{reconciles ? "✓ Reconciles." : "✗ Does not reconcile."}</strong>{" "}
        Salaries {aed(salaries)} + overhead {aed(overhead)} = {aed(salaries + overhead)}. Cost carried by billable hours
        {s((m) => m.unallocatedCost) > 0 ? " plus unallocated cost" : ""} = {aed(costed)}. Difference: AED {Math.abs(diff).toFixed(2)}.
      </div>

      <Card title="The formulas" hint="Applied per calendar month">
        <pre style={{ margin: 0, fontSize: 12.5, lineHeight: 1.7, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>
{`direct rate (person)  = salary ÷ that person's total logged hours
indirect pool         = salaries of people with no hours
                      + non-billable hours × each person's direct rate
                      + overhead (Settings)
indirect rate         = indirect pool ÷ billable hours
cost of billable time = hours × (direct rate + indirect rate)`}
        </pre>
      </Card>

      <Card title="Monthly ledger" flush>
        <DataTable
          exportName={`cost-audit-${periodLabel(period).replace(/\s+/g, "-").toLowerCase()}`}
          columns={[
            { key: "label", label: "Month" },
            { key: "salaryTotal", label: "Salaries", kind: "aed" },
            { key: "supportStaffCost", label: "Support staff", kind: "aed", title: "Salaries of people who logged no hours" },
            { key: "nonBillableCost", label: "Non-billable time", kind: "aed" },
            { key: "overhead", label: "Overhead", kind: "aed" },
            { key: "pool", label: "Indirect pool", kind: "aed" },
            { key: "billableHours", label: "Billable h", kind: "hours" },
            { key: "indirectRate", label: "Indirect rate", kind: "rate" },
            { key: "allocatedCost", label: "Allocated", kind: "aed" },
            { key: "unallocatedCost", label: "Unallocated", kind: "aed" },
            { key: "check", label: "Check" },
          ]}
          rows={months.map((m) => {
            const d = m.allocatedCost + m.unallocatedCost - m.salaryTotal - m.overhead;
            return {
              label: monthLabel(m),
              salaryTotal: m.salaryTotal,
              supportStaffCost: m.supportStaffCost,
              nonBillableCost: m.nonBillableCost,
              overhead: m.overhead,
              pool: m.pool,
              billableHours: m.billableHours,
              indirectRate: m.indirectRate,
              allocatedCost: m.allocatedCost,
              unallocatedCost: m.unallocatedCost,
              check: Math.abs(d) < TOLERANCE ? "✓" : `✗ ${d.toFixed(2)}`,
            };
          })}
          footer={{
            label: "Total",
            salaryTotal: salaries,
            supportStaffCost: s((m) => m.supportStaffCost),
            nonBillableCost: s((m) => m.nonBillableCost),
            overhead,
            pool: s((m) => m.pool),
            billableHours: s((m) => m.billableHours),
            allocatedCost: s((m) => m.allocatedCost),
            unallocatedCost: s((m) => m.unallocatedCost),
            check: reconciles ? "✓" : "✗",
          }}
        />
      </Card>

      <Card title="Direct rates by person" hint="Open a month to see each person's rate and how their hours split" flush>
        {months.map((m) => (
          <details key={m.key} className="month">
            <summary>
              <strong>{monthLabel(m)}</strong>
              <span className="muted"> · indirect rate {m.indirectRate === null ? "— (no billable hours)" : `AED ${rate(m.indirectRate)}/h`} · pool {aed(m.pool)} over {hours(m.billableHours)} billable h</span>
            </summary>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th className="r">Salary</th>
                    <th className="r">Total h</th>
                    <th className="r">Direct rate</th>
                    <th className="r">Billable h</th>
                    <th className="r">Non-billable h</th>
                    <th className="r">→ into pool</th>
                    <th className="r">Loaded rate</th>
                  </tr>
                </thead>
                <tbody>
                  {m.employees.map((e) => (
                    <tr key={e.employeeKey}>
                      <td>
                        {e.employeeName} <span className="sub">{e.department}</span>
                        {e.salary === null && <span className="tag tag-warn" style={{ marginLeft: 6 }}>no salary</span>}
                        {e.matchedByName && <span className="tag" style={{ marginLeft: 6 }}>matched by name</span>}
                      </td>
                      <td className="r">{e.salary === null ? "—" : aed(e.salary, { unit: false })}</td>
                      <td className="r">{hours(e.totalHours)}</td>
                      <td className="r">{rate(e.directRate)}</td>
                      <td className="r">{hours(e.billableHours)}</td>
                      <td className="r">{hours(e.nonBillableHours)}</td>
                      <td className="r">{aed(e.nonBillableCost, { unit: false })}</td>
                      <td className="r">{e.billableHours > 0 && m.indirectRate !== null ? rate(e.directRate + m.indirectRate) : "—"}</td>
                    </tr>
                  ))}
                  {m.supportStaff.map((p) => (
                    <tr key={p.employeeKey}>
                      <td>{p.employeeName} <span className="tag" style={{ marginLeft: 6 }}>support staff · no hours</span></td>
                      <td className="r">{aed(p.salary, { unit: false })}</td>
                      <td className="r">—</td>
                      <td className="r">—</td>
                      <td className="r">—</td>
                      <td className="r">—</td>
                      <td className="r">{aed(p.salary, { unit: false })}</td>
                      <td className="r">—</td>
                    </tr>
                  ))}
                  {m.overhead > 0 && (
                    <tr>
                      <td className="muted">Overhead</td>
                      <td colSpan={5} />
                      <td className="r">{aed(m.overhead, { unit: false })}</td>
                      <td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </Card>
    </div>
  );
}
