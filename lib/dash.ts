// Shared dashboard primitives — types, VA identity, date + field helpers.
// Kept in one place so DashboardClient and DashboardHome can't drift apart.

export interface Row { [key: string]: string; }

// ── VA identity ───────────────────────────────────────────────────────────────
// Palette validated for CVD: the 4 active hues + inactive grey clear dE>=12 under
// protan/deutan and hit the 8-12 floor under tritan (legal because every chart
// ships a legend + direct labels).
// IMPORTANT: Janine must never render in her violet next to Salman's blue —
// that pair collapses to dE 3.9 under protanopia. vaColor() enforces grey.
export const VA_COLORS: Record<string, string> = {
  "Mico Real": "#16a34a",
  "Muhammad Salman": "#2563eb",
  "Abdul Rehman": "#f59e0b",
  "Fazeela": "#ec4899",
  "Janine": "#8b5cf6",
};
export const INACTIVE_VAS = new Set(["Janine"]);
export const ALL_VAS = Object.keys(VA_COLORS);
export const ACTIVE_VAS = ALL_VAS.filter(v => !INACTIVE_VAS.has(v));
export const ACTIVE_VA_COUNT = ACTIVE_VAS.length;
export const INACTIVE_GREY = "#94a3b8";

export function vaColor(n: string) {
  if (INACTIVE_VAS.has(n)) return INACTIVE_GREY;
  return VA_COLORS[n] ?? "#64748b";
}

/** Canonical VA name for a row — falls back to the source sheet it came from. */
export function vaOf(r: Row): string {
  return r["VA Name"]?.trim() || r["_sourceSheet"]?.trim() || "Unknown";
}

// ── Row predicates (the pipeline definitions used everywhere) ─────────────────
export const hasListing = (r: Row) => !!r["SLF Listing ID"]?.trim();
export const hasWp = (r: Row) => !!r["WP- Post time"]?.trim();
export const isLive = (r: Row) => /live/i.test(r["Handoff Notes"] ?? "");
/** "Accurate" = verified live AND carries a real listing ID. */
export const isAccurate = (r: Row) => isLive(r) && hasListing(r);

