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

export function fmtNum(n: number) { return n.toLocaleString(); }
export function pct(part: number, whole: number) { return whole ? Math.round((part / whole) * 100) : 0; }
