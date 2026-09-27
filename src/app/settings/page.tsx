import { saveSettings } from "@/app/actions";
import { PageHead } from "@/components/PageHead";
import { Card } from "@/components/ui";
import { getState, type SearchParams } from "@/lib/data";
import { hours } from "@/lib/format";
import { normCategory } from "@/lib/ingest/cells";
import { isBillable } from "@/lib/model/costModel";
import { MONTH_NAMES, monthKey } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const state = getState();
  const { settings } = state;

  // Every category seen in the data, plus any configured one that isn't in the data (yet).
  const hoursByCategory = new Map<string, number>();
  for (const e of state.timesheet) hoursByCategory.set(e.category, (hoursByCategory.get(e.category) ?? 0) + e.hours);
  for (const c of settings.billableCategories) {
    if (![...hoursByCategory.keys()].some((k) => normCategory(k).toLowerCase() === normCategory(c).toLowerCase())) {
      hoursByCategory.set(c, 0);
    }
  }
  const categories = [...hoursByCategory.entries()].sort((a, b) => b[1] - a[1]);

  const years = [...new Set(state.timesheet.map((e) => e.year))].sort();
  const year = Number(sp.year) && years.includes(Number(sp.year)) ? Number(sp.year) : years.at(-1) ?? new Date().getFullYear();

  return (
    <div className="stack">
      <PageHead title="Settings" sub="Assumptions behind every figure. Changes apply everywhere immediately; nothing is recalculated by hand." />

      {sp.saved && <div className="callout good"><strong>Saved.</strong> All pages now use these settings.</div>}

      <form action={saveSettings} className="stack">
        <input type="hidden" name="overrideYear" value={year} />
        <Card title="Billable categories" hint="Hours in these categories are charged to projects; all other hours are internal time and feed the indirect cost pool.">
          <div className="checks">
            {categories.map(([c, h]) => (
              <label key={c}>
                <input type="checkbox" name="billable" value={c} defaultChecked={isBillable(c, settings)} />
                <span>{c}</span>
                <span className="muted">{hours(h)} h</span>
              </label>
            ))}
          </div>
        </Card>

        <Card title="Monthly overhead" hint="Rent, software and other non-salary costs, in AED. Added to each month's indirect cost pool and spread over billable hours.">
          <div className="stack" style={{ gap: 16 }}>
            <div className="field">
              <label htmlFor="overheadMonthly"><strong>Default per month</strong></label>
              <input id="overheadMonthly" name="overheadMonthly" type="number" min={0} step="any" defaultValue={settings.overheadMonthly} style={{ width: 200 }} />
            </div>
            <div className="field">
              <strong>Overrides for {year}</strong>
              <span className="help">Leave blank to use the default. {years.length > 1 && <>Other years: {years.filter((y) => y !== year).map((y) => <a key={y} className="link" href={`/settings?year=${y}`} style={{ marginRight: 8 }}>{y}</a>)}</>}</span>
              <div className="months-grid" style={{ marginTop: 6 }}>
                {MONTH_NAMES.map((name, i) => {
                  const key = monthKey({ year, month: i + 1 });
                  return (
                    <label key={key}>
                      {name}
                      <input type="number" min={0} step="any" name={`override-${key}`} defaultValue={settings.overheadOverrides[key] ?? ""} placeholder={String(settings.overheadMonthly)} />
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        <div>
          <button className="btn btn-primary" type="submit">Save settings</button>
        </div>
      </form>
    </div>
  );
}