// ── Dates ─────────────────────────────────────────────────────────────────────
export function parseRowDate(v: string): Date | null {
  if (!v) return null;
  const g = v.match(/^Date\((\d+),(\d+),(\d+)\)$/);
  if (g) return new Date(+g[1], +g[2], +g[3]);
  // "YYYY-MM-DD" must be read as a LOCAL date, not UTC midnight, or every row
  // shifts a day for anyone east of Greenwich.
  const ymd = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return new Date(+ymd[1], +ymd[2] - 1, +ymd[3]);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Local-calendar YYYY-MM-DD. Never use toISOString() here — it shifts the day. */
export function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function startOfWeek(d: Date) {
  const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

export function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Hour-of-day (0-23) a listing went live on WordPress, or null. */
export function wpHour(r: Row): number | null {
  const t = (r["WP- Post time"] ?? "").trim();
  if (!t) return null;
  const m = t.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let h = +m[1];
  if (/pm/i.test(t) && h < 12) h += 12;
  if (/am/i.test(t) && h === 12) h = 0;
  return h >= 0 && h <= 23 ? h : null;
}

export function filterByRange(rows: Row[], r: [Date, Date] | null) {
  if (!r) return rows;
  const [s, e] = r, ed = addDays(e, 1);
  return rows.filter(row => { const d = parseRowDate(row["Date"]); return d ? d >= s && d < ed : false; });
}

// ── Glitch presentation ───────────────────────────────────────────────────────
export const GLITCH_LABELS: Record<string, string> = {
  duplicate_url: "Duplicate FB URL", missing_field: "Missing Field",
  missing_listing_id: "Missing Listing ID", missing_wp_post: "Missing WP Post",
  duplicate_listing_id: "Duplicate Listing ID",
};
export const GLITCH_PILL: Record<string, string> = {
  duplicate_url: "bg-red-100 text-red-700", missing_field: "bg-orange-100 text-orange-700",
  missing_listing_id: "bg-yellow-100 text-yellow-700", missing_wp_post: "bg-blue-100 text-blue-700",
  duplicate_listing_id: "bg-purple-100 text-purple-700",
};
export const GLITCH_ACCENT: Record<string, string> = {
  duplicate_url: "#ef4444", missing_field: "#f59e0b",
  missing_listing_id: "#f59e0b", missing_wp_post: "#3b82f6",
  duplicate_listing_id: "#a855f7",
};

// ── Controlled vocabulary ─────────────────────────────────────────────────────
// The single source of truth for every categorical column. The entry forms and
// the edit modal both read this, so the options offered can never drift from
// what is actually stored — which is how the DB ended up with 33 spellings of
// Handoff Notes and a Media dropdown offering "Photos/Video/None" against
// Yes/No data.
//
// `default` is the most-used value (share of 6,511 rows at time of writing),
// pre-selected so logging an ordinary entry needs the fewest choices.
export const VOCAB: Record<string, { options: string[]; default: string }> = {
  "Action Type": {
    options: ["New Listing", "Comment", "Duplicate", "Skipped"],
    default: "New Listing",                       // 96%
  },
  "Media Uploaded": {
    options: ["Yes", "No"],
    default: "Yes",                               // 69%
  },
  "Comment Left (Script A)": {
    options: ["Yes", "Yes - pending approval", "No", "Unable to post"],
    default: "Yes",                               // 92%
  },
  "Promo Comment": {
    options: ["No", "Yes"],
    // Consistently 96-100% "No" for every VA, Mico included. A VA once asked
    // for this to default "Yes" because "we can't list without posting a
    // comment" — that's true, but describes Comment Left (Script A) above,
    // which already defaults Yes. Left as-is; flip only on an explicit,
    // confirmed request naming this field specifically.
    default: "No",
  },
  "Comment Status": {
    options: ["Approved", "Pending"],
    // VA feedback: this field is essentially unused (86-100% blank for every
    // VA) but when it IS touched, defaulting to blank meant re-selecting
    // "Approved" on every entry. Pending still shows up occasionally for two
    // VAs (Abdul 2%, Salman <1%) — worth the rare switch, not worth the
    // click on every other entry.
    default: "Approved",
  },
  "Handoff Notes": {
    options: ["Live", "Pending approval", "Comments disabled", "Unable to post", "Declined", "Duplicate"],
    default: "Live",                              // 73%
  },
  "Status / Notes": {
    options: ["Passed", "Live", "Pending", "No comment", "Duplicate", "Retry from another account"],
    default: "",                                  // 82% blank — leave unset
  },
  "Shift": {
    options: ["Morning", "Afternoon", "Evening", "Night"],
    default: "",                                  // resolved per VA below
  },
};

/** Each VA works exactly one shift, so the form can pre-fill it from the name. */
export const VA_SHIFT: Record<string, string> = {
  "Mico Real": "Night",
  "Muhammad Salman": "Morning",
  "Abdul Rehman": "Afternoon",
  "Fazeela": "Evening",
  "Janine": "Evening",
};

/** Media Uploaded's default genuinely varies by VA — not noise, a real
 *  difference in what they find. Mico is 80% "No"; the other three are
 *  78-90% "Yes". A single shared default is wrong for someone no matter
 *  which way it's set, so this overrides VOCAB["Media Uploaded"].default
 *  per VA. Falls back to that shared default (admin, no VA picked yet). */
export const VA_MEDIA_DEFAULT: Record<string, string> = {
  "Mico Real": "No",
  "Muhammad Salman": "Yes",
  "Abdul Rehman": "Yes",
  "Fazeela": "Yes",
};

/** Stable identity for a row across reloads — QA reviews are keyed by this. */
export function rowKey(r: Row): string {
  const url = (r["Direct Facebook Post URL"] ?? "").trim().toLowerCase();
  return [
    (r["Date"] ?? "").trim(),
    (r["VA Name"] ?? "").trim().toLowerCase(),
    url || (r["Facility Name"] ?? "").trim().toLowerCase(),
  ].join("||");
}

/** Deep link to a listing's WordPress edit screen. */
export function wpEditUrl(listingId: string) {
  return `https://soberlivingfinder.com/wp-admin/post.php?post=${encodeURIComponent(listingId.trim())}&action=edit`;
}

export function fmtNum(n: number) { return n.toLocaleString(); }
export function pct(part: number, whole: number) { return whole ? Math.round((part / whole) * 100) : 0; }
