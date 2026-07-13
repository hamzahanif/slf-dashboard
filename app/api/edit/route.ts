import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { VA_SHEETS, QA_TRACKER } from "@/lib/config";
import { findAndUpdateRow } from "@/lib/google-sheets";

export async function PATCH(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json() as {
      sourceGid: string;
      vaName: string;
      url?: string;
      facilityName?: string;
      updates: Record<string, string>;
    };

    const { sourceGid, vaName, url, facilityName, updates } = body;

    if (!sourceGid || !vaName) {
      return NextResponse.json({ error: "sourceGid and vaName are required" }, { status: 400 });
    }

    // VAs may only edit their own rows
    if (user.role === "va" && user.vaName?.toLowerCase() !== vaName.toLowerCase()) {
      return NextResponse.json({ error: "Not authorized to edit another VA's rows" }, { status: 403 });
    }

    // Resolve which sheet to update
    const sheet =
      VA_SHEETS.find(s => s.gid === sourceGid) ??
      (sourceGid === QA_TRACKER.gid ? QA_TRACKER : null);

    if (!sheet) {
      return NextResponse.json({ error: `Unknown source sheet gid: ${sourceGid}` }, { status: 400 });
    }

    await findAndUpdateRow(
      sheet.spreadsheetId,
      sheet.gid,
      { vaName, url, facilityName },
      updates
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[edit]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
