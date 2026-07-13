"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Glitch, SummaryStats } from "@/lib/analytics";
import type { SessionPayload } from "@/lib/session";
import LogEntryForm from "./LogEntryForm";

type Tab = "overview" | "performance" | "postcheck" | "qa" | "data" | "logentry";
type Preset = "today" | "yesterday" | "week" | "month" | "custom" | "alltime";

interface DashData {
  summary: SummaryStats;
  glitches: Glitch[];
}

interface Row {
  [key: string]: string;
}

interface VAStat {
  vaName: string;
  count: number;
  rows: Row[];
}

const GLITCH_LABELS: Record<string, string> = {
  duplicate_url: "Duplicate FB URL",
  missing_field: "Missing Field",
  missing_listing_id: "Missing Listing ID",
  missing_wp_post: "Missing WP Post",
  duplicate_listing_id: "Duplicate Listing ID",
};

const GLITCH_COLORS_MAP: Record<string, string> = {
  duplicate_url: "bg-red-100 text-red-700",
  missing_field: "bg-orange-100 text-orange-700",
  missing_listing_id: "bg-yellow-100 text-yellow-700",
  missing_wp_post: "bg-blue-100 text-blue-700",
  duplicate_listing_id: "bg-purple-100 text-purple-700",
};

// Parse gviz Date(yyyy,m,d) or ISO strings
function parseRowDate(val: string): Date | null {
  if (!val) return null;
  const gviz = val.match(/^Date\((\d+),(\d+),(\d+)\)$/);
  if (gviz) return new Date(+gviz[1], +gviz[2], +gviz[3]);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function getPresetRange(preset: Preset, customStart: string, customEnd: string): [Date, Date] | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "alltime") return null;
  if (preset === "today") return [today, today];
  if (preset === "yesterday") {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return [y, y];
  }
  if (preset === "week") return [startOfWeek(today), today];
  if (preset === "month") return [new Date(today.getFullYear(), today.getMonth(), 1), today];
  if (preset === "custom" && customStart && customEnd) {
    return [new Date(customStart), new Date(customEnd)];
  }
  return null;
}

function filterRowsByRange(rows: Row[], range: [Date, Date] | null): Row[] {
  if (!range) return rows;
  const [start, end] = range;
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  return rows.filter(row => {
    const d = parseRowDate(row["Date"]);
    if (!d) return false;
    return d >= start && d < endDay;
  });
}

function buildVAStats(rows: Row[]): VAStat[] {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const name = row["VA Name"]?.trim() || "Unknown";
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(row);
  }
  return Array.from(map.entries())
    .map(([vaName, r]) => ({ vaName, count: r.length, rows: r }))
    .sort((a, b) => b.count - a.count);
}

// ---- Phase 1: Comment Status helpers ----
// Reads the "Comment Status" column gracefully (may not exist on old rows)
type StatusBucket = "approved" | "pending" | "rejected" | "none";

function getStatus(row: Row): StatusBucket {
  const raw = (row["Comment Status"] ?? row["Comment status"] ?? row["Status"] ?? "").toString().trim().toLowerCase();
  if (!raw) return "none";
  if (raw.includes("approv") || raw.includes("live") || raw.includes("pass")) return "approved";
  if (raw.includes("reject") || raw.includes("declin") || raw.includes("fail")) return "rejected";
  if (raw.includes("pend") || raw.includes("wait")) return "pending";
  return "none";
}

interface ApprovalStat {
  approved: number;
  pending: number;
  rejected: number;
  tracked: number; // rows that have any status
  rate: number;    // approved / tracked (0 if none tracked)
}

function computeApproval(rows: Row[]): ApprovalStat {
  let approved = 0, pending = 0, rejected = 0;
  for (const row of rows) {
    const s = getStatus(row);
    if (s === "approved") approved++;
    else if (s === "pending") pending++;
    else if (s === "rejected") rejected++;
  }
  const tracked = approved + pending + rejected;
  return { approved, pending, rejected, tracked, rate: tracked ? Math.round((approved / tracked) * 100) : 0 };
}

// Normalize a FB post URL for duplicate matching (strip query, trailing slash, mobile prefix)
function normalizeUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^(www\.|m\.|web\.)/, "")
    .replace(/\?.*$/, "")
    .replace(/\/$/, "");
}

