import { google } from "googleapis";

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON env var not set");
  const creds = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function resolveSheetName(spreadsheetId: string, gid: string): Promise<string> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });
  const found = res.data.sheets?.find(s => String(s.properties?.sheetId) === gid);
  if (!found) throw new Error(`Sheet with gid=${gid} not found in spreadsheet`);
  return found.properties!.title!;
}

function columnToLetter(n: number): string {
  let s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// Finds a row by VA Name + FB Post URL (or VA Name + Facility Name if URL empty)
// then overwrites only the fields present in `updates`.
export async function findAndUpdateRow(
  spreadsheetId: string,
  gid: string,
  identifiers: { vaName: string; url?: string; facilityName?: string; rawDate?: string },
  updates: Record<string, string>
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sheetName = await resolveSheetName(spreadsheetId, gid);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A:ZZ`,
  });
  const all = res.data.values ?? [];
  if (all.length < 2) throw new Error("Sheet has no data rows");

  const headers = all[0].map(h => String(h).trim());
  const urlIdx = headers.indexOf("Direct Facebook Post URL");
  const vaIdx = headers.indexOf("VA Name");
  const facIdx = headers.indexOf("Facility Name");

  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

  let targetRow = -1;
  for (let i = 1; i < all.length; i++) {
    const row = all[i];
    const vaMatch = norm(row[vaIdx]) === norm(identifiers.vaName);
    if (!vaMatch) continue;

    if (identifiers.url) {
      if (norm(row[urlIdx]) === norm(identifiers.url)) { targetRow = i + 1; break; }
    } else {
      if (norm(row[facIdx]) === norm(identifiers.facilityName)) { targetRow = i + 1; break; }
    }
  }
  if (targetRow === -1) throw new Error("Row not found — it may have moved. Refresh and try again.");

  // Build updated row, preserving existing values for untouched cells
  const existing = all[targetRow - 1] ?? [];
  const newValues = headers.map((h, ci) => (h in updates ? updates[h] : String(existing[ci] ?? "")));

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A${targetRow}:${columnToLetter(headers.length)}${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [newValues] },
  });
}

// Appends one row. rowData keys must match sheet column headers exactly.
export async function appendRowToSheet(
  spreadsheetId: string,
  gid: string,
  rowData: Record<string, string>
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sheetName = await resolveSheetName(spreadsheetId, gid);

  // Read the header row to know column order
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!1:1`,
  });
  const headers = (headerRes.data.values?.[0] ?? []).map(h => String(h).trim());

  const values = headers.map(h => rowData[h] ?? "");

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${sheetName}'!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  });
}
