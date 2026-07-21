"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Glitch, SummaryStats } from "@/lib/analytics";
import type { SessionPayload } from "@/lib/session";
import LogEntryForm from "./LogEntryForm";
import EditRowModal from "./EditRowModal";

type Tab = "overview" | "performance" | "postcheck" | "qa" | "data" | "logentry" | "qareview";
type Preset = "today" | "yesterday" | "week" | "month" | "alltime" | "custom";
interface DashData { summary: SummaryStats; glitches: Glitch[]; }
interface Row { [key: string]: string; }
interface VAStat { vaName: string; count: number; rows: Row[]; }

const VA_COLORS: Record<string, string> = {
  "Mico Real": "#16a34a", "Muhammad Salman": "#2563eb",
  "Abdul Rehman": "#f59e0b", "Fazeela": "#ec4899", "Janine": "#8b5cf6",
};
function vaColor(n: string) { return VA_COLORS[n] ?? "#64748b"; }

const GLITCH_LABELS: Record<string, string> = {
  duplicate_url: "Duplicate FB URL", missing_field: "Missing Field",
  missing_listing_id: "Missing Listing ID", missing_wp_post: "Missing WP Post",
  duplicate_listing_id: "Duplicate Listing ID",
};
const GLITCH_PILL: Record<string, string> = {
  duplicate_url: "bg-red-100 text-red-700", missing_field: "bg-orange-100 text-orange-700",
  missing_listing_id: "bg-yellow-100 text-yellow-700", missing_wp_post: "bg-blue-100 text-blue-700",
  duplicate_listing_id: "bg-purple-100 text-purple-700",
};

function parseRowDate(v: string): Date | null {
  if (!v) return null;
  const g = v.match(/^Date\((\d+),(\d+),(\d+)\)$/);
  if (g) return new Date(+g[1], +g[2], +g[3]);
  const d = new Date(v); return isNaN(d.getTime()) ? null : d;
}
function toYMD(d: Date) { return d.toISOString().slice(0, 10); }
function startOfWeek(d: Date) {
  const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}
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
function filterByRange(rows: Row[], r: [Date, Date] | null) {
  if (!r) return rows;
  const [s, e] = r, ed = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1);
  return rows.filter(row => { const d = parseRowDate(row["Date"]); return d ? d >= s && d < ed : false; });
}
function fmtRange(r: [Date, Date] | null, p: Preset) {
  if (!r) return "All Time";
  const [s, e] = r, o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (p === "today") return `Today — ${s.toLocaleDateString("en-US", o)}`;
  if (p === "yesterday") return `Yesterday — ${s.toLocaleDateString("en-US", o)}`;
  if (s.toDateString() === e.toDateString()) return s.toLocaleDateString("en-US", o);
  return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", o)}`;
}
function toTitleCase(s: string) { return s.replace(/\b\w/g, c => c.toUpperCase()); }
function buildStats(rows: Row[]): VAStat[] {
  const m = new Map<string, { display: string; rows: Row[] }>();
  for (const r of rows) {
    const raw = r["VA Name"]?.trim() || "Unknown";
    const key = raw.toLowerCase();
    if (!m.has(key)) m.set(key, { display: toTitleCase(raw), rows: [] });
    m.get(key)!.rows.push(r);
  }
  return Array.from(m.values()).map(({ display, rows: r }) => ({ vaName: display, count: r.length, rows: r })).sort((a, b) => b.count - a.count);
}
type QAStatus = "Pass" | "Fail" | "Duplicate" | "Pending" | "";
type Bucket = "approved" | "pending" | "rejected" | "none";
function getBucket(r: Row): Bucket {
  const v = (r["Comment Status"] ?? "").toLowerCase();
  if (!v) return "none";
  if (v.includes("approv") || v.includes("live") || v.includes("pass")) return "approved";
  if (v.includes("reject") || v.includes("fail")) return "rejected";
  if (v.includes("pend")) return "pending";
  return "none";
}
function computeApproval(rows: Row[]) {
  let a = 0, p = 0, r = 0;
  for (const row of rows) { const b = getBucket(row); if (b === "approved") a++; else if (b === "pending") p++; else if (b === "rejected") r++; }
  const t = a + p + r;
  return { approved: a, pending: p, rejected: r, tracked: t, rate: t ? Math.round((a / t) * 100) : 0 };
}
function normUrl(u: string) {
  return u.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^(www\.|m\.|web\.)/, "").replace(/\?.*$/, "").replace(/\/$/, "");
}
function rowKey(r: Row): string {
  const url = (r["Direct Facebook Post URL"] ?? "").trim().toLowerCase();
  return [(r["Date"] ?? "").trim(), (r["VA Name"] ?? "").trim().toLowerCase(), url || (r["Facility Name"] ?? "").trim().toLowerCase()].join("||");
}
function exportCSV(rows: Row[], filename: string) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]).filter(k => !k.startsWith("_"));
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = [cols.map(escape).join(","), ...rows.map(r => cols.map(c => escape(r[c] ?? "")).join(","))].join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = filename; a.click();
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

