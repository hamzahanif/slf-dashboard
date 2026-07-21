import type { Row } from "./analytics";

export function dbToRow(e: Record<string, unknown>): Row {
  return {
    _id: String(e.id ?? ""),
    "Date": String(e.date ?? ""),
    "VA Name": String(e.va_name ?? ""),
    "Shift": String(e.shift ?? ""),
    "Facebook Group Name": String(e.facebook_group_name ?? ""),
    "Direct Facebook Post URL": String(e.direct_facebook_post_url ?? ""),
    "Facility Name": String(e.facility_name ?? ""),
    "SLF Listing ID": String(e.slf_listing_id ?? ""),
    "Media Uploaded": String(e.media_uploaded ?? ""),
    "Comment Left (Script A)": String(e.comment_left_script_a ?? ""),
    "Comment Status": String(e.comment_status ?? ""),
    "Action Type": String(e.action_type ?? ""),
    "Promo Comment (Script B or C)": String(e.promo_comment ?? ""),
    "WP- Post time": String(e.wp_post_time ?? ""),
    "FB Account": String(e.fb_account ?? ""),
    "Handoff Notes": String(e.handoff_notes ?? ""),
    "Status / Notes": String(e.status_notes ?? ""),
    "_sourceSheet": String(e.source_sheet ?? ""),
  };
}

// Map display-name fields → Supabase column names for INSERT/UPDATE
export function rowFieldsToDb(fields: Record<string, string>): Record<string, string | null> {
  const map: Record<string, string> = {
    "Date": "date",
    "VA Name": "va_name",
    "Shift": "shift",
    "Facebook Group Name": "facebook_group_name",
    "Direct Facebook Post URL": "direct_facebook_post_url",
    "Facility Name": "facility_name",
    "SLF Listing ID": "slf_listing_id",
    "Media Uploaded": "media_uploaded",
    "Comment Left (Script A)": "comment_left_script_a",
    "Comment Status": "comment_status",
    "Action Type": "action_type",
    "Promo Comment (Script B or C)": "promo_comment",
    "Promo Comment": "promo_comment",
    "WP- Post time": "wp_post_time",
    "WP Post Time": "wp_post_time",
    "FB Account": "fb_account",
    "Handoff Notes": "handoff_notes",
    "Status / Notes": "status_notes",
  };
  const result: Record<string, string | null> = {};
  for (const [display, col] of Object.entries(map)) {
    if (display in fields) {
      result[col] = fields[display] || null;
    }
  }
  return result;
}
