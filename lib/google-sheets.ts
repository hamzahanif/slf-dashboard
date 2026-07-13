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
