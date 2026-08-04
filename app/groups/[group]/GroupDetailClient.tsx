"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { SessionPayload } from "@/lib/session";
import { Sidebar, PageFooter, Ic, type NavItem } from "../../Sidebar";
import {
  Row, vaColor, vaOf, fmtNum, pct,
  hasListing, isLive, isAccurate, parseRowDate,
} from "@/lib/dash";
import { exportCSV } from "@/lib/csv";

type SortKey = "date" | "va" | "facility" | "listingId" | "live";
const COLS: { key: SortKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "va", label: "VA" },
  { key: "facility", label: "Facility" },
  { key: "listingId", label: "Listing ID" },
  { key: "live", label: "Live" },
];

export default function GroupDetailClient({ user, groupName }: { user: SessionPayload; groupName: string }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [glitchCount, setGlitchCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });

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

  // Exact-match on the trimmed group name — the same key /groups aggregates by,
  // so a total shown here can never disagree with what the list page counted.
  const groupRows = useMemo(
    () => rows.filter(r => (r["Facebook Group Name"] ?? "").trim() === groupName),
    [rows, groupName]
  );

  const stats = useMemo(() => {
    const total = groupRows.length;
    const live = groupRows.filter(isLive).length;
    const accurate = groupRows.filter(isAccurate).length;
    const facilities = new Set(groupRows.map(r => (r["Facility Name"] ?? "").trim()).filter(Boolean));
    const dates = groupRows.map(r => (r["Date"] ?? "").trim()).filter(Boolean).sort();
    return {
      total, live, livePct: pct(live, total), accurate, accuratePct: pct(accurate, total),
      facilityCount: facilities.size,
      firstDate: dates[0], lastDate: dates[dates.length - 1],
    };
  }, [groupRows]);

  // Reverse lookup — which VA contributes most to this specific group.
  const vaBreakdown = useMemo(() => {
    const m = new Map<string, { total: number; live: number }>();
    for (const r of groupRows) {
      const va = vaOf(r);
      if (!m.has(va)) m.set(va, { total: 0, live: 0 });
      const s = m.get(va)!;
      s.total++;
      if (isLive(r)) s.live++;
    }
    return [...m.entries()]
      .map(([va, s]) => ({ va, ...s, livePct: pct(s.live, s.total), share: pct(s.total, groupRows.length) }))
      .sort((a, b) => b.total - a.total);
  }, [groupRows]);

  const sorted = useMemo(() => {
    const mul = sort.dir === "asc" ? 1 : -1;
    const val = (r: Row, key: SortKey) => {
      switch (key) {
        case "date": return r["Date"] ?? "";
        case "va": return vaOf(r);
        case "facility": return r["Facility Name"] ?? "";
        case "listingId": return r["SLF Listing ID"] ?? "";
        case "live": return isLive(r) ? "1" : "0";
      }
    };
    return [...groupRows].sort((a, b) => mul * val(a, sort.key).localeCompare(val(b, sort.key), undefined, { numeric: true, sensitivity: "base" }));
  }, [groupRows, sort]);

  const toggleSort = (key: SortKey) =>
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });

  const exportRows = () => exportCSV(
    sorted.map(r => ({
      Date: r["Date"] ?? "", "VA Name": r["VA Name"] ?? "", "Facility Name": r["Facility Name"] ?? "",
      "SLF Listing ID": r["SLF Listing ID"] ?? "", Live: isLive(r) ? "Yes" : "No",
      "FB Post URL": r["Direct Facebook Post URL"] ?? "",
    })),
    `slf-fb-group-${groupName.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}-${new Date().toISOString().slice(0, 10)}.csv`,
  );

  const NAV: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: "home", href: "/" },
    { id: "postcheck", label: "Post Check", icon: "search", href: "/" },
    { id: "qa", label: "QA & Glitches", icon: "alert", badge: glitchCount || undefined, href: "/" },
    { id: "data", label: "Records", icon: "table", href: "/" },
    { id: "groups", label: "FB Groups", icon: "users", href: "/groups" },
    ...(user.role === "admin" ? [{ id: "qareview", label: "QA Review", icon: "shield", href: "/" }] : []),
    { id: "logentry", label: "Log Entry", icon: "plus", href: "/" },
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
          <Link href="/groups" className="flex items-center gap-1.5 text-slate-400 hover:text-green-600 transition-colors text-xs font-medium flex-shrink-0">
            <Ic n="back" cls="w-3.5 h-3.5" /> All FB Groups
          </Link>
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

        <main className="flex-1 min-h-0 min-w-0 p-5 overflow-auto overscroll-contain">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading…</div>
          ) : error ? (
            <div className="flex items-center justify-center h-64 text-red-500 text-sm">{error}</div>
          ) : stats.total === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-20 flex flex-col items-center gap-3">
              <Ic n="search" cls="w-8 h-8 text-slate-300" />
              <p className="font-semibold text-slate-700">No posts found for this group</p>
              <p className="text-sm text-slate-400 max-w-md text-center px-4">&quot;{groupName}&quot; — the group name may have changed, or this link is stale.</p>
              <Link href="/groups" className="text-sm font-medium text-green-600 hover:underline">← Back to all groups</Link>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold text-slate-800 break-words">{groupName}</h1>
                <p className="text-xs text-slate-400 mt-1">
                  {stats.firstDate && stats.lastDate && (() => {
                    const f = parseRowDate(stats.firstDate), l = parseRowDate(stats.lastDate);
                    const o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
                    return f && l ? `${f.toLocaleDateString("en-US", o)} – ${l.toLocaleDateString("en-US", o)}` : null;
                  })()}
                </p>
              </div>

              {/* KPI strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total posts</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">{fmtNum(stats.total)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Live</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">{fmtNum(stats.live)} <span className="text-sm font-bold text-slate-400">({stats.livePct}%)</span></p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Accurate</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">{fmtNum(stats.accurate)} <span className="text-sm font-bold text-slate-400">({stats.accuratePct}%)</span></p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Distinct facilities</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">{fmtNum(stats.facilityCount)}</p>
                </div>
              </div>

              {/* VA reverse lookup */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="font-bold text-slate-800">Who posts here</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Every VA who has posted to this group, ranked by volume</p>
                </div>
                <div className="p-5 space-y-2.5">
                  {vaBreakdown.map(v => {
                    const c = vaColor(v.va);
                    return (
                      <div key={v.va} className="flex items-center gap-3">
                        <span className="w-32 sm:w-40 text-xs font-semibold text-slate-700 truncate flex-shrink-0">{v.va}</span>
                        <div className="flex-1 h-6 bg-slate-100 rounded-lg overflow-hidden min-w-0">
                          <div className="h-full rounded-lg transition-all duration-500" style={{ width: `${v.share}%`, background: c }} />
                        </div>
                        <span className="w-36 text-[11px] text-slate-500 text-right flex-shrink-0 tabular-nums">
                          <b className="text-slate-700">{fmtNum(v.total)}</b> · {v.share}% · {v.livePct}% live
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Every listing */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-slate-800">{fmtNum(sorted.length)} listings in this group</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Click a header to sort</p>
                  </div>
                  <button onClick={exportRows}
                    className="flex-shrink-0 flex items-center gap-1.5 bg-white border border-slate-200 hover:border-green-400 hover:text-green-700 text-slate-600 text-xs font-medium px-3 py-2 rounded-xl transition-colors">
                    Export CSV
                  </button>
                </div>
                <div className="overflow-auto max-h-[65vh]">
                  <table className="w-full text-xs border-separate border-spacing-0" style={{ minWidth: "100%" }}>
                    <thead>
                      <tr className="h-9">
                        {COLS.map(c => {
                          const on = sort.key === c.key;
                          return (
                            <th key={c.key} className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 px-3 text-left">
                              <button onClick={() => toggleSort(c.key)}
                                className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${on ? "text-green-700" : "text-slate-400 hover:text-slate-600"}`}>
                                {c.label}{on && <span>{sort.dir === "asc" ? "↑" : "↓"}</span>}
                              </button>
                            </th>
                          );
                        })}
                        <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 px-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">FB Post URL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r, i) => {
                        const url = r["Direct Facebook Post URL"]?.trim();
                        const live = isLive(r);
                        return (
                          <tr key={r._id || i} className="hover:bg-slate-50/80 transition-colors bg-white">
                            <td className="border-b border-slate-100 px-3 py-2 text-slate-600 whitespace-nowrap">
                              {(() => { const d = parseRowDate(r["Date"]); return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"; })()}
                            </td>
                            <td className="border-b border-slate-100 px-3 py-2">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: vaColor(vaOf(r)) }} />{vaOf(r)}
                              </span>
                            </td>
                            <td className="border-b border-slate-100 px-3 py-2 text-slate-600 truncate max-w-[220px]" title={r["Facility Name"]}>
                              {r["Facility Name"]?.trim() || <span className="text-slate-300">—</span>}
                            </td>
                            <td className="border-b border-slate-100 px-3 py-2 text-slate-600 tabular-nums">
                              {hasListing(r) ? r["SLF Listing ID"] : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="border-b border-slate-100 px-3 py-2">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${live ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                                {live ? "Live" : "Not live"}
                              </span>
                            </td>
                            <td className="border-b border-slate-100 px-3 py-2 truncate max-w-[240px]">
                              {url
                                ? <a href={url} target="_blank" rel="noreferrer" className="text-green-600 hover:underline" title={url}>{url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 38)}…</a>
                                : <span className="text-slate-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>

        <PageFooter />
      </div>
    </div>
  );
}
