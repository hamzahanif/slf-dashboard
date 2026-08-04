"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionPayload } from "@/lib/session";
import { Sidebar, PageFooter, Ic, type NavItem } from "../Sidebar";
import {
  Row, vaColor, vaOf, fmtNum, pct,
  isLive, parseRowDate, toYMD, addDays, filterByRange,
} from "@/lib/dash";
import { exportCSV } from "@/lib/csv";

type Preset = "today" | "yesterday" | "7d" | "30d" | "month" | "alltime" | "custom";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" }, { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7d" }, { id: "30d", label: "Last 30d" },
  { id: "month", label: "This month" }, { id: "alltime", label: "All time" },
  { id: "custom", label: "Custom" },
];
function getRange(p: Preset, cs: string, ce: string): [Date, Date] | null {
  const now = new Date(), t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === "alltime") return null;
  if (p === "today") return [t, t];
  if (p === "yesterday") { const y = addDays(t, -1); return [y, y]; }
  if (p === "7d") return [addDays(t, -6), t];
  if (p === "30d") return [addDays(t, -29), t];
  if (p === "month") return [new Date(t.getFullYear(), t.getMonth(), 1), t];
  if (p === "custom") {
    if (!cs && !ce) return null;
    const s = cs ? parseRowDate(cs)! : new Date(2000, 0, 1);
    const e = ce ? parseRowDate(ce)! : t;
    return [s, e];
  }
  return null;
}
function fmtRange(r: [Date, Date] | null, p: Preset) {
  if (!r) return "All time";
  const [s, e] = r, o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (p === "today") return `Today · ${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  if (p === "yesterday") return `Yesterday · ${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  if (s.toDateString() === e.toDateString()) return s.toLocaleDateString("en-US", o);
  return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", o)}`;
}

interface GroupStat {
  group: string;
  total: number;
  live: number;
  livePct: number;
  vaCount: number;
  facilityCount: number;
  lastDate: string;
  topVa: string;
  topVaCount: number;
  topVaShare: number;
}

type SortKey = "group" | "total" | "live" | "livePct" | "vaCount" | "facilityCount" | "lastDate" | "topVa";

export default function GroupsClient({ user }: { user: SessionPayload }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [glitchCount, setGlitchCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [preset, setPreset] = useState<Preset>("alltime");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "total", dir: "desc" });

  useEffect(() => {
    Promise.all([fetch("/api/rows"), fetch("/api/data")])
      .then(async ([rRes, dRes]) => {
        if (rRes.status === 401 || dRes.status === 401) { router.replace("/login"); return; }
        const [r, d] = await Promise.all([rRes.json(), dRes.json()]);
        setRows(r.rows || []);
        setGlitchCount((d.glitches || []).length);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login"); router.refresh();
  }

  const range = useMemo(() => getRange(preset, customStart, customEnd), [preset, customStart, customEnd]);
  const filtered = useMemo(() => filterByRange(rows, range), [rows, range]);
  const dateLabel = fmtRange(range, preset);

  const stats: GroupStat[] = useMemo(() => {
    const m = new Map<string, { total: number; live: number; vas: Map<string, number>; facilities: Set<string>; lastDate: string }>();
    for (const r of filtered) {
      const g = (r["Facebook Group Name"] ?? "").trim();
      if (!g) continue;
      if (!m.has(g)) m.set(g, { total: 0, live: 0, vas: new Map(), facilities: new Set(), lastDate: "" });
      const s = m.get(g)!;
      s.total++;
      if (isLive(r)) s.live++;
      const va = vaOf(r);
      s.vas.set(va, (s.vas.get(va) ?? 0) + 1);
      const fac = (r["Facility Name"] ?? "").trim();
      if (fac) s.facilities.add(fac);
      const d = (r["Date"] ?? "").trim();
      if (d && d > s.lastDate) s.lastDate = d;
    }
    return [...m.entries()].map(([group, s]) => {
      const top = [...s.vas.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["—", 0];
      return {
        group, total: s.total, live: s.live, livePct: pct(s.live, s.total),
        vaCount: s.vas.size, facilityCount: s.facilities.size, lastDate: s.lastDate,
        topVa: top[0], topVaCount: top[1], topVaShare: pct(top[1], s.total),
      };
    });
  }, [filtered]);

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? stats.filter(s => s.group.toLowerCase().includes(needle)) : stats;
  }, [stats, q]);

  const sorted = useMemo(() => {
    const mul = sort.dir === "asc" ? 1 : -1;
    return [...searched].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (typeof av === "number" && typeof bv === "number") return mul * (av - bv);
      return mul * String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
    });
  }, [searched, sort]);

  const toggleSort = (key: SortKey) =>
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "group" ? "asc" : "desc" });

  const totals = useMemo(() => {
    const totalPosts = filtered.filter(r => (r["Facebook Group Name"] ?? "").trim()).length;
    const totalLive = stats.reduce((a, s) => a + s.live, 0);
    const top = [...stats].sort((a, b) => b.total - a.total)[0];
    return {
      groupCount: stats.length,
      totalPosts,
      avgLive: pct(totalLive, totalPosts),
      top,
    };
  }, [stats, filtered]);

  const NAV: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: "home", href: "/" },
    { id: "postcheck", label: "Post Check", icon: "search", href: "/" },
    { id: "qa", label: "QA & Glitches", icon: "alert", badge: glitchCount || undefined, href: "/" },
    { id: "data", label: "Records", icon: "table", href: "/" },
    { id: "groups", label: "FB Groups", icon: "users", href: "/groups" },
    ...(user.role === "admin" ? [{ id: "qareview", label: "QA Review", icon: "shield", href: "/" }] : []),
    { id: "logentry", label: "Log Entry", icon: "plus", href: "/" },
  ];

  const exportRows = () => exportCSV(
    sorted.map(s => ({
      "FB Group": s.group, Posts: String(s.total), Live: String(s.live), "Live %": `${s.livePct}%`,
      VAs: String(s.vaCount), Facilities: String(s.facilityCount), "Last Posted": s.lastDate,
      "Top VA": s.topVa, "Top VA Posts": String(s.topVaCount),
    })),
    `slf-fb-groups-${new Date().toISOString().slice(0, 10)}.csv`,
  );

  const COLS: { key: SortKey; label: string }[] = [
    { key: "group", label: "FB Group" },
    { key: "total", label: "Posts" },
    { key: "live", label: "Live" },
    { key: "livePct", label: "Live %" },
    { key: "vaCount", label: "VAs" },
    { key: "facilityCount", label: "Facilities" },
    { key: "lastDate", label: "Last Posted" },
    { key: "topVa", label: "Top VA" },
  ];

  return (
    <div className="h-screen overflow-hidden bg-slate-50 flex">
      <Sidebar items={NAV} activeId="groups" onSelect={() => {}}
        user={user} onLogout={handleLogout} loggingOut={loggingOut}
        sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <div className="flex-1 min-w-0 flex flex-col lg:ml-64">
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 h-14 flex items-center px-4 gap-3 flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
            <Ic n="menu" cls="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 bg-green-600 rounded-full hidden lg:block" />
            <h1 className="text-sm font-semibold text-slate-800">Facebook Groups</h1>
          </div>
          <a href="https://soberlivingfinder.com" target="_blank" rel="noreferrer"
            className="hidden md:flex items-center gap-1 text-xs text-slate-400 hover:text-green-600 transition-colors ml-auto">
            <Ic n="link" cls="w-3 h-3" /> soberlivingfinder.com
          </a>
          <div className="flex items-center gap-2.5 md:ml-0 ml-auto pl-3 border-l border-slate-100">
            <div className="w-7 h-7 rounded-full bg-green-700 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">{user.name.slice(0, 2).toUpperCase()}</div>
            <div className="hidden sm:block">
              <p className="text-xs font-semibold text-slate-700 leading-none">{user.name}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{user.title}</p>
            </div>
          </div>
        </header>

        {/* Period bar */}
        <div className="bg-white border-b border-slate-100 px-4 py-2.5 flex flex-wrap items-center gap-2 flex-shrink-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:block">Period</span>
          <div className="flex flex-wrap gap-1">
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => { setPreset(p.id); setShowCustom(p.id === "custom"); }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${preset === p.id ? "bg-green-600 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                {p.label}
              </button>
            ))}
          </div>
          {showCustom && (
            <div className="flex items-center gap-1">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-green-400" />
              <span className="text-slate-300 text-xs">–</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-green-400" />
            </div>
          )}
          <div className="relative flex-1 min-w-[150px] max-w-xs">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search group name…"
              className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:border-green-400" />
          </div>
          <div className="ml-auto flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[11px]">
            <span className="text-slate-500">{dateLabel}</span>
            <span className="text-slate-300">·</span>
            <span className="font-bold text-slate-700">{fmtNum(totals.totalPosts)}</span>
            <span className="text-slate-400">posts</span>
          </div>
        </div>

        <main className="flex-1 min-h-0 min-w-0 p-5 overflow-auto overscroll-contain">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading…</div>
          ) : error ? (
            <div className="flex items-center justify-center h-64 text-red-500 text-sm">{error}</div>
          ) : (
            <div className="space-y-5">
              {/* KPI strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Distinct groups</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">{fmtNum(totals.groupCount)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total posts</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">{fmtNum(totals.totalPosts)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Avg live rate</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">{totals.avgLive}%</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 overflow-hidden">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Top group</p>
                  <p className="text-sm font-bold text-slate-800 mt-1 truncate" title={totals.top?.group}>{totals.top?.group ?? "—"}</p>
                  <p className="text-[11px] text-slate-400">{totals.top ? `${fmtNum(totals.top.total)} posts` : ""}</p>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-slate-800">{fmtNum(sorted.length)} groups</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Click a group to see every listing posted there, and who posts there most · click a header to sort</p>
                  </div>
                  <button onClick={exportRows}
                    className="flex-shrink-0 flex items-center gap-1.5 bg-white border border-slate-200 hover:border-green-400 hover:text-green-700 text-slate-600 text-xs font-medium px-3 py-2 rounded-xl transition-colors">
                    Export CSV
                  </button>
                </div>
                {sorted.length === 0 ? (
                  <div className="py-16 flex flex-col items-center gap-2 text-slate-300">
                    <Ic n="search" cls="w-8 h-8" />
                    <p className="text-sm">No groups match these filters</p>
                  </div>
                ) : (
                  <div className="overflow-auto max-h-[65vh]">
                    <table className="w-full text-xs border-separate border-spacing-0" style={{ minWidth: "100%" }}>
                      <thead>
                        <tr className="h-9">
                          {COLS.map(c => {
                            const on = sort.key === c.key;
                            return (
                              <th key={c.key} className={`sticky top-0 z-10 bg-slate-50 border-b border-slate-200 px-3 ${c.key === "group" ? "text-left" : "text-right"}`}>
                                <button onClick={() => toggleSort(c.key)}
                                  className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${c.key !== "group" ? "ml-auto" : ""} ${on ? "text-green-700" : "text-slate-400 hover:text-slate-600"}`}>
                                  {c.label}{on && <span>{sort.dir === "asc" ? "↑" : "↓"}</span>}
                                </button>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map(s => (
                          <tr key={s.group} onClick={() => router.push(`/groups/${encodeURIComponent(s.group)}`)}
                            className="cursor-pointer hover:bg-slate-50/80 transition-colors bg-white">
                            <td className="border-b border-slate-100 px-3 py-2.5 text-slate-800 font-medium truncate max-w-[280px]" title={s.group}>{s.group}</td>
                            <td className="border-b border-slate-100 px-3 py-2.5 text-right font-bold text-slate-700 tabular-nums">{fmtNum(s.total)}</td>
                            <td className="border-b border-slate-100 px-3 py-2.5 text-right text-slate-600 tabular-nums">{fmtNum(s.live)}</td>
                            <td className="border-b border-slate-100 px-3 py-2.5 text-right">
                              <span className={`font-bold tabular-nums ${s.livePct >= 70 ? "text-green-600" : s.livePct >= 40 ? "text-amber-600" : "text-red-500"}`}>{s.livePct}%</span>
                            </td>
                            <td className="border-b border-slate-100 px-3 py-2.5 text-right text-slate-600 tabular-nums">{s.vaCount}</td>
                            <td className="border-b border-slate-100 px-3 py-2.5 text-right text-slate-600 tabular-nums">{s.facilityCount}</td>
                            <td className="border-b border-slate-100 px-3 py-2.5 text-right text-slate-500 whitespace-nowrap">
                              {(() => { const d = parseRowDate(s.lastDate); return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"; })()}
                            </td>
                            <td className="border-b border-slate-100 px-3 py-2.5 text-right">
                              <span className="inline-flex items-center gap-1.5 justify-end">
                                <span className={s.topVa === "—" ? "text-slate-300" : "text-slate-700 font-medium"}>{s.topVa}</span>
                                {s.topVa !== "—" && <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: vaColor(s.topVa) }} />}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        <PageFooter />
      </div>
    </div>
  );
}
