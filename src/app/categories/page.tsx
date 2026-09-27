import { DataTable } from "@/components/DataTable";
import { PageHead } from "@/components/PageHead";
import { Card, Kpi, NoData } from "@/components/ui";
import { getModel, periodLabel, readPeriod, type SearchParams } from "@/lib/data";
import { aed, hours, pct } from "@/lib/format";
import { categories, employeeCategoryMatrix, totals } from "@/lib/model/metrics";

export const dynamic = "force-dynamic";

export default async function CategoriesPage({ searchParams }: { searchParams: SearchParams }) {
  const model = getModel();
  if (model.months.length === 0) {
    return (
      <>
        <PageHead title="Where the time goes" />
        <NoData />
      </>
    );
  }
  const period = await readPeriod(searchParams, model);
  const label = periodLabel(period);
  const cats = categories(model, period);
  const t = totals(model, period);
  const internal = cats.filter((c) => !c.billable);
  const internalValue = internal.reduce((a, c) => a + c.salaryValue, 0);
  const matrix = employeeCategoryMatrix(model, period);
  const slug = label.replace(/\s+/g, "-").toLowerCase();

  return (
    <div className="stack">
      <PageHead
        title="Where the time goes"
        sub={`${label}. Hours logged per timesheet category. Salary value = hours × each person's direct rate that month: what the time cost in pay.`}
        model={model}
        period={period}
      />

      <section className="card">
        <div className="kpi-row">
          <Kpi label="Billable" value={pct(t.productivity)} note={`${hours(t.billableHours)} h`} />
          <Kpi label="Internal" value={pct(t.totalHours ? 1 - t.billableHours / t.totalHours : null)} note={`${hours(t.totalHours - t.billableHours)} h`} />
          <Kpi label="Salary spent on internal time" value={aed(internalValue, { compact: true })} note="Goes into the indirect cost pool" />
          <Kpi label="Largest internal category" value={internal[0]?.category ?? "—"} note={internal[0] ? `${hours(internal[0].hours)} h · ${pct(internal[0].share)} of all time` : undefined} />
        </div>
        <div style={{ padding: "0 18px 16px" }}>
          <div className="sharebar" role="img" aria-label="Share of hours by category">
            {cats.map((c) => (
              <span
                key={c.category}
                title={`${c.category}: ${hours(c.hours)} h (${pct(c.share)})`}
                style={{ width: `${(c.share ?? 0) * 100}%`, background: c.billable ? "var(--series-1)" : "var(--internal)" }}
              />
            ))}
          </div>
          <div className="legend" style={{ marginTop: 8 }}>
            <span><i className="swatch" style={{ background: "var(--series-1)" }} /> Billable categories</span>
            <span><i className="swatch" style={{ background: "var(--internal)" }} /> Internal categories (each segment is one category, largest first)</span>
          </div>
        </div>
      </section>

      <Card title="Hours by category" flush>
        <DataTable
          exportName={`categories-${slug}`}
          columns={[
            { key: "category", label: "Category" },
            { key: "type", label: "Type" },
            { key: "hours", label: "Hours", kind: "hours" },
            { key: "share", label: "Share of all hours", kind: "meter" },
            { key: "people", label: "People", kind: "int" },
            { key: "salaryValue", label: "Salary value (AED)", kind: "aed" },
          ]}
          rows={cats.map((c) => ({ ...c, type: c.billable ? "Billable" : "Internal" }))}
          footer={{ category: "Total", hours: t.totalHours, share: 1, salaryValue: cats.reduce((a, c) => a + c.salaryValue, 0) }}
        />
      </Card>

      <Card title="Person × category" hint="Hours. The pivot finance builds by hand — export it as CSV." flush>
        <DataTable
          exportName={`person-by-category-${slug}`}
          columns={[
            { key: "employeeName", label: "Person", sub: "department" },
            ...matrix.categories.map((c) => ({ key: c.category, label: c.category, kind: "hours" as const })),
            { key: "total", label: "Total", kind: "hours" },
          ]}
          rows={matrix.rows.map((r) => ({ employeeName: r.employeeName, department: r.department, ...r.hours, total: r.total }))}
          footer={{ employeeName: "Total", ...matrix.columnTotals, total: matrix.total }}
        />
      </Card>
    </div>
  );
}
