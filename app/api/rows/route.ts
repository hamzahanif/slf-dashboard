import { NextResponse } from "next/server";
import { fetchSheet } from "@/lib/sheets";
import { VA_SHEETS, QA_TRACKER } from "@/lib/config";

export async function GET() {
  try {
    const qaRows = await fetchSheet(QA_TRACKER.id, QA_TRACKER.sheetName).catch(() => []);
    const vaRowArrays = await Promise.all(
      VA_SHEETS.map(s => fetchSheet(s.id, s.sheetName).catch(() => []))
    );
    const allRows = qaRows.length > 0 ? qaRows : vaRowArrays.flat();
    return NextResponse.json({ rows: allRows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
