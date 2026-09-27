"use client";

import { useActionState, useEffect, useState } from "react";
import { uploadFiles, type UploadState } from "@/app/actions";
import type { FileKind } from "@/lib/types";

const SLOTS: { kind: FileKind; title: string; hint: string }[] = [
  { kind: "timesheet", title: "Timesheet", hint: "Replaces only the months the file contains." },
  { kind: "salaries", title: "Salary overview", hint: "Updates each person's figure per month. Blank or '-' cells are left as they were." },
  { kind: "prices", title: "Project prices", hint: "Adds or updates projects by ref code." },
];

export function UploadForm() {
  const [state, action, pending] = useActionState<UploadState | null, FormData>(uploadFiles, null);
  const [chosen, setChosen] = useState<Record<string, string>>({});

  // React resets the (uncontrolled) file inputs after the action; clear our highlight to match.
  useEffect(() => setChosen({}), [state]);

  return (
    <form action={action}>
      <div className="dropzones">
        {SLOTS.map((s) => (
          <label key={s.kind} className={`dropzone${chosen[s.kind] ? " has-file" : ""}`}>
            <span className="dz-title">{s.title}</span>
            <span className="dz-hint">{s.hint}</span>
            <input
              type="file"
              name={s.kind}
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setChosen((c) => ({ ...c, [s.kind]: e.target.files?.[0]?.name ?? "" }))}
            />
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
        <div className="field">
          <label htmlFor="fallbackYear">Year for months written without one</label>
          <input id="fallbackYear" name="fallbackYear" type="number" min={2000} max={2100} placeholder="e.g. 2025" style={{ width: 140 }} />
          <span className="help">Only used for cells like “January”, when neither the sheet title nor the filename names a year.</span>
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending || Object.values(chosen).every((v) => !v)}>
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>

      {state && (
        <div className="card" style={{ marginTop: 16 }} aria-live="polite">
          {state.results.map((r, i) => (
            <div key={i} className="result">
              <div>
                <span className={`tag ${r.ok ? "tag-billable" : "tag-bad"}`}>{r.ok ? "Loaded" : "Rejected"}</span>{" "}
                <strong>{r.filename || "No file"}</strong>
              </div>
              <p className={r.ok ? "ink2" : "neg"} style={{ marginTop: 4 }}>{r.message}</p>
              {r.warnings.length > 0 && (
                <ul>
                  {r.warnings.map((w, j) => <li key={j}>{w}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
