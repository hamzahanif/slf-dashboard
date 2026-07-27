import type { Row } from "./dash";

/** Download rows as CSV. Client-side only — touches the DOM. */
export function exportCSV(rows: Row[], filename: string, columns?: string[]) {
  if (!rows.length) return;
  const cols = columns ?? Object.keys(rows[0]).filter(k => !k.startsWith("_"));
  const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.map(escape).join(","), ...rows.map(r => cols.map(c => escape(r[c] ?? "")).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
