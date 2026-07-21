import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { fetchAllEntries } from "@/lib/supabase";
import { dbToRow } from "@/lib/supabase-rows";
import { buildVAStats, detectGlitches, buildSummary } from "@/lib/analytics";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const data = await fetchAllEntries(
      user.role === "va" && user.vaName ? user.vaName : undefined
    );

    const rows = data.map(dbToRow);
    const vaStats = buildVAStats(rows);
    const glitches = detectGlitches(rows);
    const summary = buildSummary(rows, glitches);

    return NextResponse.json({ summary, vaStats, glitches, rowCount: rows.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
