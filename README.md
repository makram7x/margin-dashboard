# Margin — did we make money on that project?

A local dashboard that ingests the agency's three spreadsheets (timesheet, salary overview,
project prices) and answers: which projects made money, who is stuck on non-billable work,
where the time goes, and what an hour really costs once the people who never touch a client
project are paid for.

## Run it

Requires **Node 20 or newer** (developed on 20.9; the dependencies support 22 and 24). No database server, no cloud
account, no API key.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. On first run the three 2025 sample workbooks in `sample-data/` are
loaded automatically, so the dashboard opens populated. They can be reloaded any time from
**Data → Load sample data**.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Unit tests: parsing, re-upload merging, the cost model (39 tests) |
| `npm run selfcheck` | Prints the year's ledger and checks cost = salaries with overhead 0 |
| `npm run selfcheck -- --store` | Same check against whatever is loaded in the app |
| `npm run build && npm start` | Production build |

State lives in `data/store.json` (git-ignored). Delete it to start fresh; it re-seeds on the next
request. Set `MARGIN_DATA_DIR` to keep it elsewhere.

## Self-check

With overhead set to 0, company-wide cost equals total salaries to the dirham:

```
2025
  Salaries            2,400,000.00
  Cost                2,400,000.00
  Cost − salaries         0.000000  ✓ reconciles
```

The **Cost audit** page shows the same reconciliation month by month (with overhead included),
plus every person's direct rate and each month's indirect pool.

## What's where

| Page | Answers |
|---|---|
| **Overview** | Profit, revenue, cost, margin, hours and productivity for a year or month; revenue vs cost by month (click a month to drill in); projects worked in the period; departments; data gaps |
| **Projects** | Lifetime price, cost, profit and margin for every project, worst first |
| **Project page** | Price; cost split direct/indirect; hours and cost by department; month by month; each person's hours, revenue share, cost and profitability |
| **Productivity** | Billable ÷ total hours per person, and each person's biggest non-billable category |
| **Categories** | Hours and salary value per category; the person × category pivot |
| **Departments** | Per department, then per person: hours, salary, internal-time cost, cost charged to projects |
| **Cost audit** | How each month's rates were derived; reconciliation check |
| **Data** | Upload, what's loaded per month, every data gap, upload history, reset |
| **Settings** | Which categories are billable; monthly overhead (default + per-month overrides) |

Every table sorts by column and exports to CSV exactly as shown.

## How the numbers work

Implemented exactly as the brief specifies, per calendar month (`src/lib/model/costModel.ts`):

```
direct rate (person)   = salary ÷ that person's total logged hours
indirect pool          = salaries of people who logged no hours
                       + everyone's non-billable hours × their direct rate
                       + monthly overhead
indirect rate          = indirect pool ÷ billable hours
employee cost          = hours × (direct rate + indirect rate)
revenue share          = project price × (employee hours ÷ total project hours)
employee profitability = (revenue share − employee cost) ÷ revenue share
project profitability  = (project price − total project cost) ÷ project price
productivity           = billable hours ÷ total hours
```

Only billable entries carry cost. Non-billable time is already inside the pool, so charging it
again would double-count; that is why cost reconciles to salaries + overhead.

## Assumptions (where the brief was ambiguous)

**Revenue timing.** A project's price is recognised in proportion to hours: each billable
entry earns `price × entry hours ÷ project lifetime hours`. This is the brief's revenue-share
formula applied per month. Booking the full price in the sales month would make every
monthly view meaningless, because a project sold in January is worked through May. A full year
still sums to the total price.

**In-progress projects.** Margin on the project pages is lifetime, using the brief's formula
`(price − cost) ÷ price`. For projects marked "in progress" it is margin *to date*, and the page
says so. There is no estimate of remaining hours in the data, so revenue recognition treats
hours logged so far as the whole job. If more hours are coming, today's figures overstate the
margin.

**Billable categories.** The default is Projects, Enhancements and Hosting, and it can be
changed in Settings. `Tentwenty` (internal product work) is not in the brief's list and is
treated as internal. Category spelling is normalised (`FC-Leaves` = `FC - Leaves`).

