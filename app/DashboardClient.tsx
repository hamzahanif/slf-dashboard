"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Glitch, SummaryStats } from "@/lib/analytics";
import type { SessionPayload } from "@/lib/session";
import LogEntryForm from "./LogEntryForm";
import EditRowModal from "./EditRowModal";
import DashboardHome from "./DashboardHome";
import RecordsTable from "./RecordsTable";
import QAReviewTable from "./QAReviewTable";
import {
  Row, vaColor, fmtNum,
  parseRowDate, toYMD, startOfWeek, filterByRange,
  GLITCH_LABELS, GLITCH_PILL, GLITCH_ACCENT,
} from "@/lib/dash";
import { exportCSV } from "@/lib/csv";

type Tab = "dashboard" | "postcheck" | "qa" | "data" | "logentry" | "qareview";
/** Tabs whose own table fills the viewport and scrolls internally, so <main>
 *  must not scroll and must not be given a fixed pixel height anywhere. */
const FULL_HEIGHT_TABS = new Set<Tab>(["data", "qareview"]);
type Preset = "today" | "yesterday" | "week" | "month" | "alltime" | "custom";
interface DashData { summary: SummaryStats; glitches: Glitch[]; }

function getRange(p: Preset, cs: string, ce: string): [Date, Date] | null {
  const now = new Date(), t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === "alltime") return null;
  if (p === "today") return [t, t];
  if (p === "yesterday") { const y = new Date(t); y.setDate(y.getDate() - 1); return [y, y]; }
  if (p === "week") return [startOfWeek(t), t];
  if (p === "month") return [new Date(t.getFullYear(), t.getMonth(), 1), t];
  if (p === "custom") {
    if (!cs && !ce) return null;
    const s = cs ? new Date(cs) : new Date(0);
    const e = ce ? new Date(ce) : new Date();
    return [s, e];
  }
  return null;
}
function fmtRange(r: [Date, Date] | null, p: Preset) {
  if (!r) return "All Time";
  const [s, e] = r, o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (p === "today") return `Today — ${s.toLocaleDateString("en-US", o)}`;
  if (p === "yesterday") return `Yesterday — ${s.toLocaleDateString("en-US", o)}`;
  if (s.toDateString() === e.toDateString()) return s.toLocaleDateString("en-US", o);
  return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", o)}`;
}
type Bucket = "approved" | "pending" | "rejected" | "none";
function getBucket(r: Row): Bucket {
  const v = (r["Comment Status"] ?? "").toLowerCase();
  if (!v) return "none";
  if (v.includes("approv") || v.includes("live") || v.includes("pass")) return "approved";
  if (v.includes("reject") || v.includes("fail")) return "rejected";
  if (v.includes("pend")) return "pending";
  return "none";
}
function normUrl(u: string) {
  return u.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^(www\.|m\.|web\.)/, "").replace(/\?.*$/, "").replace(/\/$/, "");
}
// ── Icons ──────────────────────────────────────────────────────────────────
function Ic({ n, cls = "w-4 h-4" }: { n: string; cls?: string }) {
  const P: Record<string, React.ReactNode> = {
    home: <><path d="M3 12L12 3l9 9"/><rect x="5" y="12" width="5" height="8"/><rect x="14" y="12" width="5" height="8"/></>,
    chart: <><rect x="3" y="12" width="4" height="8" rx="1"/><rect x="10" y="6" width="4" height="14" rx="1"/><rect x="17" y="2" width="4" height="18" rx="1"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></>,
    alert: <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></>,
    table: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></>,
    plus: <><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></>,
    menu: <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    check: <><polyline points="20 6 9 17 4 12"/></>,
    link: <><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    download: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>{P[n]}</svg>;
}

// ── Trend chart ─────────────────────────────────────────────────────────────
function TrendChart({ rows, range }: { rows: Row[]; range: [Date, Date] | null }) {
  const [tip, setTip] = useState<{ xi: number; count: number; label: string } | null>(null);
  const days = useMemo(() => {
    const end = range ? range[1] : new Date();
    const start = range ? range[0] : (() => { const d = new Date(end); d.setDate(d.getDate() - 29); return d; })();
    const n = Math.min(Math.round((end.getTime() - start.getTime()) / 86400000) + 1, 60);
    return Array.from({ length: n }, (_, i) => { const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (n - 1 - i)); return { date: d, ymd: toYMD(d) }; });
  }, [range]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) { const d = parseRowDate(r["Date"]); if (d) { const k = toYMD(d); m.set(k, (m.get(k) ?? 0) + 1); } }
    return days.map(d => ({ ...d, n: m.get(d.ymd) ?? 0 }));
  }, [rows, days]);
  const maxV = Math.max(...counts.map(c => c.n), 1);
  const W = 560, H = 160, PT = 14, PR = 8, PB = 28, PL = 30;
  const cW = W - PL - PR, cH = H - PT - PB;
  const xStep = cW / Math.max(counts.length - 1, 1);
  const pts = counts.map((c, i) => ({ x: PL + i * xStep, y: PT + cH - (c.n / maxV) * cH, ...c }));
  const poly = pts.map(p => `${p.x},${p.y}`).join(" ");
  const area = `M${pts[0].x},${PT + cH} ` + pts.map(p => `L${p.x},${p.y}`).join(" ") + ` L${pts[pts.length - 1].x},${PT + cH}Z`;
  const every = counts.length > 20 ? 7 : counts.length > 10 ? 3 : 1;
  return (
    <div className="relative select-none">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
        <defs>
          <linearGradient id="tGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16a34a" stopOpacity=".18"/>
            <stop offset="100%" stopColor="#16a34a" stopOpacity=".01"/>
          </linearGradient>
          <clipPath id="tClip"><rect x={PL} y={PT} width={cW} height={cH}/></clipPath>
        </defs>
        {[0, .25, .5, .75, 1].map(v => {
          const y = PT + cH * (1 - v);
          return <g key={v}><line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#f1f5f9" strokeWidth="1"/><text x={PL - 5} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">{Math.round(maxV * v)}</text></g>;
        })}
        <path d={area} fill="url(#tGrad)" clipPath="url(#tClip)"/>
        <polyline points={poly} fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" clipPath="url(#tClip)"/>
        {pts.filter((_, i) => i % every === 0 || i === pts.length - 1).map((p, i) => (
          <text key={i} x={p.x} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">{p.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</text>
        ))}
        {pts.map((p, i) => (
          <rect key={i} x={p.x - xStep / 2} y={PT} width={xStep} height={cH} fill="transparent"
            onMouseEnter={() => setTip({ xi: p.x, count: p.n, label: `${p.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${p.n}` })}
            onMouseLeave={() => setTip(null)}/>
        ))}
        {tip && <circle cx={tip.xi} cy={PT + cH - (tip.count / maxV) * cH} r="4" fill="#16a34a" stroke="white" strokeWidth="2"/>}
      </svg>
      {tip && (
        <div className="absolute pointer-events-none bg-slate-800 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap z-10"
          style={{ left: `${(tip.xi / W) * 100}%`, bottom: "28px", transform: "translateX(-50%)" }}>
          {tip.label} entries
        </div>
      )}
    </div>
  );
}

