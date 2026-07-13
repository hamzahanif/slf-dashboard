import { NextResponse } from "next/server";
import { fetchSheet } from "@/lib/sheets";
import { QA_TRACKER, VA_SHEETS } from "@/lib/config";
import { getSessionUser } from "@/lib/auth-server";

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const results: Record<string, unknown> = {};

  try {
    const qaRows = await fetchSheet(QA_TRACKER.spreadsheetId, QA_TRACKER.gid);
    results.qaTracker = {
      rowCount: qaRows.length,
      firstRow: qaRows[0] ?? null,
      columns: qaRows[0] ? Object.keys(qaRows[0]) : [],
    };
  } catch (e) {
    results.qaTrackerError = String(e);
  }

  for (const s of VA_SHEETS) {
    try {
      const rows = await fetchSheet(s.spreadsheetId, s.gid);
      results[s.vaName] = { rowCount: rows.length, firstRow: rows[0] ?? null };
    } catch (e) {
      results[`${s.vaName}_error`] = String(e);
    }
  }

  return NextResponse.json(results);
}
