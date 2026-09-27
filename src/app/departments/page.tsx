import { DataTable } from "@/components/DataTable";
import { PageHead } from "@/components/PageHead";
import { Card, NoData } from "@/components/ui";
import { getModel, periodLabel, periodQuery, readPeriod, type SearchParams } from "@/lib/data";
import { departments, totals } from "@/lib/model/metrics";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const model = getModel();
  if (model.months.length === 0) {
    return (
      <>
        <PageHead title="Departments" />
        <NoData />
      </>
    );
  }
  const period = await readPeriod(searchParams, model);
  const rows = departments(model, period);
  const t = totals(model, period);
  const q = periodQuery(period);
  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((a, r) => a + (r[k] as number), 0);

  return (
    <div className="stack">
      <PageHead
        title="Departments"
        sub={`${periodLabel(period)}. Salary cost is what the department's people were paid. Charged to projects is what their billable hours carried: their own direct cost plus a share of everyone's indirect cost.`}
        model={model}
        period={period}
      />
      <Card title="All departments" hint="Click a department to see each person's hours and cost" flush>
        <DataTable
          exportName={`departments-${periodLabel(period).replace(/\s+/g, "-").toLowerCase()}`}
          initialSort={{ key: "totalHours", dir: "desc" }}
          columns={[
            { key: "department", label: "Department", href: "href" },
            { key: "people", label: "People", kind: "int" },
            { key: "totalHours", label: "Total h", kind: "hours" },
            { key: "billableHours", label: "Billable h", kind: "hours" },
            { key: "productivity", label: "Productivity", kind: "meter" },
            { key: "salary", label: "Salary cost (AED)", kind: "aed" },
            { key: "nonBillableCost", label: "Internal time (AED)", kind: "aed", title: "Salary paid for non-billable hours" },
            { key: "chargedToProjects", label: "Charged to projects (AED)", kind: "aed" },
            { key: "revenue", label: "Revenue earned (AED)", kind: "aed", title: "Their share of project revenue, by hours" },
          ]}
          rows={rows.map((r) => ({ ...r, href: `/departments/${encodeURIComponent(r.department)}${q}` }))}
          footer={{
            department: "Total",
            people: sum("people"),
            totalHours: t.totalHours,
            billableHours: t.billableHours,
            productivity: t.productivity,
            salary: sum("salary"),
            nonBillableCost: sum("nonBillableCost"),
            chargedToProjects: sum("chargedToProjects"),
            revenue: sum("revenue"),
          }}
        />
      </Card>
    </div>
  );
}
