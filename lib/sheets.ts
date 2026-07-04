export interface Row {
  [key: string]: string;
}

export async function fetchSheet(spreadsheetId: string, gid: string): Promise<Row[]> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&gid=${gid}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Failed to fetch gid=${gid}: ${res.status}`);

  const text = await res.text();
  // gviz wraps response: /*O_o*/\ngoogle.visualization.Query.setResponse({...});
  const start = text.indexOf("(") + 1;
  const end = text.lastIndexOf(")");
  const json = JSON.parse(text.slice(start, end));

  const cols: string[] = json.table.cols.map((c: { label: string }) => (c.label || "").trim());
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
