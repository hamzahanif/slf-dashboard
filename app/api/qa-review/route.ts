import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { upsertQARow, fetchQAReviews } from "@/lib/google-sheets";
import { QA_REVIEW_SHEET } from "@/lib/config";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== "admin") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    const reviews = await fetchQAReviews(QA_REVIEW_SHEET.spreadsheetId, QA_REVIEW_SHEET.sheetName);
    return NextResponse.json({ reviews });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== "admin") return NextResponse.json({ error: "Not authorized" }, { status: 403 });

    const body = await req.json() as {
      rowKey: string;
      vaName: string;
      date: string;
      url?: string;
      facilityName?: string;
      status: string;
      notes?: string;
    };

    await upsertQARow(
      QA_REVIEW_SHEET.spreadsheetId,
      QA_REVIEW_SHEET.sheetName,
      body.rowKey,
      {
        "VA Name": body.vaName,
        "Date": body.date,
        "FB Post URL": body.url ?? "",
        "Facility Name": body.facilityName ?? "",
        "QA Status": body.status,
        "QA Notes": body.notes ?? "",
        "Reviewed By": user.name,
        "Review Date": new Date().toLocaleDateString("en-US"),
      }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[qa-review]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
