import { NextResponse } from "next/server";
import { fetchSheet } from "@/lib/sheets";
import { VA_SHEETS, QA_TRACKER } from "@/lib/config";
import { buildVAStats, detectGlitches, buildSummary } from "@/lib/analytics";

export async function GET() {
  try {
    const qaRows = await fetchSheet(QA_TRACKER.spreadsheetId, QA_TRACKER.gid).catch(() => []);

    const vaRowArrays = await Promise.all(
      VA_SHEETS.map(s => fetchSheet(s.spreadsheetId, s.gid).catch(() => []))
    );
    const vaRows = vaRowArrays.flat();

    const allRows = qaRows.length > 0 ? qaRows : vaRows;

    const vaStats = buildVAStats(allRows);
    const glitches = detectGlitches(allRows);
    const summary = buildSummary(allRows, glitches);

    return NextResponse.json({ summary, vaStats, glitches, rowCount: allRows.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
