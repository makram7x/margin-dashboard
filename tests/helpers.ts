import * as XLSX from "xlsx";

/** Build an .xlsx file in memory from rows of cells, like a user's hand-made sheet. */
export function xlsx(rows: unknown[][], sheetName = "Sheet1"): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

export const TIMESHEET_HEADER = [
  "Month", "Employee No.", "Employee Name", "Type of Expense", "Department", "Designation",
  "Category", "Ref Code", "Project (Billable) / Task (Unbillable) Name",
  "Company Name (Billable)/ Fixed Costs (Unbillable)", "Description", "Hours",
];

/** A timesheet row with sensible defaults. */
export function tsRow(
  month: unknown, no: unknown, name: string, category: string, ref: string, hours: unknown, department = "Design",
): unknown[] {
  return [month, no, name, "DL", department, "Designer", category, ref, ref, "Client", "", hours];
}
