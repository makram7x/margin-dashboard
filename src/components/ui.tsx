import Link from "next/link";
import type { Issue } from "@/lib/model/costModel";
import { loadSampleData } from "@/app/actions";

export function Card({
  title,
  hint,
  actions,
  children,
  flush = false,
}: {
  title?: React.ReactNode;
  hint?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Content runs edge to edge (tables); otherwise padded. */
  flush?: boolean;
}) {
  return (
    <section className="card">
      {(title || hint || actions) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {hint && <div className="hint">{hint}</div>}
          </div>
          {actions}
        </div>
      )}
      {flush ? children : <div className="card-body">{children}</div>}
    </section>
  );
}

export function Kpi({ label, value, note, tone }: { label: string; value: string; note?: React.ReactNode; tone?: "pos" | "neg" }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className={`value ${tone ?? ""}`}>{value}</div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

const ICON: Record<Issue["severity"], string> = { error: "!", warning: "!", info: "i" };

export function IssueList({ issues, empty }: { issues: Issue[]; empty?: string }) {
  if (issues.length === 0) {
    return <p className="muted" style={{ padding: "4px 16px 16px" }}>{empty ?? "No data gaps found."}</p>;
  }
  const order = { error: 0, warning: 1, info: 2 };
  const sorted = [...issues].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <ul className="issues">
      {sorted.map((i, n) => (
        <li key={n} className={`issue ${i.severity}`}>
          <span className="icon" aria-label={i.severity}>{ICON[i.severity]}</span>
          <div>
            <div className="t">
              {i.refCode && i.code !== "no-ref-code" ? (
                <Link className="link" href={`/projects/${encodeURIComponent(i.refCode)}`}>{i.title}</Link>
              ) : (
                i.title
              )}
            </div>
            <div className="d">{i.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Shown on every data page when nothing has been loaded. */
export function NoData() {
  return (
    <section className="card">
      <div className="empty">
        <h2>No data loaded</h2>
        <p>Upload the timesheet, salary overview and project price list, or load the 2025 sample workbooks.</p>
        <div className="actions">
          <form action={loadSampleData}>
            <button className="btn btn-primary" type="submit">Load sample data</button>
          </form>
          <Link className="btn" href="/data">Upload spreadsheets</Link>
        </div>
      </div>
    </section>
  );
}

export function Tone({ value, children }: { value: number | null; children: React.ReactNode }) {
  const cls = value === null ? "" : value < 0 ? "neg" : value > 0 ? "pos" : "";
  return <span className={cls}>{children}</span>;
}
