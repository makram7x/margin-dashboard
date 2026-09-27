import type { CostModel } from "@/lib/model/costModel";
import type { Period } from "@/lib/model/metrics";
import { PeriodFilter } from "./PeriodFilter";

export function PageHead({
  title,
  sub,
  crumbs,
  model,
  period,
  allowAllTime = true,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  crumbs?: React.ReactNode;
  /** Pass model + period to show the year/month filter. */
  model?: CostModel;
  period?: Period;
  allowAllTime?: boolean;
}) {
  const months = model && period?.year != null ? model.months.filter((m) => m.year === period.year).map((m) => m.month) : [];
  return (
    <div className="page-head">
      <div>
        {crumbs && <div className="crumbs">{crumbs}</div>}
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {model && period && model.years.length > 0 && (
        <PeriodFilter years={model.years} year={period.year} month={period.month} availableMonths={months} allowAllTime={allowAllTime} />
      )}
    </div>
  );
}
