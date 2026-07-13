import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { VA_SHEETS } from "@/lib/config";
import { appendRowToSheet } from "@/lib/google-sheets";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json();
    const { vaName: requestedVaName, ...fields } = body as Record<string, string>;

    let targetVaName: string;
    if (user.role === "admin") {
      if (!requestedVaName) {
        return NextResponse.json({ error: "vaName required for admin submissions" }, { status: 400 });
      }
      targetVaName = requestedVaName;
    } else {
      if (!user.vaName) {
        return NextResponse.json({ error: "VA account has no vaName configured" }, { status: 400 });
      }
      targetVaName = user.vaName;
    }

    const sheet = VA_SHEETS.find(
      s => s.vaName.trim().toLowerCase() === targetVaName.trim().toLowerCase()
    );
    if (!sheet) {
      return NextResponse.json({ error: `No sheet configured for VA: ${targetVaName}` }, { status: 400 });
    }

    const rowData: Record<string, string> = {
      ...fields,
      "VA Name": sheet.vaName,
    };

    await appendRowToSheet(sheet.spreadsheetId, sheet.gid, rowData);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[submit]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
