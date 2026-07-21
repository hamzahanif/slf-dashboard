export interface Row { [key: string]: string; }

export type Period = "daily" | "weekly" | "monthly" | "alltime";

function parseDate(val: string): Date | null {
  if (!val) return null;
  // Handle "Date(year,month,day)" format from gviz
  const gviz = val.match(/^Date\((\d+),(\d+),(\d+)\)$/);
  if (gviz) return new Date(+gviz[1], +gviz[2], +gviz[3]);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function startOf(period: Period): Date {
  const now = new Date();
  if (period === "daily") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === "weekly") {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(now.getFullYear(), now.getMonth(), diff);
  }
  if (period === "monthly") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return new Date(0);
}

function inPeriod(row: Row, dateCol: string, period: Period): boolean {
  const d = parseDate(row[dateCol]);
  if (!d) return false;
  return d >= startOf(period);
}

export interface VAStat {
  vaName: string;
  daily: number;
  weekly: number;
  monthly: number;
  alltime: number;
}

function toTitleCase(s: string) { return s.replace(/\b\w/g, c => c.toUpperCase()); }

export function buildVAStats(rows: Row[], dateCol = "Date", nameCol = "VA Name"): VAStat[] {
  const map = new Map<string, VAStat>();

  for (const row of rows) {
    const raw = row[nameCol]?.trim() || "Unknown";
    const key = raw.toLowerCase();
    if (!map.has(key)) map.set(key, { vaName: toTitleCase(raw), daily: 0, weekly: 0, monthly: 0, alltime: 0 });
    const stat = map.get(key)!;
    stat.alltime++;
    if (inPeriod(row, dateCol, "monthly")) stat.monthly++;
    if (inPeriod(row, dateCol, "weekly")) stat.weekly++;
    if (inPeriod(row, dateCol, "daily")) stat.daily++;
  }

  return Array.from(map.values()).sort((a, b) => b.alltime - a.alltime);
}

export interface Glitch {
  type: "duplicate_url" | "missing_field" | "missing_listing_id" | "missing_wp_post" | "duplicate_listing_id";
  row: Row;
  rowIndex: number;
  detail: string;
}

export function detectGlitches(rows: Row[]): Glitch[] {
  const glitches: Glitch[] = [];
  const urlSeen = new Map<string, number>();
  const listingSeen = new Map<string, number>();

  const requiredFields = ["Date", "VA Name", "Facebook Group Name", "Direct Facebook Post URL", "Facility Name"];

  rows.forEach((row, i) => {
    // Missing required fields
    for (const field of requiredFields) {
      if (!row[field]?.trim()) {
        glitches.push({ type: "missing_field", row, rowIndex: i + 2, detail: `Missing "${field}"` });
      }
    }

    // Missing SLF Listing ID
    const listingId = row["SLF Listing ID"]?.trim() || row["SLF Listing ID "]?.trim();
    if (!listingId) {
      glitches.push({ type: "missing_listing_id", row, rowIndex: i + 2, detail: "No SLF Listing ID" });
    }

    // Missing WP Post time
    const wpPost = row["WP- Post time"]?.trim() || row["WP Post time"]?.trim();
    if (!wpPost) {
      glitches.push({ type: "missing_wp_post", row, rowIndex: i + 2, detail: "No WP Post time" });
    }

    // Duplicate Facebook Post URL
    const url = row["Direct Facebook Post URL"]?.trim();
    if (url) {
      if (urlSeen.has(url)) {
        glitches.push({ type: "duplicate_url", row, rowIndex: i + 2, detail: `Duplicate FB URL (first seen on row ${urlSeen.get(url)})` });
      } else {
        urlSeen.set(url, i + 2);
      }
    }

    // Duplicate SLF Listing ID
    if (listingId) {
      if (listingSeen.has(listingId)) {
        glitches.push({ type: "duplicate_listing_id", row, rowIndex: i + 2, detail: `Duplicate SLF Listing ID (first seen on row ${listingSeen.get(listingId)})` });
      } else {
        listingSeen.set(listingId, i + 2);
      }
    }
  });

  return glitches;
}

export interface SummaryStats {
  totalRows: number;
  uniqueVAs: number;
  uniqueGroups: number;
  totalGlitches: number;
  missingFields: number;
  duplicateUrls: number;
}

export function buildSummary(rows: Row[], glitches: Glitch[]): SummaryStats {
  const vas = new Set(rows.map(r => r["VA Name"]?.trim()).filter(Boolean));
  const groups = new Set(rows.map(r => r["Facebook Group Name"]?.trim()).filter(Boolean));
  return {
    totalRows: rows.length,
    uniqueVAs: vas.size,
    uniqueGroups: groups.size,
    totalGlitches: glitches.length,
    missingFields: glitches.filter(g => g.type === "missing_field").length,
    duplicateUrls: glitches.filter(g => g.type === "duplicate_url").length,
  };
}