// ── VA bar chart ────────────────────────────────────────────────────────────
function VABarChart({ stats }: { stats: VAStat[] }) {
  const [hov, setHov] = useState<string | null>(null);
  const max = Math.max(...stats.map(s => s.count), 1);
  return (
    <div className="space-y-3">
      {stats.map(s => {
        const pct = (s.count / max) * 100, c = vaColor(s.vaName);
        return (
          <div key={s.vaName} onMouseEnter={() => setHov(s.vaName)} onMouseLeave={() => setHov(null)}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-700 flex items-center gap-2">
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: c }}/>
                {s.vaName}
              </span>
              <span className="text-xs font-bold tabular-nums" style={{ color: c }}>{s.count}</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: c, opacity: hov === s.vaName ? 1 : 0.7 }}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Donut chart ─────────────────────────────────────────────────────────────
function DonutChart({ approved, pending, rejected, total }: { approved: number; pending: number; rejected: number; total: number }) {
  const none = Math.max(total - approved - pending - rejected, 0);
  const segments = [
    { label: "Approved/Live", v: approved, c: "#16a34a" },
    { label: "Pending", v: pending, c: "#f59e0b" },
    { label: "Rejected", v: rejected, c: "#ef4444" },
    { label: "No Status", v: none, c: "#e2e8f0" },
  ].filter(d => d.v > 0);
  const R = 52, r = 33, cx = 68, cy = 68;
  let ang = -Math.PI / 2;
  const slices = segments.map(d => {
    const sw = (d.v / total) * 2 * Math.PI;
    const x1 = cx + R * Math.cos(ang), y1 = cy + R * Math.sin(ang);
    ang += sw;
    const x2 = cx + R * Math.cos(ang), y2 = cy + R * Math.sin(ang);
    const xi1 = cx + r * Math.cos(ang - sw), yi1 = cy + r * Math.sin(ang - sw);
    const xi2 = cx + r * Math.cos(ang), yi2 = cy + r * Math.sin(ang);
    const lg = sw > Math.PI ? 1 : 0;
    return { ...d, path: `M${x1} ${y1}A${R} ${R} 0 ${lg} 1 ${x2} ${y2}L${xi2} ${yi2}A${r} ${r} 0 ${lg} 0 ${xi1} ${yi1}Z`, pct: Math.round((d.v / total) * 100) };
  });
  const rate = total > 0 ? Math.round((approved / total) * 100) : 0;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 136 136" className="w-24 h-24 flex-shrink-0">
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.c} stroke="white" strokeWidth="2"/>)}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="19" fontWeight="800" fill="#0f172a">{rate}%</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9" fill="#64748b">approval</text>
      </svg>
      <div className="space-y-2 flex-1">
        {slices.map(s => (
          <div key={s.label} className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.c }}/>{s.label}
            </span>
            <span className="text-xs font-semibold text-slate-700 tabular-nums">{s.v} <span className="font-normal text-slate-400">({s.pct}%)</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow">
      <div className="text-2xl font-black tabular-nums leading-none" style={{ color: accent }}>{value.toLocaleString()}</div>
      <div className="text-xs text-slate-500 mt-1.5 leading-tight">{label}</div>
    </div>
  );
}

