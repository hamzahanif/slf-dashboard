export interface Row {
  [key: string]: string;
}

// Fetch a public Google Sheet tab as array of row objects keyed by header name
export async function fetchSheet(sheetId: string, sheetName: string): Promise<Row[]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, { next: { revalidate: 300 } }); // cache 5 min
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${sheetName}`);

  const text = await res.text();
  // gviz wraps response in /*O_o*/ google.visualization.Query.setResponse({...});
  const jsonStr = text.replace(/^.*?\(/, "").replace(/\);?\s*$/, "");
  const json = JSON.parse(jsonStr);

  const cols: string[] = json.table.cols.map((c: { label: string }) => c.label || "");
  const rows: Row[] = (json.table.rows || []).map((r: { c: Array<{ v: string | null } | null> }) => {
    const row: Row = {};
    cols.forEach((col, i) => {
      row[col] = r.c?.[i]?.v?.toString() ?? "";
    });
    return row;
  });

  // Skip rows where all values are empty
  return rows.filter(r => Object.values(r).some(v => v !== ""));
}