**Joining people.** The salary sheet has an Employee No. column (the brief lists only the
name), so people are joined on employee number. Leading zeros are normalised (`00101` = `101`,
because Excel strips them). If the numbers don't match, the name is used as a fallback, and the
match is flagged.

**Support staff.** Anyone with a salary but no hours in a month goes into that month's pool.
In the sample, the two Management staff do log hours, but only non-billable ones, so their full
salary reaches the pool through the non-billable route instead. The result is the same.

**Data gaps are surfaced, not guessed.** Each gap below is flagged on the Overview, the Data
page and the affected project page:

| Gap | How it's handled |
|---|---|
| Hours but no salary | That person-month is costed at AED 0 direct. |
| Hours on a ref code with no price | Costed, earns no revenue, and appears on the project list as "not on price list". |
| Billable hours with no ref code | Grouped under "(no ref code)". |
| Salaries for a month with no timesheet | That month is left out until its timesheet arrives. |
| A month with no billable hours | Its pool has nothing to spread over. It is kept as "unallocated" cost, so totals still reconcile. |

**Re-uploading.** The three files merge differently:

| File | Merge rule |
|---|---|
| Timesheet | Authoritative for exactly the months it contains. Those months are replaced wholesale, so deleted rows really disappear; other months are untouched. Re-uploading the same file changes nothing. |
| Salaries | Upsert per person per month. Blank or `-` cells leave the existing figure alone, so a partial sheet can't wipe the year. The flip side: a salary can't be cleared by upload. |
| Prices | Upsert per ref code. Projects absent from the file are kept. |

A file that fails validation changes nothing. Each of the three files is processed on its own.

**Messy input.** The parser absorbs the following:

- **Header row:** found by matching column synonyms in the first 25 rows.
- **Empty cells:** `-`, `–`, `n/a` and blanks all count as empty.
- **Months:** `May '25`, `January 2026`, `Jan-25`, `2025-03`, Excel dates and bare `January`. A bare month takes its year from the sheet title, then the upload form, then the filename.
- **Numbers stored as text:** `18,000` and `AED 18,000` are read as numbers.
- **Skipped or kept rows:**
  - Total rows are ignored.
  - Zero-hour rows are skipped.
  - Negative hours are kept as corrections.
  - A row with no month or no employee inherits them from the row above.
- **Warnings:** every skipped or adjusted row is reported with its Excel row number.
- **Identifying files:** each file is recognised by its headers, not its name. A salary sheet dropped in the timesheet slot, or a file that isn't a spreadsheet, is rejected with a message saying so.

**Overhead** is one default monthly figure in AED, with optional per-month overrides.

**Multi-year.** Everything is keyed by year and month, the period filter lists every loaded
year, and "All years" is available. There is no side-by-side comparison view.

## Code layout

```
src/lib/ingest/   cells, dates, header detection, the three sheet parsers  (pure)
src/lib/store/    merge rules for re-uploads (pure) + JSON file persistence
src/lib/model/    costModel.ts (the maths) and metrics.ts (every view's aggregates)  (pure)
src/app/          Next.js pages (server components) and server actions
src/components/   table with sort/CSV, chart, filters
scripts/          selfcheck
tests/            vitest: parsing, merging, cost model incl. a hand-worked example
```

The calculation layer has no UI or I/O dependencies. Pages call `buildCostModel(state)` and
read aggregates from `metrics.ts`, and every figure is a filter-and-sum over costed entries, so
no two pages can disagree.

**Why a JSON file and not SQLite?** A year is about 600 timesheet rows, and the whole model is
rebuilt on every request in milliseconds. `better-sqlite3` needs a native build, which failed
on the first machine it was tried on; that makes it the likeliest thing to break "runs from a
clean checkout". Writes are atomic (temp file + rename) and serialised in-process. If this became
multi-user, the store module is the one place that would change.

**Dependencies:** Next.js 15, React 19, SheetJS (from its official CDN tarball, since the
npm-registry copy is outdated), Vitest 3. Vitest is pinned to 3.x because 4.x needs Node ≥ 20.19.
