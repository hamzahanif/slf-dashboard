import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { google } from "googleapis";
import { VA_SHEETS, QA_TRACKER } from "@/lib/config";

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function fixFilterForSheet(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  sheetId: number,
  sheetTitle: string
) {
  // Count rows so filter covers everything
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetTitle}'!A:A`,
  });
  const rowCount = (res.data.values ?? []).length;

  // Clear existing filter first, then set a new one covering all columns + all rows
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { clearBasicFilter: { sheetId } },
        {
          setBasicFilter: {
            filter: {
              range: {
                sheetId,
                startRowIndex: 0,       // row 1 (header)
                startColumnIndex: 0,
                // no endRowIndex = covers everything; but some versions need explicit:
                endRowIndex: Math.max(rowCount + 500, 2000), // buffer for future rows
              },
            },
          },
        },
      ],
    },
  });

  return { sheetTitle, rowCount };
}

export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    // Resolve sheet titles from gids
    const spreadsheetId = QA_TRACKER.spreadsheetId;
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties",
    });
    const sheetProps = meta.data.sheets ?? [];

    const allSheets = [...VA_SHEETS, QA_TRACKER];
    const results = [];

    for (const cfg of allSheets) {
      const prop = sheetProps.find(s => String(s.properties?.sheetId) === cfg.gid);
      if (!prop?.properties) continue;
      const result = await fixFilterForSheet(
        sheets,
        cfg.spreadsheetId,
        prop.properties.sheetId!,
        prop.properties.title!
      );
      results.push(result);
    }

    return NextResponse.json({ ok: true, fixed: results });
  } catch (err) {
    console.error("[fix-filters]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
