import { NextResponse } from "next/server";
import { fetchSheet } from "@/lib/sheets";
import { VA_SHEETS, QA_TRACKER } from "@/lib/config";
import { buildVAStats, detectGlitches, buildSummary } from "@/lib/analytics";

export async function GET() {
  try {
    // Fetch QA tracker (always present)
    const qaRows = await fetchSheet(QA_TRACKER.id, QA_TRACKER.sheetName).catch(() => []);

    // Fetch all VA sheets and merge
    const vaRowArrays = await Promise.all(
      VA_SHEETS.map(s => fetchSheet(s.id, s.sheetName).catch(() => []))
    );
    const vaRows = vaRowArrays.flat();

    // Combine all rows for analytics (QA tracker is the source of truth when available)
    const allRows = qaRows.length > 0 ? qaRows : vaRows;

    const vaStats = buildVAStats(allRows);
    const glitches = detectGlitches(allRows);
    const summary = buildSummary(allRows, glitches);

    return NextResponse.json({ summary, vaStats, glitches, rowCount: allRows.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
