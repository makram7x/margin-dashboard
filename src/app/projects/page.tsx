import { DataTable } from "@/components/DataTable";
import { PageHead } from "@/components/PageHead";
import { Card, Kpi, NoData } from "@/components/ui";
import { getModel } from "@/lib/data";
import { aed, pct } from "@/lib/format";
import { projectDetail } from "@/lib/model/metrics";
import { monthLabel } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Lifetime profitability of every project: the "did we make money on that project?" list. */
export default function ProjectsPage() {
  const model = getModel();
  if (model.months.length === 0) {
    return (
      <>
        <PageHead title="Projects" />
        <NoData />
      </>
    );
  }

  const details = [...model.projects.keys()].map((ref) => projectDetail(model, ref)!);
  const priced = details.filter((d) => d.project.price !== null && d.hours > 0);
  const losing = priced.filter((d) => (d.margin ?? 0) < 0);
  const totalPrice = priced.reduce((a, d) => a + d.project.price!, 0);
  const totalCost = priced.reduce((a, d) => a + d.cost, 0);

  return (
    <div className="stack">
      <PageHead
        title="Projects"
        sub="Lifetime figures across all loaded months. Margin = (price − total cost) ÷ price. For projects still in progress this is margin to date: cost will keep growing as hours are logged."
      />

      <section className="card">
        <div className="kpi-row">
          <Kpi label="Projects with hours" value={String(details.filter((d) => d.hours > 0).length)} note={`${details.length} known in total`} />
          <Kpi label="Contract value" value={aed(totalPrice, { compact: true })} note="Priced projects with hours" />
          <Kpi label="Cost to date" value={aed(totalCost, { compact: true })} />
          <Kpi label="Blended margin" value={pct(totalPrice ? (totalPrice - totalCost) / totalPrice : null)} />
          <Kpi label="Losing money" value={String(losing.length)} tone={losing.length ? "neg" : undefined} note={losing.map((d) => d.project.refCode).join(", ") || "None"} />
        </div>
      </section>

      <Card title="All projects" hint="Click a project for hours by department, monthly cost and each person's contribution" flush>
        <DataTable
          exportName="projects-lifetime"
          initialSort={{ key: "margin", dir: "asc" }}
          columns={[
            { key: "name", label: "Project", href: "href", sub: "subline", wrap: true },
            { key: "category", label: "Type" },
            { key: "status", label: "Status" },
            { key: "span", label: "Worked" },
            { key: "price", label: "Price (AED)", kind: "aed" },
            { key: "hours", label: "Hours", kind: "hours" },
            { key: "cost", label: "Cost (AED)", kind: "aed" },
            { key: "profit", label: "Profit (AED)", kind: "aed", tone: true },
            { key: "margin", label: "Margin", kind: "pct", tone: true },
          ]}
          rows={details.map((d) => {
            const p = d.project;
            const flags = [!p.listed && "not on price list", p.listed && p.price === null && "no price", d.hours === 0 && "no hours yet"].filter(Boolean);
            return {
              name: p.name,
              href: `/projects/${encodeURIComponent(p.refCode)}`,
              subline: [p.refCode, p.company, ...flags].filter(Boolean).join(" · "),
              category: p.category,
              status: p.status,
              span: d.first ? (d.first.year === d.last!.year && d.first.month === d.last!.month ? monthLabel(d.first, true) : `${monthLabel(d.first, true)} – ${monthLabel(d.last!, true)}`) : null,
              price: p.price,
              hours: d.hours,
              cost: d.cost,
              profit: p.price === null ? null : d.profit,
              margin: d.margin,
            };
          })}
        />
      </Card>
    </div>
  );
}
