import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== "admin") return NextResponse.json({ error: "Not authorized" }, { status: 403 });

    const { data, error } = await supabase
      .from("qa_reviews")
      .select("*")
      .order("review_date", { ascending: false });

    if (error) throw new Error(error.message);

    // Return as Record<rowKey, review> for easy lookup in the dashboard
    const reviews: Record<string, Record<string, string>> = {};
    for (const r of data ?? []) {
      reviews[r.row_key] = {
        "Row Key": r.row_key,
        "VA Name": r.va_name ?? "",
        "Date": r.date ?? "",
        "FB Post URL": r.fb_post_url ?? "",
        "Facility Name": r.facility_name ?? "",
        "QA Status": r.qa_status ?? "",
        "QA Notes": r.qa_notes ?? "",
        "Reviewed By": r.reviewed_by ?? "",
        "Review Date": r.review_date ?? "",
      };
    }

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

    const today = new Date().toISOString().slice(0, 10);

    const { error } = await supabase
      .from("qa_reviews")
      .upsert({
        row_key: body.rowKey,
        va_name: body.vaName,
        date: body.date || null,
        fb_post_url: body.url ?? null,
        facility_name: body.facilityName ?? null,
        qa_status: body.status,
        qa_notes: body.notes ?? null,
        reviewed_by: user.name,
        review_date: today,
      }, { onConflict: "row_key" });

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[qa-review]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