// ── Performance table ───────────────────────────────────────────────────────
function PerfTable({ stats, detailed }: { stats: VAStat[]; detailed?: boolean }) {
  if (!stats.length) return <div className="py-14 text-center text-slate-400 text-sm">No entries for the selected period.</div>;
  const max = Math.max(...stats.map(s => s.count), 1);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100">
          <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">VA Name</th>
          <th className="text-right px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Entries</th>
          {detailed && <th className="text-right px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Approval</th>}
          <th className="px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Share</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {stats.map(s => {
          const pct = (s.count / max) * 100, c = vaColor(s.vaName);
          const appr = detailed ? computeApproval(s.rows) : null;
          return (
            <tr key={s.vaName} className="hover:bg-slate-50/60 transition-colors">
              <td className="px-5 py-3">
                <span className="flex items-center gap-2.5 font-medium text-slate-800">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: c }}/>{s.vaName}
                </span>
              </td>
              <td className="px-5 py-3 text-right font-bold tabular-nums" style={{ color: c }}>{s.count.toLocaleString()}</td>
              {detailed && (
                <td className="px-5 py-3 text-right">
                  {appr && appr.tracked > 0
                    ? <span className={`text-xs font-bold ${appr.rate >= 70 ? "text-green-600" : appr.rate >= 40 ? "text-amber-600" : "text-red-500"}`}>{appr.rate}%</span>
                    : <span className="text-slate-300 text-xs">—</span>}
                </td>
              )}
              <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c }}/>
                  </div>
                  <span className="text-[10px] text-slate-400 w-7 text-right tabular-nums">{Math.round(pct)}%</span>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Glitch row ───────────────────────────────────────────────────────────────
