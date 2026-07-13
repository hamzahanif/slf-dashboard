import { NextResponse } from "next/server";
import { fetchSheet } from "@/lib/sheets";
import { VA_SHEETS, QA_TRACKER } from "@/lib/config";
import { getSessionUser } from "@/lib/auth-server";
import { scopeRowsToUser } from "@/lib/scope";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const qaRows = await fetchSheet(QA_TRACKER.spreadsheetId, QA_TRACKER.gid).catch(() => []);
    const vaRowArrays = await Promise.all(
      VA_SHEETS.map(s => fetchSheet(s.spreadsheetId, s.gid).catch(() => []))
    );
    const allRows = scopeRowsToUser(qaRows.length > 0 ? qaRows : vaRowArrays.flat(), user);
    return NextResponse.json({ rows: allRows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
