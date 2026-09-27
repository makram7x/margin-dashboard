import { DataTable } from "@/components/DataTable";
import { PageHead } from "@/components/PageHead";
import { Card, Kpi, NoData } from "@/components/ui";
import { getModel, periodLabel, periodQuery, readPeriod, type SearchParams } from "@/lib/data";
import { hours, pct } from "@/lib/format";
import { people, totals } from "@/lib/model/metrics";

export const dynamic = "force-dynamic";

export default async function ProductivityPage({ searchParams }: { searchParams: SearchParams }) {
  const model = getModel();
  if (model.months.length === 0) {
    return (
      <>
        <PageHead title="Productivity" />
        <NoData />
      </>
    );
  }
  const period = await readPeriod(searchParams, model);
  const rows = people(model, period);
  const t = totals(model, period);
  const billablePeople = rows.filter((r) => r.billableHours > 0);
  const low = billablePeople.filter((r) => (r.productivity ?? 0) < 0.75);
  const q = periodQuery(period);

  return (
    <div className="stack">
      <PageHead
        title="Productivity"
        sub={`${periodLabel(period)}. Productivity = billable hours ÷ total hours logged. Billable categories: ${model.settings.billableCategories.join(", ")} (change in Settings).`}
        model={model}
        period={period}
      />

      <section className="card">
        <div className="kpi-row">
          <Kpi label="Company productivity" value={pct(t.productivity)} note={`${hours(t.billableHours)} of ${hours(t.totalHours)} h`} />
          <Kpi label="Non-billable hours" value={hours(t.totalHours - t.billableHours)} note="Absorbed as indirect cost" />
          <Kpi
            label="Below 75%"
            value={String(low.length)}
            note={low.length ? low.map((r) => r.employeeName.split(" ")[0]).join(", ") : "Nobody in billable roles"}
          />
          <Kpi
            label="No billable time"
            value={String(rows.length - billablePeople.length)}
            note={rows.filter((r) => r.billableHours === 0).map((r) => r.employeeName).join(", ") || "—"}
          />
        </div>
      </section>

      <Card title="By person" hint="Sorted lowest productivity first — who is stuck on non-billable work, and on what" flush>
        <DataTable
          exportName={`productivity-${periodLabel(period).replace(/\s+/g, "-").toLowerCase()}`}
          initialSort={{ key: "productivity", dir: "asc" }}
          columns={[
            { key: "employeeName", label: "Person", sub: "role" },
            { key: "department", label: "Department", href: "deptHref" },
            { key: "expenseType", label: "Type", title: "DL = direct labour, IDL = indirect labour (from the timesheet)" },
            { key: "totalHours", label: "Total h", kind: "hours" },
            { key: "billableHours", label: "Billable h", kind: "hours" },
            { key: "nonBillableHours", label: "Non-billable h", kind: "hours" },
            { key: "productivity", label: "Productivity", kind: "meter" },
            { key: "topNonBillable", label: "Biggest non-billable use", sub: "topNonBillableHours" },
          ]}
          rows={rows.map((r) => ({
            employeeName: r.employeeName,
            role: r.designation,
            department: r.department,
            deptHref: `/departments/${encodeURIComponent(r.department)}${q}`,
            expenseType: r.expenseType,
            totalHours: r.totalHours,
            billableHours: r.billableHours,
            nonBillableHours: r.nonBillableHours,
            productivity: r.productivity,
            topNonBillable: r.topNonBillable?.category ?? null,
            topNonBillableHours: r.topNonBillable ? `${hours(r.topNonBillable.hours)} h` : null,
          }))}
          footer={{ employeeName: "All staff", totalHours: t.totalHours, billableHours: t.billableHours, nonBillableHours: t.totalHours - t.billableHours, productivity: t.productivity }}
        />
      </Card>
    </div>
  );
}
