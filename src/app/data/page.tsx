import { clearData, loadSampleData } from "@/app/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PageHead } from "@/components/PageHead";
import { UploadForm } from "@/components/UploadForm";
import { Card, IssueList } from "@/components/ui";
import { getState } from "@/lib/data";
import { buildCostModel } from "@/lib/model/costModel";
import { MONTH_NAMES, monthKey } from "@/lib/types";

export const dynamic = "force-dynamic";

const KIND_LABEL = { timesheet: "Timesheet", salaries: "Salaries", prices: "Prices" } as const;

export default function DataPage() {
  const state = getState();
  const model = buildCostModel(state);

  const tsMonths = new Map<string, number>();
  for (const e of state.timesheet) tsMonths.set(monthKey(e), (tsMonths.get(monthKey(e)) ?? 0) + 1);
  const salMonths = new Map<string, number>();
  for (const r of state.salaries) salMonths.set(monthKey(r), (salMonths.get(monthKey(r)) ?? 0) + 1);
  const years = [...new Set([...state.timesheet, ...state.salaries].map((r) => r.year))].sort();

  const order = { error: 0, warning: 1, info: 2 };
  const issues = [...model.issues].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <div className="stack">
      <PageHead
        title="Data"
        sub="Upload any of the three spreadsheets at any time. Each file is recognised by its column headers, checked, and merged without touching data it doesn't cover."
      />

      <Card title="Upload spreadsheets">
        <UploadForm />
      </Card>

      <Card title="What's loaded" hint={`${state.timesheet.length} timesheet rows · ${state.salaries.length} salary figures · ${state.projects.length} priced projects`} flush>
        {years.length === 0 ? (
          <p className="muted" style={{ padding: "0 16px 16px" }}>Nothing yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Sheet</th>
                  {MONTH_NAMES.map((m) => <th key={m} className="r">{m.slice(0, 3)}</th>)}
                </tr>
              </thead>
              <tbody>
                {years.flatMap((y) => [
                  ["Timesheet rows", tsMonths] as const,
                  ["Salary figures", salMonths] as const,
                ].map(([label, map], i) => (
                  <tr key={`${y}-${label}`}>
                    <td>{i === 0 ? <strong>{y}</strong> : ""}</td>
                    <td className="ink2">{label}</td>
                    {MONTH_NAMES.map((_, mi) => {
                      const n = map.get(monthKey({ year: y, month: mi + 1 }));
                      return <td key={mi} className={`r ${n ? "" : "muted"}`}>{n ?? "·"}</td>;
                    })}
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Data gaps" hint="Problems that change the numbers are listed first" flush>
        <IssueList issues={issues} />
      </Card>

      <Card title="Upload history" flush>
        {state.uploads.length === 0 ? (
          <p className="muted" style={{ padding: "0 16px 16px" }}>No uploads yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>When</th><th>File</th><th>Type</th><th>Result</th></tr>
              </thead>
              <tbody>
                {state.uploads.map((u) => (
                  <tr key={u.id}>
                    <td className="ink2">{new Date(u.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td>{u.filename}</td>
                    <td>{KIND_LABEL[u.kind]}</td>
                    <td className="wrap">
                      {u.summary}
                      {u.warnings.length > 0 && <div className="sub">{u.warnings.length} warning{u.warnings.length > 1 ? "s" : ""}: {u.warnings.join(" · ")}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Reset" hint="Sample data is the three 2025 workbooks in sample-data/">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <form action={loadSampleData}>
            <button className="btn" type="submit">Load sample data</button>
          </form>
          <form action={clearData}>
            <ConfirmButton className="btn btn-danger" message="Remove all uploaded timesheets, salaries and prices? Settings are kept.">
              Clear all data
            </ConfirmButton>
          </form>
        </div>
      </Card>
    </div>
  );
}
