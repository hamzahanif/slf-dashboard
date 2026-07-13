import { NextResponse } from "next/server";
import { fetchSheet } from "@/lib/sheets";
import { VA_SHEETS, QA_TRACKER } from "@/lib/config";
import { buildVAStats, detectGlitches, buildSummary } from "@/lib/analytics";
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
    const vaRows = vaRowArrays.flat();

    const allRows = scopeRowsToUser(qaRows.length > 0 ? qaRows : vaRows, user);

    const vaStats = buildVAStats(allRows);
    const glitches = detectGlitches(allRows);
    const summary = buildSummary(allRows, glitches);

    return NextResponse.json({ summary, vaStats, glitches, rowCount: allRows.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
