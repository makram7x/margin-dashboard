import Link from "next/link";
import { DataTable } from "@/components/DataTable";
import { PageHead } from "@/components/PageHead";
import { Card, Kpi } from "@/components/ui";
import { getModel, periodLabel, periodQuery, readPeriod, type SearchParams } from "@/lib/data";
import { aed, hours, pct } from "@/lib/format";
import { people, ratio } from "@/lib/model/metrics";

export const dynamic = "force-dynamic";

export default async function DepartmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ dept: string }>;
  searchParams: SearchParams;
}) {
  const dept = decodeURIComponent((await params).dept);
  const model = getModel();
  const period = await readPeriod(searchParams, model);
  const rows = people(model, period, dept);
  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((a, r) => a + (r[k] as number), 0);
  const total = sum("totalHours");
  const billable = sum("billableHours");
  const missing = rows.filter((r) => r.missingSalaryMonths > 0);

  return (
    <div className="stack">
      <PageHead
        crumbs={<><Link href={`/departments${periodQuery(period)}`}>Departments</Link> / {dept}</>}
        title={dept}
        sub={`${periodLabel(period)}. Every person who logged time in ${dept}.`}
        model={model}
        period={period}
      />

      {rows.length === 0 ? (
        <Card><p className="muted">Nobody logged time in {dept} in this period.</p></Card>
      ) : (
        <>
          {missing.length > 0 && (
            <div className="callout warn">
              <strong>Missing salaries:</strong> {missing.map((r) => `${r.employeeName} (${r.missingSalaryMonths} month${r.missingSalaryMonths > 1 ? "s" : ""})`).join(", ")}. Their time is costed at AED 0 direct for those months.
            </div>
          )}
          <section className="card">
            <div className="kpi-row">
              <Kpi label="People" value={String(rows.length)} />
              <Kpi label="Hours" value={hours(total)} note={`${hours(billable)} billable`} />
              <Kpi label="Productivity" value={pct(ratio(billable, total))} />
              <Kpi label="Salary cost" value={aed(sum("salary"), { compact: true })} note={`${aed(sum("nonBillableCost"), { compact: true })} on internal time`} />
              <Kpi label="Charged to projects" value={aed(sum("chargedToProjects"), { compact: true })} note="Direct + indirect on billable hours" />
            </div>
          </section>
          <Card title="People" flush>
            <DataTable
              exportName={`department-${dept.toLowerCase()}-${periodLabel(period).replace(/\s+/g, "-").toLowerCase()}`}
              initialSort={{ key: "totalHours", dir: "desc" }}
              columns={[
                { key: "employeeName", label: "Person", sub: "designation" },
                { key: "totalHours", label: "Total h", kind: "hours" },
                { key: "billableHours", label: "Billable h", kind: "hours" },
                { key: "productivity", label: "Productivity", kind: "meter" },
                { key: "salary", label: "Salary (AED)", kind: "aed" },
                { key: "directCost", label: "On billable work (AED)", kind: "aed", title: "Salary paid for billable hours: direct cost carried by projects" },
                { key: "nonBillableCost", label: "On internal time (AED)", kind: "aed", title: "Salary paid for non-billable hours: goes into the indirect pool" },
                { key: "chargedToProjects", label: "Charged to projects (AED)", kind: "aed", title: "Billable hours × (direct + indirect rate)" },
                { key: "revenue", label: "Revenue earned (AED)", kind: "aed" },
              ]}
              rows={rows.map(({ topNonBillable: _, ...r }) => ({ ...r, salary: r.missingSalaryMonths > 0 && r.salary === 0 ? null : r.salary }))}
              footer={{
                employeeName: "Total",
                totalHours: total,
                billableHours: billable,
                productivity: ratio(billable, total),
                salary: sum("salary"),
                directCost: sum("directCost"),
                nonBillableCost: sum("nonBillableCost"),
                chargedToProjects: sum("chargedToProjects"),
                revenue: sum("revenue"),
              }}
            />
          </Card>
        </>
      )}
    </div>
  );
}
