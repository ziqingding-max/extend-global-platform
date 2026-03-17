/**
 * CSV Export Utility
 *
 * Provides functions to convert data arrays to CSV format and trigger downloads.
 */

type CsvColumn<T> = {
  header: string;
  accessor: (row: T) => string | number | null | undefined;
};

/**
 * Convert an array of objects to CSV string using column definitions.
 */
export function toCsv<T>(data: T[], columns: CsvColumn<T>[]): string {
  const headers = columns.map((c) => escapeCell(c.header));
  const rows = data.map((row) =>
    columns.map((c) => escapeCell(String(c.accessor(row) ?? ""))).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

/**
 * Escape a CSV cell value (wrap in quotes if it contains commas, quotes, or newlines).
 */
function escapeCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Trigger a file download in the browser.
 */
export function downloadCsv(csvContent: string, filename: string): void {
  // Add BOM for Excel compatibility with UTF-8
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Export data to CSV and download.
 */
export function exportToCsv<T>(
  data: T[],
  columns: CsvColumn<T>[],
  filename: string
): void {
  const csv = toCsv(data, columns);
  downloadCsv(csv, filename);
}