interface UrlMatch {
  row: Row;
  vaName: string;
  date: string;
  status: StatusBucket;
}

function findUrlMatches(rows: Row[], query: string): UrlMatch[] {
  const q = normalizeUrl(query);
  if (!q) return [];
  return rows
    .filter(r => {
      const u = r["Direct Facebook Post URL"];
      return u && normalizeUrl(u) === q;
    })
    .map(r => ({
      row: r,
      vaName: r["VA Name"]?.trim() || "Unknown",
      date: (() => {
        const d = parseRowDate(r["Date"]);
        return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
      })(),
      status: getStatus(r),
    }));
}

function formatDateLabel(range: [Date, Date] | null, preset: Preset): string {
  if (!range) return "All Time";
  const [start, end] = range;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (preset === "today") return `Today — ${start.toLocaleDateString("en-US", opts)}`;
  if (preset === "yesterday") return `Yesterday — ${start.toLocaleDateString("en-US", opts)}`;
  if (start.toDateString() === end.toDateString()) return start.toLocaleDateString("en-US", opts);
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", opts)}`;
}

export default function DashboardClient({ user }: { user: SessionPayload }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [preset, setPreset] = useState<Preset>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [data, setData] = useState<DashData | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [glitchFilter, setGlitchFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [checkUrl, setCheckUrl] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/data").then(r => r.json()),
      fetch("/api/rows").then(r => r.json()),
    ])
      .then(([d, r]) => { setData(d); setRows(r.rows || []); })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const dateRange = useMemo(
    () => getPresetRange(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );

  const filteredRows = useMemo(() => filterRowsByRange(rows, dateRange), [rows, dateRange]);

  const vaStats = useMemo(() => buildVAStats(filteredRows), [filteredRows]);

  const approval = useMemo(() => computeApproval(filteredRows), [filteredRows]);

  // Post-check always searches ALL rows (not date-filtered) — a dupe from last month still counts
  const urlMatches = useMemo(() => findUrlMatches(rows, checkUrl), [rows, checkUrl]);

  const searchedRows = useMemo(() => {
    if (!search.trim()) return filteredRows;
    const q = search.toLowerCase();
    return filteredRows.filter(r => Object.values(r).some(v => v.toLowerCase().includes(q)));
  }, [filteredRows, search]);

  const glitchTypes = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.glitches.map(g => g.type)));
  }, [data]);

  const filteredGlitches = useMemo(() => {
    if (!data) return [];
    const base = glitchFilter === "all" ? data.glitches : data.glitches.filter(g => g.type === glitchFilter);
    // also apply date range to glitches
    if (!dateRange) return base;
    const [start, end] = dateRange;
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
    return base.filter(g => {
      const d = parseRowDate(g.row["Date"]);
      if (!d) return false;
      return d >= start && d < endDay;
    });
  }, [data, glitchFilter, dateRange]);

  const dateLabel = formatDateLabel(dateRange, preset);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "performance", label: "Performance" },
    { id: "postcheck", label: "Post Check" },
    { id: "qa", label: "QA & Glitches" },
    { id: "data", label: "Raw Data" },
    { id: "logentry", label: "Log Entry" },
  ];

  const presets: { id: Preset; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "week", label: "This Week" },
    { id: "month", label: "This Month" },
    { id: "alltime", label: "All Time" },
    { id: "custom", label: "Custom" },
  ];

  function handlePreset(p: Preset) {
    setPreset(p);
    setShowCustom(p === "custom");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-green-700 text-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
              <span className="text-green-700 font-bold text-sm">SLF</span>
            </div>
            <div>
              <h1 className="font-bold text-lg leading-none">Sober Living Finder</h1>
              <p className="text-green-200 text-xs">VA Performance Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://soberlivingfinder.com" target="_blank" rel="noreferrer"
              className="text-green-200 text-xs hover:text-white transition-colors">
              soberlivingfinder.com ↗
            </a>
            <div className="flex items-center gap-2 border-l border-green-600 pl-4">
              <div className="text-right leading-tight">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-green-200 text-[10px]">{user.title}</p>
              </div>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="text-xs bg-green-800 hover:bg-green-900 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                {loggingOut ? "…" : "Log out"}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Date filter bar — hidden on Log Entry tab */}
      <div className={`bg-white border-b border-slate-200 ${tab === "logentry" ? "hidden" : ""}`}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 font-medium mr-1">Date:</span>
          {presets.map(p => (
            <button key={p.id} onClick={() => handlePreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                preset === p.id
                  ? "bg-green-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}>
              {p.label}
            </button>
          ))}

          {showCustom && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-green-400" />
              <span className="text-slate-400 text-xs">to</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-green-400" />
            </div>
          )}

          <span className="ml-auto text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
            {dateLabel} · <strong>{filteredRows.length}</strong> entries
          </span>
        </div>
      </div>

      {/* Nav tabs */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 flex gap-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}>
              {t.label}
              {t.id === "qa" && data && data.glitches.length > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {filteredGlitches.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-slate-500 text-sm animate-pulse">Loading sheet data…</div>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            Error: {error}
          </div>
        )}

        {/* LOG ENTRY renders immediately — no data dependency */}
        {tab === "logentry" && <LogEntryForm user={user} />}

        {!loading && !error && tab !== "logentry" && (
          <>
            {/* OVERVIEW */}
            {tab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <StatCard label="Total Entries" value={filteredRows.length} color="green" />
                  <StatCard label="VAs Active" value={vaStats.length} color="blue" />
                  <StatCard label="FB Groups" value={new Set(filteredRows.map(r => r["Facebook Group Name"]?.trim()).filter(Boolean)).size} color="purple" />
                  <StatCard label="Total Issues" value={filteredGlitches.length} color="red" />
                  <StatCard label="Missing Fields" value={filteredGlitches.filter(g => g.type === "missing_field").length} color="orange" />
                  <StatCard label="Duplicate URLs" value={filteredGlitches.filter(g => g.type === "duplicate_url").length} color="yellow" />
                </div>

                {/* Comment approval summary */}
                {approval.tracked > 0 ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="font-semibold text-slate-800">Comment Approval — {dateLabel}</h2>
                      <span className="text-2xl font-bold text-green-600">{approval.rate}%</span>
                    </div>
                    <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                      <div className="bg-green-500" style={{ width: `${(approval.approved / approval.tracked) * 100}%` }} />
                      <div className="bg-amber-400" style={{ width: `${(approval.pending / approval.tracked) * 100}%` }} />
                      <div className="bg-red-400" style={{ width: `${(approval.rejected / approval.tracked) * 100}%` }} />
                    </div>
                    <div className="flex gap-5 mt-3 text-xs text-slate-500">
                      <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Approved/Live {approval.approved}</span>
                      <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />Pending {approval.pending}</span>
                      <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />Rejected {approval.rejected}</span>
                      <span className="ml-auto">{approval.tracked} of {filteredRows.length} entries have a status</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
                    💡 Add a <strong>Comment Status</strong> column to your sheet (values: Pending / Approved / Rejected / Live) to unlock approval-rate tracking here.
                  </div>
                )}

                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="font-semibold text-slate-800">VA Performance</h2>
                    <span className="text-xs text-slate-400">{dateLabel}</span>
                  </div>
                  <PerformanceTable stats={vaStats} />
                </div>

                {filteredGlitches.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <h2 className="font-semibold text-slate-800">Recent Issues</h2>
                      <button onClick={() => setTab("qa")} className="text-xs text-green-600 hover:underline">View all →</button>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {filteredGlitches.slice(0, 5).map((g, i) => <GlitchRow key={i} glitch={g} />)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PERFORMANCE */}
            {tab === "performance" && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="font-semibold text-slate-800">Comments Posted per VA</h2>
                    <span className="text-xs text-slate-400">{dateLabel}</span>
                  </div>
                  <PerformanceTable stats={vaStats} detailed />
                </div>

                {/* Per-VA daily breakdown */}
                {vaStats.map(va => (
                  <VADailyBreakdown key={va.vaName} va={va} />
                ))}
              </div>
            )}

            {/* POST CHECK */}
            {tab === "postcheck" && (
              <div className="space-y-4 max-w-3xl">
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h2 className="font-semibold text-slate-800 mb-1">Check Before You Post</h2>
                  <p className="text-sm text-slate-500 mb-4">
                    Paste a Facebook post URL to see if anyone on the team has already commented on it.
                  </p>
                  <input
                    type="text"
                    autoFocus
                    placeholder="https://www.facebook.com/groups/.../posts/..."
                    value={checkUrl}
                    onChange={e => setCheckUrl(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-green-400"
                  />

                  {checkUrl.trim() && (
                    <div className="mt-4">
                      {urlMatches.length === 0 ? (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                          <span className="text-2xl">✅</span>
                          <div>
                            <p className="font-medium text-green-700">Safe to post</p>
                            <p className="text-xs text-green-600">No previous comment found for this URL.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                          <div className="flex items-center gap-3 mb-3">
                            <span className="text-2xl">⚠️</span>
                            <div>
                              <p className="font-medium text-red-700">
                                Already commented ({urlMatches.length} time{urlMatches.length > 1 ? "s" : ""})
                              </p>
                              <p className="text-xs text-red-600">Do not post again — check with the team first.</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {urlMatches.map((m, i) => (
                              <div key={i} className="bg-white rounded-lg px-3 py-2 text-xs flex flex-wrap gap-x-4 gap-y-1 border border-red-100">
                                <span className="font-medium text-slate-700">{m.vaName}</span>
                                <span className="text-slate-500">{m.date}</span>
                                {m.row["Facility Name"] && <span className="text-slate-500">{m.row["Facility Name"]}</span>}
                                {m.row["Facebook Group Name"] && <span className="text-slate-400">{m.row["Facebook Group Name"]}</span>}
                                <StatusPill status={m.status} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500">
                  <strong>How it works:</strong> Matching ignores <code>http/https</code>, <code>www/m.</code> prefixes,
                  query strings, and trailing slashes — so mobile and desktop links to the same post are caught.
                  It searches <strong>all-time</strong> data regardless of the date filter above.
                </div>
              </div>
            )}

            {/* QA */}
            {tab === "qa" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-600 font-medium">Filter:</span>
                  <button onClick={() => setGlitchFilter("all")}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      glitchFilter === "all" ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-600"
                    }`}>
                    All ({filteredGlitches.length})
                  </button>
                  {glitchTypes.map(type => (
                    <button key={type} onClick={() => setGlitchFilter(type)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        glitchFilter === type ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-600"
                      }`}>
                      {GLITCH_LABELS[type] ?? type} ({filteredGlitches.filter(g => g.type === type).length})
                    </button>
                  ))}
                </div>

                {filteredGlitches.length === 0 ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-10 text-center">
                    <div className="text-4xl mb-2">✓</div>
                    <p className="text-green-700 font-medium">No issues found for {dateLabel}</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100">
                      <h2 className="font-semibold text-slate-800">{filteredGlitches.length} issues — {dateLabel}</h2>
                    </div>
                    <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
                      {filteredGlitches.map((g, i) => <GlitchRow key={i} glitch={g} detailed />)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* RAW DATA */}
            {tab === "data" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <input type="text" placeholder="Search rows…" value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:border-green-400" />
                  <span className="text-xs text-slate-400">{searchedRows.length} rows · {dateLabel}</span>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto max-h-[600px]">
                    {searchedRows.length > 0 ? (
                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-50 sticky top-0 z-10">
                          <tr>
                            {Object.keys(searchedRows[0]).map(col => (
                              <th key={col} className="px-3 py-2 text-left text-slate-500 font-medium whitespace-nowrap border-b border-slate-200">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {searchedRows.map((row, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              {Object.values(row).map((val, j) => (
                                <td key={j} className="px-3 py-2 text-slate-700 whitespace-nowrap max-w-[200px] truncate">
                                  {String(val).startsWith("http") ? (
                                    <a href={val} target="_blank" rel="noreferrer" className="text-green-600 hover:underline">{val}</a>
                                  ) : val}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="p-8 text-center text-slate-400 text-sm">No rows for {dateLabel}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    green: "bg-green-50 text-green-700 border-green-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    red: "bg-red-50 text-red-700 border-red-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] ?? colors.blue}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-0.5 opacity-70">{label}</div>
    </div>
  );
}

function PerformanceTable({ stats, detailed }: { stats: VAStat[]; detailed?: boolean }) {
  if (!stats.length) {
    return <div className="p-8 text-center text-slate-400 text-sm">No entries for the selected period.</div>;
  }
  const max = Math.max(...stats.map(s => s.count), 1);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-5 py-3 text-left text-slate-500 font-medium">VA Name</th>
            <th className="px-4 py-3 text-right text-slate-500 font-medium">Comments</th>
            <th className="px-4 py-3 text-right text-slate-500 font-medium">Approval</th>
            {detailed && <th className="px-4 py-3 text-left text-slate-500 font-medium">Dates Active</th>}
            <th className="px-5 py-3 text-left text-slate-500 font-medium w-48">Progress</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {stats.map(s => {
            const dates = detailed
              ? Array.from(new Set(s.rows.map(r => {
                  const d = parseRowDate(r["Date"]);
                  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
                }).filter(Boolean))).sort()
              : [];
            const appr = computeApproval(s.rows);
            return (
              <tr key={s.vaName} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">{s.vaName}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{s.count}</td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {appr.tracked > 0 ? (
                    <span className={appr.rate >= 70 ? "text-green-600" : appr.rate >= 40 ? "text-amber-600" : "text-red-600"}>
                      {appr.rate}%
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                {detailed && (
                  <td className="px-4 py-3 text-xs text-slate-500">{dates.join(", ") || "—"}</td>
                )}
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-100 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${(s.count / max) * 100}%` }} />
                    </div>
                    <span className="text-xs text-slate-400 w-8 text-right">
                      {Math.round((s.count / max) * 100)}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function VADailyBreakdown({ va }: { va: VAStat }) {
  const byDate = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const row of va.rows) {
      const d = parseRowDate(row["Date"]);
      if (!d) continue;
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      if (!map.has(key)) map.set(key, { label, count: 0 });
      map.get(key)!.count++;
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([, v]) => v);
  }, [va.rows]);

  if (!byDate.length) return null;
  const max = Math.max(...byDate.map(d => d.count), 1);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">{va.vaName}</h3>
        <span className="text-xs text-slate-400">{va.count} total</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-2 text-left text-slate-500 font-medium text-xs">Date</th>
              <th className="px-4 py-2 text-right text-slate-500 font-medium text-xs">Comments</th>
              <th className="px-5 py-2 text-left text-slate-500 font-medium text-xs w-48">Volume</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {byDate.map((d, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-5 py-2 text-slate-700">{d.label}</td>
                <td className="px-4 py-2 text-right font-medium text-slate-800">{d.count}</td>
                <td className="px-5 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                      <div className="bg-green-400 h-1.5 rounded-full"
                        style={{ width: `${(d.count / max) * 100}%` }} />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: StatusBucket }) {
  if (status === "none") return null;
  const map: Record<string, string> = {
    approved: "bg-green-100 text-green-700",
    pending: "bg-amber-100 text-amber-700",
    rejected: "bg-red-100 text-red-700",
  };
  const label: Record<string, string> = {
    approved: "Approved/Live",
    pending: "Pending",
    rejected: "Rejected",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${map[status]}`}>
      {label[status]}
    </span>
  );
}

function GlitchRow({ glitch, detailed }: { glitch: Glitch; detailed?: boolean }) {
  const colorClass = GLITCH_COLORS_MAP[glitch.type] ?? "bg-slate-100 text-slate-700";
  return (
    <div className="px-5 py-3 flex items-start gap-3">
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap mt-0.5 ${colorClass}`}>
        {GLITCH_LABELS[glitch.type] ?? glitch.type}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700">{glitch.detail}</p>
        {detailed && (
          <div className="flex gap-4 mt-1 text-xs text-slate-400 flex-wrap">
            <span>Row {glitch.rowIndex}</span>
            {glitch.row["VA Name"] && <span>VA: {glitch.row["VA Name"]}</span>}
            {glitch.row["Date"] && <span>Date: {glitch.row["Date"]}</span>}
            {glitch.row["Facility Name"] && <span>Facility: {glitch.row["Facility Name"]}</span>}
            {glitch.row["Direct Facebook Post URL"] && (
              <a href={glitch.row["Direct Facebook Post URL"]} target="_blank" rel="noreferrer"
                className="text-green-600 hover:underline truncate max-w-[200px]">
                FB Post ↗
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