// ── Glitch row ───────────────────────────────────────────────────────────────
// ── QA & Glitches table ─────────────────────────────────────────────────────
// One row per issue, but with enough columns to actually investigate from —
// previously this was Type + one detail line + VA + Facility, which meant
// opening the record just to see the date, listing ID, or which FB group/URL
// was involved. All of that is already on g.row; it just wasn't surfaced.
type GlitchSortKey = "type" | "date" | "va" | "facility" | "listingId" | "group";
const GLITCH_COLS: { key: GlitchSortKey; label: string; w: number }[] = [
  { key: "type", label: "Type", w: 150 },
  { key: "date", label: "Date", w: 100 },
  { key: "va", label: "VA", w: 130 },
  { key: "facility", label: "Facility", w: 220 },
  { key: "listingId", label: "Listing ID", w: 100 },
  { key: "group", label: "FB Group", w: 190 },
];

function glitchSortVal(g: Glitch, key: GlitchSortKey): string {
  switch (key) {
    case "type": return GLITCH_LABELS[g.type] ?? g.type;
    case "date": return g.row["Date"] ?? "";
    case "va": return g.row["VA Name"] ?? "";
    case "facility": return g.row["Facility Name"] ?? "";
    case "listingId": return g.row["SLF Listing ID"] ?? "";
    case "group": return g.row["Facebook Group Name"] ?? "";
  }
}

