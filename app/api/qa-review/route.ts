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
        // Absent until qa_reviews_add_checks.sql has been run — reads as unchecked.
        "Group Checked": r.group_checked ? "1" : "",
        "Listing Checked": r.listing_checked ? "1" : "",
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
      groupChecked?: boolean;
      listingChecked?: boolean;
    };

    const today = new Date().toISOString().slice(0, 10);

    const base = {
      row_key: body.rowKey,
      va_name: body.vaName,
      date: body.date || null,
      fb_post_url: body.url ?? null,
      facility_name: body.facilityName ?? null,
      qa_status: body.status,
      qa_notes: body.notes ?? null,
      reviewed_by: user.name,
      review_date: today,
    };

    // group_checked / listing_checked only exist once
    // supabase/qa_reviews_add_checks.sql has been run. Try with them, and if
    // the schema doesn't have them yet fall back to the legacy shape rather
    // than failing the whole save — the decision and notes must still persist.
    let checksPersisted = true;
    let { error } = await supabase.from("qa_reviews").upsert(
      { ...base, group_checked: !!body.groupChecked, listing_checked: !!body.listingChecked },
      { onConflict: "row_key" });

    if (error && /group_checked|listing_checked|schema cache|column/i.test(error.message)) {
      checksPersisted = false;
      ({ error } = await supabase.from("qa_reviews").upsert(base, { onConflict: "row_key" }));
    }
    if (error) throw new Error(error.message);

    // Echo back what was stored so the client can show the reviewer
    // immediately instead of only after a reload.
    return NextResponse.json({ ok: true, reviewedBy: user.name, reviewDate: today, checksPersisted });
  } catch (err) {
    console.error("[qa-review]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