function GlitchRow({ g, detail }: { g: Glitch; detail?: boolean }) {
  return (
    <div className="px-5 py-3 flex flex-wrap items-start gap-3 hover:bg-slate-50/60">
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${GLITCH_PILL[g.type] ?? "bg-slate-100 text-slate-600"}`}>
        {GLITCH_LABELS[g.type] ?? g.type}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-600 truncate">{g.detail}</p>
        {detail && (
          <div className="flex flex-wrap gap-3 mt-0.5">
            {g.row["VA Name"] && <span className="text-[10px] text-slate-400">{g.row["VA Name"]}</span>}
            {g.row["Facility Name"] && <span className="text-[10px] text-slate-400 truncate max-w-[180px]">{g.row["Facility Name"]}</span>}
          </div>
        )}
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

// ── VA daily breakdown ────────────────────────────────────────────────────────
function VADailyBreakdown({ va }: { va: VAStat }) {
  const c = vaColor(va.vaName);
  const byDay = new Map<string, number>();
  for (const r of va.rows) { const d = parseRowDate(r["Date"]); if (d) { const k = toYMD(d); byDay.set(k, (byDay.get(k) ?? 0) + 1); } }
  const sorted = Array.from(byDay.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10);
  if (!sorted.length) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: c }}/>
        <h3 className="font-semibold text-slate-800 text-sm">{va.vaName}</h3>
        <span className="ml-auto text-xs text-slate-400">{va.count.toLocaleString()} total</span>
      </div>
      <div className="px-5 py-4 flex flex-wrap gap-2">
        {sorted.map(([ymd, n]) => (
          <div key={ymd} className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5">
            <span className="text-slate-400">{new Date(ymd + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            <span className="font-bold" style={{ color: c }}>{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}



// ── Main component ────────────────────────────────────────────────────────────
export default function DashboardClient({ user }: { user: SessionPayload }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
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
  const [qaReviews, setQAReviews] = useState<Record<string, Record<string, string>>>({});
  const [qaLoading, setQALoading] = useState(false);
  const [qaFilter, setQAFilter] = useState<QAStatus | "all">("all");
  const [qaVAFilter, setQAVAFilter] = useState("all");
  const [qaSaving, setQASaving] = useState<string | null>(null);
  const [qaSearch, setQASearch] = useState("");

  function loadQAReviews() {
    setQALoading(true);
    fetch("/api/qa-review").then(r => r.json()).then(d => setQAReviews(d.reviews ?? {})).finally(() => setQALoading(false));
  }

  function loadData() {
    setLoading(true);
    Promise.all([fetch("/api/data").then(r => r.json()), fetch("/api/rows").then(r => r.json())])
      .then(([d, r]) => { setData(d); setRows(r.rows || []); })
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
  const vaStats = useMemo(() => buildStats(filteredRows), [filteredRows]);
  const approval = useMemo(() => computeApproval(filteredRows), [filteredRows]);
  const urlMatches = useMemo(() => {
    const q = normUrl(checkUrl); if (!q) return [];
    return rows.filter(r => { const u = r["Direct Facebook Post URL"]; return u && normUrl(u) === q; })
      .map(r => ({ row: r, vaName: r["VA Name"]?.trim() || "Unknown", date: (() => { const d = parseRowDate(r["Date"]); return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"; })(), status: getBucket(r) }));
  }, [rows, checkUrl]);
  const searchedRows = useMemo(() => {
    if (!search.trim()) return filteredRows;
    const q = search.toLowerCase();
    return filteredRows.filter(r => Object.values(r).some(v => v.toLowerCase().includes(q)));
  }, [filteredRows, search]);
  const glitchTypes = useMemo(() => data ? Array.from(new Set(data.glitches.map(g => g.type))) : [], [data]);
  const filteredGlitches = useMemo(() => {
    if (!data) return [];
    const base = glitchFilter === "all" ? data.glitches : data.glitches.filter(g => g.type === glitchFilter);
    if (!dateRange) return base;
    const [s, e] = dateRange, ed = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1);
    return base.filter(g => { const d = parseRowDate(g.row["Date"]); return d ? d >= s && d < ed : false; });
  }, [data, glitchFilter, dateRange]);
  const dateLabel = fmtRange(dateRange, preset);

  function navTo(t: Tab) { setTab(t); setSidebarOpen(false); if (t === "qareview") loadQAReviews(); }
  function handlePreset(p: Preset) { setPreset(p); setShowCustom(p === "custom"); }

  const NAV = [
    { id: "overview" as Tab, label: "Overview", icon: "home" },
    { id: "performance" as Tab, label: "Performance", icon: "chart" },
    { id: "postcheck" as Tab, label: "Post Check", icon: "search" },
    { id: "qa" as Tab, label: "QA & Glitches", icon: "alert", badge: filteredGlitches.length || undefined },
    { id: "data" as Tab, label: "Records", icon: "table" },
    ...(user.role === "admin" ? [{ id: "qareview" as Tab, label: "QA Review", icon: "shield" }] : []),
    { id: "logentry" as Tab, label: "Log Entry", icon: "plus" },
  ];
  const TAB_TITLE: Record<Tab, string> = {
    overview: "Dashboard Overview", performance: "VA Performance",
    postcheck: "Post Check", qa: "QA & Glitches", data: "Records",
    qareview: "QA Review", logentry: "Log Entry",
  };
  const PRESETS: { id: Preset; label: string }[] = [
    { id: "today", label: "Today" }, { id: "yesterday", label: "Yesterday" },
    { id: "week", label: "This Week" }, { id: "month", label: "This Month" },
    { id: "alltime", label: "All Time" }, { id: "custom", label: "Custom" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
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
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64">

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

        {/* ── Date filter bar ── */}
        {tab !== "logentry" && (
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
        <main className="flex-1 p-5 overflow-auto">

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
            <div className="space-y-5">

              {/* ── OVERVIEW ── */}
              {tab === "overview" && <>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  <KpiCard label="Total Entries" value={filteredRows.length} accent="#16a34a"/>
                  <KpiCard label="VAs Active" value={vaStats.length} accent="#2563eb"/>
                  <KpiCard label="FB Groups" value={new Set(filteredRows.map(r => r["Facebook Group Name"]?.trim()).filter(Boolean)).size} accent="#8b5cf6"/>
                  <KpiCard label="Total Issues" value={filteredGlitches.length} accent="#ef4444"/>
                  <KpiCard label="Missing Fields" value={filteredGlitches.filter(g => g.type === "missing_field").length} accent="#f59e0b"/>
                  <KpiCard label="Duplicate URLs" value={filteredGlitches.filter(g => g.type === "duplicate_url").length} accent="#ec4899"/>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div><h2 className="font-bold text-slate-800">Daily Activity</h2><p className="text-xs text-slate-400 mt-0.5">Entries submitted per day</p></div>
                      <span className="text-[11px] text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1">{dateLabel}</span>
                    </div>
                    {filteredRows.length > 0 ? <TrendChart rows={filteredRows} range={dateRange}/> : <div className="h-36 flex items-center justify-center text-slate-300 text-sm">No data for this period</div>}
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="mb-4"><h2 className="font-bold text-slate-800">VA Comparison</h2><p className="text-xs text-slate-400 mt-0.5">Entries by team member</p></div>
                    {vaStats.length > 0 ? <VABarChart stats={vaStats}/> : <div className="text-slate-300 text-sm text-center py-8">No data</div>}
                  </div>
                </div>

                {approval.tracked > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="mb-4"><h2 className="font-bold text-slate-800">Comment Approval</h2><p className="text-xs text-slate-400 mt-0.5">Status breakdown · {dateLabel}</p></div>
                    <DonutChart approved={approval.approved} pending={approval.pending} rejected={approval.rejected} total={filteredRows.length}/>
                  </div>
                )}

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div><h2 className="font-bold text-slate-800">Team Performance</h2><p className="text-xs text-slate-400 mt-0.5">{dateLabel}</p></div>
                  </div>
                  <PerfTable stats={vaStats}/>
                </div>

                {filteredGlitches.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <div><h2 className="font-bold text-slate-800">Recent Issues</h2><p className="text-xs text-slate-400 mt-0.5">{filteredGlitches.length} detected</p></div>
                      <button onClick={() => setTab("qa")} className="text-xs font-semibold text-green-600 hover:text-green-700">View all →</button>
                    </div>
                    <div className="divide-y divide-slate-50">{filteredGlitches.slice(0, 5).map((g, i) => <GlitchRow key={i} g={g}/>)}</div>
                  </div>
                )}

                {approval.tracked === 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-700">
                    💡 Add a <strong>Comment Status</strong> column to your sheet (values: Pending / Approved / Rejected / Live) to unlock approval-rate tracking.
                  </div>
                )}
              </>}

              {/* ── PERFORMANCE ── */}
              {tab === "performance" && <>
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="mb-4"><h2 className="font-bold text-slate-800">Daily Activity Trend</h2><p className="text-xs text-slate-400 mt-0.5">{dateLabel}</p></div>
                    {filteredRows.length > 0 ? <TrendChart rows={filteredRows} range={dateRange}/> : <div className="h-36 flex items-center justify-center text-slate-300 text-sm">No data</div>}
                  </div>
                  <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="mb-4"><h2 className="font-bold text-slate-800">Entries by VA</h2><p className="text-xs text-slate-400 mt-0.5">{dateLabel}</p></div>
                    {vaStats.length > 0 ? <VABarChart stats={vaStats}/> : <div className="text-slate-300 text-sm text-center py-8">No data</div>}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100"><h2 className="font-bold text-slate-800">Detailed Breakdown</h2></div>
                  <PerfTable stats={vaStats} detailed/>
                </div>
                {vaStats.map(va => <VADailyBreakdown key={va.vaName} va={va}/>)}
              </>}

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
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-100">
                        <h2 className="font-bold text-slate-800">{filteredGlitches.length} issues</h2>
                        <p className="text-xs text-slate-400 mt-0.5">{dateLabel}</p>
                      </div>
                      <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
                        {filteredGlitches.map((g, i) => <GlitchRow key={i} g={g} detail/>)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── RECORDS ── */}
              {tab === "data" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative">
                      <Ic n="search" cls="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                      <input type="text" placeholder="Search records…" value={search} onChange={e => setSearch(e.target.value)}
                        className="bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm w-72 focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"/>
                    </div>
                    <span className="text-xs text-slate-400">{searchedRows.length.toLocaleString()} records · {dateLabel}</span>
                    <button onClick={() => exportCSV(searchedRows, `slf-records-${new Date().toISOString().slice(0,10)}.csv`)}
                      className="ml-auto flex items-center gap-1.5 bg-white border border-slate-200 hover:border-green-400 hover:text-green-700 text-slate-600 text-xs font-medium px-3 py-2 rounded-xl transition-colors">
                      <Ic n="download" cls="w-3.5 h-3.5"/> Export CSV
                    </button>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto max-h-[640px]">
                      {searchedRows.length > 0 ? (() => {
                        const cols = Object.keys(searchedRows[0]).filter(k => !k.startsWith("_"));
                        return (
                          <table className="min-w-full text-xs">
                            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                              <tr>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-16">Edit</th>
                                {cols.map(c => <th key={c} className="px-3 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">{c}</th>)}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {searchedRows.map((row, i) => (
                                <tr key={i} className="hover:bg-slate-50/80 group">
                                  <td className="px-4 py-2.5">
                                    <button onClick={() => setEditRow(row)}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity bg-green-50 hover:bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-lg border border-green-200">
                                      Edit
                                    </button>
                                  </td>
                                  {cols.map(c => {
                                    const raw = row[c] ?? "";
                                    const isDate = c === "Date" && /^Date\(/.test(raw);
                                    const display = isDate ? (() => { const d = parseRowDate(raw); return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : raw; })() : raw;
                                    const isUrl = display.startsWith("http");
                                    return (
                                      <td key={c} className="px-3 py-2.5 text-slate-600 whitespace-nowrap max-w-[180px] truncate">
                                        {isUrl ? (
                                          <a href={display} target="_blank" rel="noreferrer" className="text-green-600 hover:underline">
                                            {display.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40) + (display.length > 50 ? "…" : "")}
                                          </a>
                                        ) : display}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        );
                      })() : (
                        <div className="py-20 flex flex-col items-center gap-3 text-slate-300">
                          <Ic n="table" cls="w-10 h-10"/>
                          <p className="text-sm">No records for {dateLabel}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── QA REVIEW (admin only) ── */}
              {tab === "qareview" && user.role === "admin" && (() => {
                const qaStatusColors: Record<string, string> = {
                  Pass: "bg-green-100 text-green-700 border-green-200",
                  Fail: "bg-red-100 text-red-700 border-red-200",
                  Duplicate: "bg-purple-100 text-purple-700 border-purple-200",
                  Pending: "bg-amber-100 text-amber-700 border-amber-200",
                };
                const allVAs = Array.from(new Set(filteredRows.map(r => r["VA Name"]?.trim()).filter(Boolean)));
                const qaRows = filteredRows.filter(r => {
                  if (qaVAFilter !== "all" && r["VA Name"]?.trim() !== qaVAFilter) return false;
                  const k = rowKey(r);
                  const status = (qaReviews[k]?.["QA Status"] ?? "") as QAStatus;
                  if (qaFilter !== "all" && (qaFilter === "Pending" ? (status !== "" && status !== "Pending") : status !== qaFilter)) return false;
                  if (qaFilter === "Pending" && status !== "" && status !== "Pending") return false;
                  if (qaSearch.trim()) {
                    const q = qaSearch.toLowerCase();
                    if (!Object.values(r).some(v => v.toLowerCase().includes(q))) return false;
                  }
                  return true;
                }).filter(r => {
                  if (qaFilter === "Pending") {
                    const k = rowKey(r);
                    const st = qaReviews[k]?.["QA Status"] ?? "";
                    return st === "" || st === "Pending";
                  }
                  return true;
                });

                const counts = { Pass: 0, Fail: 0, Duplicate: 0, Pending: 0 };
                for (const r of filteredRows) {
                  const st = (qaReviews[rowKey(r)]?.["QA Status"] ?? "") as QAStatus;
                  if (st === "Pass") counts.Pass++;
                  else if (st === "Fail") counts.Fail++;
                  else if (st === "Duplicate") counts.Duplicate++;
                  else counts.Pending++;
                }

                async function saveQA(r: Row, status: QAStatus, notes = "") {
                  const k = rowKey(r);
                  setQASaving(k);
                  const d = parseRowDate(r["Date"]);
                  const dateStr = d ? d.toLocaleDateString("en-US") : r["Date"];
                  try {
                    const res = await fetch("/api/qa-review", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        rowKey: k, vaName: r["VA Name"] ?? "", date: dateStr,
                        url: r["Direct Facebook Post URL"] || undefined,
                        facilityName: r["Facility Name"] || undefined,
                        status, notes,
                      }),
                    });
                    if (res.ok) setQAReviews(prev => ({ ...prev, [k]: { ...prev[k], "QA Status": status, "QA Notes": notes, "Row Key": k } }));
                  } finally { setQASaving(null); }
                }

                return (
                  <div className="space-y-4">
                    {/* Stats bar */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {(["Pending", "Pass", "Fail", "Duplicate"] as const).map(s => (
                        <button key={s} onClick={() => setQAFilter(qaFilter === s ? "all" : s)}
                          className={`rounded-2xl border p-4 text-left transition-all hover:shadow-md ${qaFilter === s ? qaStatusColors[s] + " shadow-sm" : "bg-white border-slate-200"}`}>
                          <div className={`text-2xl font-black tabular-nums ${qaFilter === s ? "" : s === "Pass" ? "text-green-600" : s === "Fail" ? "text-red-500" : s === "Duplicate" ? "text-purple-600" : "text-amber-500"}`}>
                            {counts[s].toLocaleString()}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">{s === "Pending" ? "Unreviewed" : s}</div>
                        </button>
                      ))}
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Ic n="search" cls="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                        <input type="text" placeholder="Search entries…" value={qaSearch} onChange={e => setQASearch(e.target.value)}
                          className="bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm w-56 focus:outline-none focus:border-green-400"/>
                      </div>
                      <select value={qaVAFilter} onChange={e => setQAVAFilter(e.target.value)}
                        className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400">
                        <option value="all">All VAs</option>
                        {allVAs.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <button onClick={() => exportCSV(qaRows, `slf-qa-${new Date().toISOString().slice(0,10)}.csv`)}
                        className="ml-auto flex items-center gap-1.5 bg-white border border-slate-200 hover:border-green-400 hover:text-green-700 text-slate-600 text-xs font-medium px-3 py-2 rounded-xl transition-colors">
                        <Ic n="download" cls="w-3.5 h-3.5"/> Export CSV
                      </button>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      {qaLoading ? (
                        <div className="py-16 flex items-center justify-center gap-3">
                          <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin"/>
                          <span className="text-sm text-slate-400">Loading reviews…</span>
                        </div>
                      ) : qaRows.length === 0 ? (
                        <div className="py-20 flex flex-col items-center gap-3 text-slate-300">
                          <Ic n="shield" cls="w-10 h-10"/>
                          <p className="text-sm">No entries match the current filter</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto max-h-[600px]">
                          <table className="min-w-full text-xs">
                            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                              <tr>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">VA</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Facility / Group</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Comment Status</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-60">QA Decision</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Notes</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reviewed By</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {qaRows.map((r, i) => {
                                const k = rowKey(r);
                                const review = qaReviews[k];
                                const status = (review?.["QA Status"] ?? "") as QAStatus;
                                const saving = qaSaving === k;
                                const d = parseRowDate(r["Date"]);
                                const dateStr = d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : r["Date"];
                                return (
                                  <tr key={i} className="hover:bg-slate-50/80 group">
                                    <td className="px-4 py-3">
                                      <span className="flex items-center gap-1.5 font-medium text-slate-700">
                                        <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: vaColor(r["VA Name"] ?? "") }}/>
                                        {r["VA Name"] ?? "—"}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateStr}</td>
                                    <td className="px-4 py-3 text-slate-600 max-w-[160px] truncate">{r["Facility Name"] || r["Facebook Group Name"] || "—"}</td>
                                    <td className="px-4 py-3">
                                      <SPill s={getBucket(r)}/>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-1">
                                        {(["Pass", "Fail", "Duplicate"] as const).map(s => (
                                          <button key={s} disabled={saving} onClick={() => saveQA(r, status === s ? "Pending" : s)}
                                            className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all disabled:opacity-40 ${status === s ? qaStatusColors[s] : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                                            {saving && status === s ? "…" : s}
                                          </button>
                                        ))}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-400 max-w-[140px] truncate" title={review?.["QA Notes"]}>{review?.["QA Notes"] || "—"}</td>
                                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{review?.["Reviewed By"] || "—"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

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

      {editRow && <EditRowModal row={editRow} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); loadData(); }}/>}
    </div>
  );
}