function GlitchTable({ glitches, onNavigate }: { glitches: Glitch[]; onNavigate: (row: Row) => void }) {
  const [sort, setSort] = useState<{ key: GlitchSortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const toggleSort = (key: GlitchSortKey) =>
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });

  const sorted = useMemo(() => {
    const mul = sort.dir === "asc" ? 1 : -1;
    return [...glitches].sort((a, b) => {
      if (sort.key === "date") {
        const ad = parseRowDate(a.row["Date"]), bd = parseRowDate(b.row["Date"]);
        return mul * ((ad ? +ad : 0) - (bd ? +bd : 0));
      }
      return mul * glitchSortVal(a, sort.key).localeCompare(glitchSortVal(b, sort.key), undefined, { numeric: true, sensitivity: "base" });
    });
  }, [glitches, sort]);

  const exportRows = () => exportCSV(
    sorted.map(g => ({
      Type: GLITCH_LABELS[g.type] ?? g.type,
      Detail: g.detail,
      Date: g.row["Date"] ?? "",
      "VA Name": g.row["VA Name"] ?? "",
      "Facility Name": g.row["Facility Name"] ?? "",
      "SLF Listing ID": g.row["SLF Listing ID"] ?? "",
      "FB Group": g.row["Facebook Group Name"] ?? "",
      "FB Post URL": g.row["Direct Facebook Post URL"] ?? "",
      "WP Post Time": g.row["WP- Post time"] ?? "",
    })),
    `slf-qa-issues-${new Date().toISOString().slice(0, 10)}.csv`,
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-800">{fmtNum(glitches.length)} issues</h2>
          <p className="text-xs text-slate-400 mt-0.5">Click a row to jump to it in Records · click a column header to sort</p>
        </div>
        <button onClick={exportRows}
          className="flex-shrink-0 flex items-center gap-1.5 bg-white border border-slate-200 hover:border-green-400 hover:text-green-700 text-slate-600 text-xs font-medium px-3 py-2 rounded-xl transition-colors">
          Export CSV
        </button>
      </div>
      {/* Viewport-relative, not a fixed height — a tall external monitor
          should show more rows, not more empty space. */}
      <div className="overflow-auto max-h-[65vh]">
        <table className="w-full text-xs border-separate border-spacing-0" style={{ minWidth: "100%" }}>
          <thead>
            <tr className="h-9">
              {GLITCH_COLS.map(c => {
                const on = sort.key === c.key;
                return (
                  <th key={c.key} style={{ width: c.w, minWidth: c.w }}
                    className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 px-3 text-left">
                    <button onClick={() => toggleSort(c.key)}
                      className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${on ? "text-green-700" : "text-slate-400 hover:text-slate-600"}`}>
                      {c.label}
                      {on && <span>{sort.dir === "asc" ? "↑" : "↓"}</span>}
                    </button>
                  </th>
                );
              })}
              <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 px-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">FB Post URL</th>
              <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 px-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Detail</th>
              <th className="sticky top-0 right-0 z-20 bg-slate-50 border-b border-l border-slate-200 px-3" style={{ width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((g, i) => {
              const url = g.row["Direct Facebook Post URL"]?.trim();
              const accent = GLITCH_ACCENT[g.type] ?? "#94a3b8";
              return (
                <tr key={i} onClick={() => onNavigate(g.row)}
                  className="cursor-pointer hover:bg-slate-50/80 transition-colors group/gr bg-white"
                  style={{ boxShadow: `inset 3px 0 0 ${accent}` }}>
                  <td className="border-b border-slate-100 px-3 py-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${GLITCH_PILL[g.type] ?? "bg-slate-100 text-slate-600"}`}>
                      {GLITCH_LABELS[g.type] ?? g.type}
                    </span>
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2 text-slate-600 whitespace-nowrap">
                    {(() => { const d = parseRowDate(g.row["Date"]); return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : <span className="text-slate-300">—</span>; })()}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2 text-slate-700 truncate">
                    {g.row["VA Name"]
                      ? <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: vaColor(g.row["VA Name"]) }} />{g.row["VA Name"]}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2 text-slate-600 truncate" title={g.row["Facility Name"]}>
                    {g.row["Facility Name"]?.trim() || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2 text-slate-600 tabular-nums">
                    {g.row["SLF Listing ID"]?.trim() || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2 text-slate-600 truncate" title={g.row["Facebook Group Name"]}>
                    {g.row["Facebook Group Name"]?.trim() || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2 truncate max-w-[220px]">
                    {url
                      ? <a href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                          className="text-green-600 hover:underline" title={url}>{url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 34)}…</a>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2 text-slate-500 truncate max-w-[260px]" title={g.detail}>{g.detail}</td>
                  <td className="border-b border-slate-100 px-3 py-2 text-right">
                    <span className="text-[10px] text-green-600 font-semibold opacity-0 group-hover/gr:opacity-100 transition-opacity whitespace-nowrap">View →</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── StatusPill ────────────────────────────────────────────────────────────────
function SPill({ s }: { s: Bucket }) {
  const C = { approved: "bg-green-100 text-green-700", pending: "bg-amber-100 text-amber-700", rejected: "bg-red-100 text-red-700", none: "bg-slate-100 text-slate-500" };
  const L = { approved: "Approved", pending: "Pending", rejected: "Rejected", none: "No status" };
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${C[s]}`}>{L[s]}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DashboardClient({ user }: { user: SessionPayload }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [preset, setPreset] = useState<Preset>("alltime");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [data, setData] = useState<DashData | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [glitchFilter, setGlitchFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [checkUrl, setCheckUrl] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);
  // QA review state lives inside QAReviewTable, which loads it on mount.

  function loadData() {
    setLoading(true);
    Promise.all([fetch("/api/data"), fetch("/api/rows")])
      .then(async ([dRes, rRes]) => {
        // A tab left open past the 12h session TTL gets 401s here. Send them to
        // sign in rather than rendering a raw "Not authenticated" error.
        if (dRes.status === 401 || rRes.status === 401) { router.replace("/login"); return; }
        const [d, r] = await Promise.all([dRes.json(), rRes.json()]);
        setData(d); setRows(r.rows || []);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, []);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login"); router.refresh();
  }

  const dateRange = useMemo(() => getRange(preset, customStart, customEnd), [preset, customStart, customEnd]);
  const filteredRows = useMemo(() => filterByRange(rows, dateRange), [rows, dateRange]);
  const urlMatches = useMemo(() => {
    const q = normUrl(checkUrl); if (!q) return [];
    return rows.filter(r => { const u = r["Direct Facebook Post URL"]; return u && normUrl(u) === q; })
      .map(r => ({ row: r, vaName: r["VA Name"]?.trim() || "Unknown", date: (() => { const d = parseRowDate(r["Date"]); return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"; })(), status: getBucket(r) }));
  }, [rows, checkUrl]);
  // Map _id → glitches for O(1) lookup in the Records table
  const glitchMap = useMemo(() => {
    const map = new Map<string, Glitch[]>();
    if (!data) return map;
    for (const g of data.glitches) {
      const id = g.row._id;
      if (!id) continue;
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(g);
    }
    return map;
  }, [data]);

  // Navigate from a glitch to its row in the Records tab
  function goToRecord(row: Row) {
    setHighlightId(row._id);
    setSearch("");
    setShowIssuesOnly(false);
    setTab("data");
  }

  // Scroll to highlighted row after tab switch
  useEffect(() => {
    if (!highlightId || tab !== "data") return;
    const timer = setTimeout(() => {
      document.getElementById("row-" + highlightId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(timer);
  }, [highlightId, tab]);

  const glitchTypes = useMemo(() => data ? Array.from(new Set(data.glitches.map(g => g.type))) : [], [data]);
  const filteredGlitches = useMemo(() => {
    if (!data) return [];
    const base = glitchFilter === "all" ? data.glitches : data.glitches.filter(g => g.type === glitchFilter);
    if (!dateRange) return base;
    const [s, e] = dateRange, ed = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1);
    return base.filter(g => { const d = parseRowDate(g.row["Date"]); return d ? d >= s && d < ed : false; });
  }, [data, glitchFilter, dateRange]);
  const dateLabel = fmtRange(dateRange, preset);

  function navTo(t: Tab) { setTab(t); setSidebarOpen(false); }
  function handlePreset(p: Preset) { setPreset(p); setShowCustom(p === "custom"); }

  const NAV = [
    { id: "dashboard" as Tab, label: "Dashboard", icon: "home" },
    { id: "postcheck" as Tab, label: "Post Check", icon: "search" },
    { id: "qa" as Tab, label: "QA & Glitches", icon: "alert", badge: filteredGlitches.length || undefined },
    { id: "data" as Tab, label: "Records", icon: "table" },
    ...(user.role === "admin" ? [{ id: "qareview" as Tab, label: "QA Review", icon: "shield" }] : []),
    { id: "logentry" as Tab, label: "Log Entry", icon: "plus" },
  ];
  const TAB_TITLE: Record<Tab, string> = {
    dashboard: "Dashboard",
    postcheck: "Post Check", qa: "QA & Glitches", data: "Records",
    qareview: "QA Review", logentry: "Log Entry",
  };
  const PRESETS: { id: Preset; label: string }[] = [
    { id: "today", label: "Today" }, { id: "yesterday", label: "Yesterday" },
    { id: "week", label: "This Week" }, { id: "month", label: "This Month" },
    { id: "alltime", label: "All Time" }, { id: "custom", label: "Custom" },
  ];

  return (
    // h-screen (not min-h-screen) so the shell is exactly the viewport: that is
    // what lets <main> be a bounded scroll container instead of growing the page.
    <div className="h-screen overflow-hidden bg-slate-50 flex">
      {/* Sidebar backdrop */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)}/>}

      {/* ── Sidebar ── */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 flex flex-col transition-transform duration-200 ease-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 h-14 border-b border-slate-800 flex-shrink-0">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center font-black text-white text-xs flex-shrink-0">SLF</div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold leading-tight truncate">Sober Living Finder</p>
            <p className="text-slate-500 text-[10px] leading-tight">VA Dashboard</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-500 hover:text-white p-1"><Ic n="x" cls="w-4 h-4"/></button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-3 mb-2">Navigation</p>
          {NAV.map(item => (
            <button key={item.id} onClick={() => navTo(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === item.id ? "bg-green-600/15 text-green-400" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
              <Ic n={item.icon} cls="w-4 h-4 flex-shrink-0"/>
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge !== undefined && (
                <span className="bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">{item.badge}</span>
              )}
            </button>
          ))}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{user.name.slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium leading-tight truncate">{user.name}</p>
              <p className="text-slate-500 text-[10px]">{user.title}</p>
            </div>
          </div>

          <button onClick={handleLogout} disabled={loggingOut}
            className="flex items-center gap-2 text-slate-500 hover:text-red-400 text-xs transition-colors disabled:opacity-50 w-full mt-2">
            <Ic n="logout" cls="w-3.5 h-3.5"/>{loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>

      {/* ── Main wrapper ── */}
      {/* min-w-0 is load-bearing: a flex item defaults to min-width:auto, which
          would stretch this column to the Records table's full intrinsic width
          and scroll the whole page sideways instead of just the table. */}
      <div className="flex-1 min-w-0 flex flex-col lg:ml-64">

        {/* ── Top bar ── */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 h-14 flex items-center px-4 gap-3 flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
            <Ic n="menu" cls="w-5 h-5"/>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 bg-green-600 rounded-full hidden lg:block"/>
            <h1 className="text-sm font-semibold text-slate-800">{TAB_TITLE[tab]}</h1>
          </div>
          <a href="https://soberlivingfinder.com" target="_blank" rel="noreferrer"
            className="hidden md:flex items-center gap-1 text-xs text-slate-400 hover:text-green-600 transition-colors ml-auto">
            <Ic n="link" cls="w-3 h-3"/> soberlivingfinder.com
          </a>
          <div className="flex items-center gap-2.5 md:ml-0 ml-auto pl-3 border-l border-slate-100">
            <div className="w-7 h-7 rounded-full bg-green-700 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">{user.name.slice(0, 2).toUpperCase()}</div>
            <div className="hidden sm:block">
              <p className="text-xs font-semibold text-slate-700 leading-none">{user.name}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{user.title}</p>
            </div>
          </div>
        </header>

        {/* ── Date filter bar (Dashboard brings its own richer filter bar) ── */}
        {tab !== "logentry" && tab !== "dashboard" && (
          <div className="bg-white border-b border-slate-100 px-4 py-2.5 flex flex-wrap items-center gap-2 flex-shrink-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:block">Period</span>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map(p => (
                <button key={p.id} onClick={() => handlePreset(p.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${preset === p.id ? "bg-green-600 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                  {p.label}
                </button>
              ))}
            </div>
            {showCustom && (
              <div className="flex items-center gap-1">
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-green-400"/>
                <span className="text-slate-300 text-xs">–</span>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-green-400"/>
              </div>
            )}
            <div className="ml-auto flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[11px]">
              <span className="text-slate-500">{dateLabel}</span>
              <span className="text-slate-300">·</span>
              <span className="font-bold text-slate-700">{filteredRows.length.toLocaleString()}</span>
              <span className="text-slate-400">entries</span>
            </div>
          </div>
        )}

        {/* ── Content ── */}
        {/* These tabs own their internal scroll, so the page must not scroll too. */}
        {/* overscroll-contain stops trackpad rubber-band scrolling at the end of
            this list from bleeding through to the page behind it — without it,
            momentum scroll past the last widget briefly reveals blank space. */}
        <main className={`flex-1 min-h-0 min-w-0 p-5 overscroll-contain ${FULL_HEIGHT_TABS.has(tab) ? "overflow-hidden" : "overflow-auto"}`}>

          {tab === "logentry" && <LogEntryForm user={user}/>}

          {tab !== "logentry" && loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin"/>
              <p className="text-sm text-slate-400">Loading data…</p>
            </div>
          )}
          {tab !== "logentry" && error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm">Error: {error}</div>
          )}

          {tab !== "logentry" && !loading && !error && (
            <div className={FULL_HEIGHT_TABS.has(tab) ? "h-full min-h-0" : "space-y-5"}>

              {/* ── DASHBOARD ── */}
              {tab === "dashboard" && <DashboardHome rows={rows} userName={user.name}/>}

              {/* ── POST CHECK ── */}
              {tab === "postcheck" && (
                <div className="max-w-2xl space-y-4">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h2 className="font-bold text-slate-800 text-base mb-1">Check Before You Post</h2>
                    <p className="text-sm text-slate-400 mb-4">Paste a Facebook post URL to check if anyone has already commented on it.</p>
                    <div className="relative">
                      <Ic n="search" cls="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                      <input type="text" autoFocus placeholder="https://www.facebook.com/groups/.../posts/..."
                        value={checkUrl} onChange={e => setCheckUrl(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"/>
                    </div>
                    {checkUrl.trim() && (
                      <div className="mt-4">
                        {urlMatches.length === 0 ? (
                          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0"><Ic n="check" cls="w-5 h-5 text-green-600"/></div>
                            <div><p className="font-semibold text-green-800 text-sm">Safe to post</p><p className="text-xs text-green-600 mt-0.5">No previous comment found.</p></div>
                          </div>
                        ) : (
                          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 text-lg">⚠️</div>
                              <div><p className="font-semibold text-red-800 text-sm">Already commented ({urlMatches.length}×)</p><p className="text-xs text-red-600 mt-0.5">Do not post again.</p></div>
                            </div>
                            <div className="space-y-2">
                              {urlMatches.map((m, i) => (
                                <div key={i} className="bg-white rounded-lg px-3 py-2 text-xs flex flex-wrap gap-x-3 gap-y-1 border border-red-100">
                                  <span className="font-semibold text-slate-700">{m.vaName}</span>
                                  <span className="text-slate-500">{m.date}</span>
                                  {m.row["Facility Name"] && <span className="text-slate-500">{m.row["Facility Name"]}</span>}
                                  <SPill s={m.status}/>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-500 leading-relaxed">
                    <strong className="text-slate-700">How it works:</strong> Matching ignores http/https, www/m. prefixes, query strings, and trailing slashes — so mobile and desktop links to the same post are both caught. Searches <strong>all-time</strong> data regardless of the date filter above.
                  </div>
                </div>
              )}

              {/* ── QA ── */}
              {tab === "qa" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">Filter:</span>
                    {[{ id: "all", label: `All (${filteredGlitches.length})` }, ...glitchTypes.map(t => ({ id: t, label: `${GLITCH_LABELS[t] ?? t} (${filteredGlitches.filter(g => g.type === t).length})` }))].map(item => (
                      <button key={item.id} onClick={() => setGlitchFilter(item.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${glitchFilter === item.id ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                  {filteredGlitches.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-20 flex flex-col items-center gap-3">
                      <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center"><Ic n="check" cls="w-7 h-7 text-green-600"/></div>
                      <p className="font-semibold text-slate-700">No issues found</p>
                      <p className="text-sm text-slate-400">{dateLabel}</p>
                    </div>
                  ) : (
                    <GlitchTable glitches={filteredGlitches} onNavigate={goToRecord} />
                  )}
                </div>
              )}

              {/* ── RECORDS ── */}
              {tab === "data" && (
                <RecordsTable
                  rows={filteredRows}
                  glitchMap={glitchMap}
                  highlightId={highlightId}
                  onEdit={setEditRow}
                  dateLabel={dateLabel}
                  search={search}
                  setSearch={s => { setSearch(s); setHighlightId(null); }}
                  showIssuesOnly={showIssuesOnly}
                  setShowIssuesOnly={v => { setShowIssuesOnly(v); setHighlightId(null); }}
                />
              )}

              {/* ── QA REVIEW (admin only) ── */}
              {tab === "qareview" && user.role === "admin" && (
                <QAReviewTable rows={filteredRows} dateLabel={dateLabel}/>
              )}

            </div>
          )}
        </main>

        {/* ── Footer ── */}
        <footer className="bg-white border-t border-slate-200 flex-shrink-0">
          <div className="px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 bg-green-600 rounded-md flex items-center justify-center text-white text-[9px] font-black">SLF</div>
              <span className="text-xs text-slate-500 font-medium">Sober Living Finder</span>
              <span className="text-slate-200 hidden sm:block">—</span>
              <span className="text-xs text-slate-400 hidden sm:block">VA Performance Dashboard</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <a href="https://soberlivingfinder.com" target="_blank" rel="noreferrer" className="hover:text-green-600 transition-colors flex items-center gap-1">
                <Ic n="link" cls="w-3 h-3"/> soberlivingfinder.com
              </a>
              <span className="text-slate-200">|</span>
              <span>© {new Date().getFullYear()} Sober Living Finder. All rights reserved.</span>
            </div>
          </div>
        </footer>
      </div>

      {editRow && <EditRowModal row={editRow} user={user} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); loadData(); }}/>}
    </div>
  );
}
