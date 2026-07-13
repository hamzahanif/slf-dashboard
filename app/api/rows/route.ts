import { NextResponse } from "next/server";
import { fetchSheet } from "@/lib/sheets";
import { VA_SHEETS, QA_TRACKER } from "@/lib/config";
import { getSessionUser } from "@/lib/auth-server";
import { scopeRowsToUser, mergeAndDeduplicate } from "@/lib/scope";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const qaRows = await fetchSheet(QA_TRACKER.spreadsheetId, QA_TRACKER.gid).catch(() => []);
    const vaRowArrays = await Promise.all(
      VA_SHEETS.map(s => fetchSheet(s.spreadsheetId, s.gid).catch(() => []))
    );
    const vaSheetGids = VA_SHEETS.map(s => ({ gid: s.gid, vaName: s.vaName }));
    const allRows = scopeRowsToUser(mergeAndDeduplicate(qaRows, vaRowArrays.flat(), vaSheetGids, QA_TRACKER.gid), user);
    return NextResponse.json({ rows: allRows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
