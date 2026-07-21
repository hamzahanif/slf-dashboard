import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { supabase } from "@/lib/supabase";

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

    const entry = {
      date: fields["Date"] || null,
      va_name: targetVaName,
      shift: fields["Shift"] || null,
      facebook_group_name: fields["Facebook Group Name"] || null,
      direct_facebook_post_url: fields["Direct Facebook Post URL"] || null,
      facility_name: fields["Facility Name"] || null,
      slf_listing_id: fields["SLF Listing ID"] || null,
      media_uploaded: fields["Media Uploaded"] || null,
      comment_left_script_a: fields["Comment Left (Script A)"] || null,
      comment_status: fields["Comment Status"] || null,
      action_type: fields["Action Type"] || null,
      promo_comment: fields["Promo Comment (Script B or C)"] || fields["Promo Comment"] || null,
      wp_post_time: fields["WP- Post time"] || fields["WP Post Time"] || null,
      fb_account: fields["FB Account"] || null,
      handoff_notes: fields["Handoff Notes"] || null,
      status_notes: fields["Status / Notes"] || null,
      source_sheet: targetVaName,
    };

    const { error } = await supabase.from("entries").insert(entry);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[submit]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
