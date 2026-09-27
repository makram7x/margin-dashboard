# Notes

## What I'd build next

1. **Estimate-to-complete per project.** Revenue is recognised against hours logged so far, so
   an in-progress project looks finished. A budgeted-hours figure per project would give real
   percent-complete recognition and an early "trending over budget" warning, which is the
   question leadership actually wants answered before a project ends.
2. **Column mapping when headers aren't recognised.** Today an unrecognised layout is rejected
   with a list of missing columns. The next step is to let the user map them once and remember
   the mapping.
3. **Upload versions and undo.** Each upload already records what it replaced. Keeping the
   previous rows for those months would make a bad re-upload a one-click revert.
4. **Year-over-year view.** The model is already multi-year. What's missing is a page that puts
   2024 and 2025 side by side.

## What I cut, and why

- **Side-by-side multi-year comparison.** It is stretch scope; the filters and "All years" cover
  the basic need.
- **A database.** A JSON file is plenty for this volume and removes a native build step (see
  the README).
- **Auth, roles and deployment.** The brief asks for a local tool.
- **Browser end-to-end tests.** The tests cover the parts where bugs would cost money: parsing,
  merge semantics and the cost model. I checked the UI flows by hand: wrong-file and
  non-spreadsheet rejection, a messy corrected-month re-upload, overhead reconciliation, and
  the empty state then sample reload.

## What I'm not happy with

- **In-progress revenue** (see "What I'd build next", item 1). It is the biggest source of
  optimism in the numbers, and the UI can only label it, not fix it.
- **Salary upsert ignores blanks.** A salary can't be removed by re-uploading; you'd need to
  clear and reload.
- **Rejected uploads aren't in the upload history.** They're only shown in the result panel.
- **Header matching is heuristic.** It uses synonyms plus scoring. It handles every variation I
  could think of, but a creative enough layout will still need the mapping step above.
- **Display rounding.** Tables round each cell independently, so a column can appear to be off
  by one dirham from its total. The underlying sums are exact.
