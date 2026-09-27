import Link from "next/link";
import { DataTable } from "@/components/DataTable";
import { MonthlyChart } from "@/components/MonthlyChart";
import { PageHead } from "@/components/PageHead";
import { Card, IssueList, Kpi, NoData } from "@/components/ui";
import { getModel, periodLabel, periodQuery, readPeriod, type SearchParams } from "@/lib/data";
import { aed, hours, pct } from "@/lib/format";
import { departments, issuesIn, monthlySeries, projectRows, totals } from "@/lib/model/metrics";

export const dynamic = "force-dynamic";

export default async function Overview({ searchParams }: { searchParams: SearchParams }) {
  const model = getModel();
  if (model.months.length === 0) {
    return (
      <>
        <PageHead title="Overview" />
        <NoData />
      </>
    );
  }

  const period = await readPeriod(searchParams, model);
  const label = periodLabel(period);
  const t = totals(model, period);
  const projects = projectRows(model, period);
  const losing = projects.filter((p) => p.profit < 0);
  const depts = departments(model, period);
  const issues = issuesIn(model, period);
  const problems = issues.filter((i) => i.severity !== "info");
  const q = periodQuery(period);

  const answer =
    t.revenue === 0
      ? "No project revenue has been recognised in this period."
      : `${aed(t.revenue, { compact: true })} of project revenue against ${aed(t.cost, { compact: true })} of cost. ` +
        (losing.length === 0
          ? `All ${projects.length} projects worked in this period covered their cost.`
          : `${projects.length - losing.length} of ${projects.length} projects covered their cost; ${losing.length} lost money.`);

  return (
    <div className="stack">
      <PageHead
        title="Did we make money?"
        sub={`${label}. Revenue is each project's price recognised in proportion to the hours worked in the period; cost is every salary and overhead dirham, allocated to billable hours.`}
        model={model}
        period={period}
      />

      <section className="card headline">
        <div className="hero">
          <div className="label">Profit · {label}</div>
          <div className={`value ${t.profit < 0 ? "neg" : ""}`}>{aed(t.profit, { compact: true })}</div>
          <p className="answer">{answer}</p>
        </div>
        <div className="kpis">
          <Kpi label="Revenue recognised" value={aed(t.revenue, { compact: true })} note={`${projects.length} projects`} />
          <Kpi
            label="Cost"
            value={aed(t.cost, { compact: true })}
            note={t.overhead > 0 ? `Salaries ${aed(t.salaries, { compact: true })} + overhead ${aed(t.overhead, { compact: true })}` : "All salaries, no overhead set"}
          />
          <Kpi label="Margin" value={pct(t.margin)} tone={t.margin !== null && t.margin < 0 ? "neg" : undefined} note="Profit ÷ revenue" />
          <Kpi label="Total hours" value={hours(t.totalHours)} note="Logged by all staff" />
          <Kpi label="Billable hours" value={hours(t.billableHours)} note={`${hours(t.totalHours - t.billableHours)} internal`} />
          <Kpi label="Productivity" value={pct(t.productivity)} note="Billable ÷ total hours" />
        </div>
      </section>

      {t.unallocatedCost > 0 && (
        <div className="callout bad">
          <strong>{aed(t.unallocatedCost)} of cost is unallocated</strong> — a month in this period has salary or overhead but no billable hours to carry it. It is included in total cost but no project bears it. See <Link className="link" href={`/audit${q}`}>Cost audit</Link>.
        </div>
      )}

      <Card
        title={`Revenue and cost by month${period.year ? `, ${period.year}` : ""}`}
        hint={period.month === null ? "Click a month to focus the whole page on it." : "Click the highlighted month again to go back to the full year."}
      >
        <MonthlyChart points={monthlySeries(model, period)} selectedMonth={period.month} />
      </Card>

      <Card
        title="Projects worked in this period"
        hint={losing.length > 0 ? `${losing.length} lost money in this period` : "Sorted by revenue recognised"}
        actions={<Link className="link" href="/projects">Lifetime view →</Link>}
        flush
      >
        <DataTable
          exportName={`projects-${label.replace(/\s+/g, "-").toLowerCase()}`}
          initialSort={{ key: "revenue", dir: "desc" }}
          columns={[
            { key: "name", label: "Project", href: "href", sub: "subline", wrap: true },
            { key: "status", label: "Status" },
            { key: "hours", label: "Hours", kind: "hours" },
            { key: "revenue", label: "Revenue (AED)", kind: "aed", title: "Price × this period's share of the project's hours" },
            { key: "cost", label: "Cost (AED)", kind: "aed", title: "Hours × (direct rate + indirect rate), month by month" },
            { key: "profit", label: "Profit (AED)", kind: "aed", tone: true },
            { key: "margin", label: "Margin", kind: "pct", tone: true },
          ]}
          rows={projects.map((p) => ({
            name: p.name,
            href: `/projects/${encodeURIComponent(p.refCode)}`,
            subline: [p.refCode, p.company, p.price === null ? "no price" : null].filter(Boolean).join(" · "),
            status: p.status ?? (p.listed ? null : "not on price list"),
            hours: p.hours,
            revenue: p.revenue,
            cost: p.cost,
            profit: p.profit,
            margin: p.margin,
          }))}
          footer={{ name: "Total", hours: projects.reduce((a, p) => a + p.hours, 0), revenue: t.revenue, cost: projects.reduce((a, p) => a + p.cost, 0), profit: t.revenue - projects.reduce((a, p) => a + p.cost, 0), margin: null }}
        />
      </Card>

      <div className="grid-3-1">
        <Card title="Departments" hint="Click one to see its people" flush>
          <DataTable
            exportName="departments"
            initialSort={{ key: "totalHours", dir: "desc" }}
            columns={[
              { key: "department", label: "Department", href: "href" },
              { key: "people", label: "People", kind: "int" },
              { key: "totalHours", label: "Hours", kind: "hours" },
              { key: "productivity", label: "Productivity", kind: "meter" },
              { key: "salary", label: "Salary cost (AED)", kind: "aed" },
              { key: "chargedToProjects", label: "Charged to projects (AED)", kind: "aed", title: "Direct + indirect cost on their billable hours" },
            ]}
            rows={depts.map((d) => ({ ...d, href: `/departments/${encodeURIComponent(d.department)}${q}` }))}
          />
        </Card>
        <Card
          title="Data gaps"
          hint={problems.length ? `${problems.length} affecting these figures` : "Nothing affecting these figures"}
          actions={<Link className="link" href="/data">All →</Link>}
          flush
        >
          <IssueList
            issues={problems.slice(0, 6)}
            empty={`Every person with hours has a salary and every billable ref code has a price.${issues.length ? ` ${issues.length} informational notes on the Data page.` : ""}`}
          />
        </Card>
      </div>
    </div>
  );
}
