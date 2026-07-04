export interface Row {
  [key: string]: string;
}

export async function fetchSheet(spreadsheetId: string, gid: string): Promise<Row[]> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&gid=${gid}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Failed to fetch gid=${gid}: ${res.status}`);

  const text = await res.text();
  const jsonStr = text.replace(/^.*?\(/, "").replace(/\);?\s*$/, "");
  const json = JSON.parse(jsonStr);

  const cols: string[] = json.table.cols.map((c: { label: string }) => c.label || "");
  const rows: Row[] = (json.table.rows || []).map((r: { c: Array<{ v: string | null } | null> }) => {
    const row: Row = {};
    cols.forEach((col, i) => {
      const cell = r.c?.[i];
      row[col] = cell?.v?.toString() ?? "";
    });
    return row;
  });

  return rows.filter(r => Object.values(r).some(v => v !== ""));
}
