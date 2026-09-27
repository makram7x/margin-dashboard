import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/DataTable";
import { PageHead } from "@/components/PageHead";
import { Card, IssueList, Kpi } from "@/components/ui";
import { getModel } from "@/lib/data";
import { aed, hours, pct } from "@/lib/format";
import { projectDetail } from "@/lib/model/metrics";
import { monthLabel } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const model = getModel();
  const d = projectDetail(model, decodeURIComponent(ref));
  if (!d) notFound();

  const p = d.project;
  const price = p.price;
  const facts = [
    p.company,
    p.category,
    p.status,
    p.salesPeriod && `sold ${monthLabel(p.salesPeriod)}`,
    d.first && d.last && `worked ${monthLabel(d.first, true)} – ${monthLabel(d.last, true)}`,
  ].filter(Boolean);

  const consumed = price ? d.cost / price : null;

  return (
    <div className="stack">
      <PageHead
        crumbs={<><Link href="/projects">Projects</Link> / {p.refCode}</>}
        title={p.name}
        sub={facts.join(" · ")}
      />

      {price === null && (
        <div className="callout warn">
          <strong>{p.listed ? "This project is on the price list without a price." : "This ref code isn't on the price list."}</strong>{" "}
          Its cost is known ({aed(d.cost)}), but there is no revenue to set against it, so margin can't be calculated. Upload a price list that includes {p.refCode}.
        </div>
      )}
      {p.status?.toLowerCase().includes("progress") && price !== null && (
        <div className="callout">
          <strong>In progress.</strong> These are figures to date: cost will rise as more hours are logged, and revenue is recognised against hours logged so far.
        </div>
      )}

      <section className="card">
        <div className="kpi-row">
          <Kpi label="Price" value={aed(price)} />
          <Kpi label="Cost" value={aed(d.cost)} note={`${aed(d.directCost, { compact: true })} direct + ${aed(d.indirectCost, { compact: true })} indirect`} />
          <Kpi label="Profit" value={price === null ? "—" : aed(d.profit)} tone={price !== null ? (d.profit < 0 ? "neg" : "pos") : undefined} />
          <Kpi label="Margin" value={pct(d.margin)} tone={d.margin !== null && d.margin < 0 ? "neg" : undefined} note="(price − cost) ÷ price" />
          <Kpi label="Hours" value={hours(d.hours)} note={`${d.contributors.length} people · ${d.departments.length} departments`} />
        </div>
        {consumed !== null && (
          <div style={{ padding: "0 18px 16px" }}>
            <div className="sharebar" role="img" aria-label={`Cost is ${pct(consumed)} of price`}>
              <span style={{ width: `${Math.min(1, d.directCost / price!) * 100}%`, background: "var(--series-2)" }} />
              <span style={{ width: `${Math.max(0, Math.min(1, d.cost / price!) - Math.min(1, d.directCost / price!)) * 100}%`, background: "var(--series-2)", opacity: 0.45 }} />
            </div>
            <div className="legend" style={{ marginTop: 8 }}>
              <span><i className="swatch" style={{ background: "var(--series-2)" }} /> Direct cost {pct(d.directCost / price!)}</span>
              <span><i className="swatch" style={{ background: "var(--series-2)", opacity: 0.45 }} /> Indirect cost {pct(d.indirectCost / price!)}</span>
              <span><i className="swatch" style={{ background: "var(--grid)" }} /> {consumed > 1 ? <span className="neg">Over price by {pct(consumed - 1)}</span> : `Margin ${pct(1 - consumed)}`}</span>
            </div>
          </div>
        )}
      </section>

      <div className="grid-2">
        <Card title="Hours by department" flush>
          <DataTable
            exportName={`${p.refCode}-departments`}
            initialSort={{ key: "hours", dir: "desc" }}
            columns={[
              { key: "department", label: "Department" },
              { key: "people", label: "People", kind: "int" },
              { key: "hours", label: "Hours", kind: "hours" },
              { key: "share", label: "Share", kind: "meter" },
              { key: "cost", label: "Cost (AED)", kind: "aed" },
            ]}
            rows={d.departments.map((x) => ({ ...x, share: d.hours ? x.hours / d.hours : null }))}
            footer={{ department: "Total", people: d.contributors.length, hours: d.hours, share: 1, cost: d.cost }}
          />
        </Card>
        <Card title="Month by month" hint="Revenue recognised in proportion to hours" flush>
          <DataTable
            exportName={`${p.refCode}-months`}
            columns={[
              { key: "label", label: "Month" },
              { key: "hours", label: "Hours", kind: "hours" },
              { key: "indirectRate", label: "Indirect rate", kind: "rate", title: "That month's indirect cost per billable hour (AED)" },
              { key: "cost", label: "Cost (AED)", kind: "aed" },
              { key: "revenue", label: "Revenue (AED)", kind: "aed" },
            ]}
            rows={d.months.map((m) => ({ ...m, label: monthLabel(m) }))}
            footer={{ label: "Total", hours: d.hours, cost: d.cost, revenue: d.revenue }}
            emptyMessage="No billable hours logged against this project yet."
          />
        </Card>
      </div>

      <Card
        title="Contribution by person"
        hint="Revenue share = price × (their hours ÷ project hours). Profitability = (revenue share − their cost) ÷ revenue share."
        flush
      >
        <DataTable
          exportName={`${p.refCode}-people`}
          initialSort={{ key: "hours", dir: "desc" }}
          columns={[
            { key: "employeeName", label: "Person", sub: "role", href: "href" },
            { key: "hours", label: "Hours", kind: "hours" },
            { key: "shareOfHours", label: "Share of hours", kind: "meter" },
            { key: "revenueShare", label: "Revenue share (AED)", kind: "aed" },
            { key: "directCost", label: "Direct (AED)", kind: "aed" },
            { key: "indirectCost", label: "Indirect (AED)", kind: "aed" },
            { key: "cost", label: "Cost (AED)", kind: "aed" },
            { key: "profit", label: "Profit (AED)", kind: "aed", tone: true },
            { key: "profitability", label: "Profitability", kind: "pct", tone: true },
          ]}
          rows={d.contributors.map((c) => ({
            ...c,
            role: [c.designation, c.department].filter(Boolean).join(" · "),
            href: `/departments/${encodeURIComponent(c.department)}?year=all`,
            revenueShare: price === null ? null : c.revenueShare,
            profit: price === null ? null : c.profit,
          }))}
          footer={{
            employeeName: "Total",
            hours: d.hours,
            shareOfHours: 1,
            revenueShare: price === null ? null : d.revenue,
            directCost: d.directCost,
            indirectCost: d.indirectCost,
            cost: d.cost,
            profit: price === null ? null : d.revenue - d.cost,
            profitability: price === null ? null : d.margin,
          }}
          emptyMessage="No billable hours logged against this project yet."
        />
      </Card>

      {d.issues.length > 0 && (
        <Card title="Data gaps for this project" flush>
          <IssueList issues={d.issues} />
        </Card>
      )}
    </div>
  );
}
