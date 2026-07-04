"use client";

import { useEffect, useState, useMemo } from "react";
import type { VAStat, Glitch, SummaryStats } from "@/lib/analytics";

type Tab = "overview" | "performance" | "qa" | "data";
type Period = "daily" | "weekly" | "monthly" | "alltime";

interface DashData {
  summary: SummaryStats;
  vaStats: VAStat[];
  glitches: Glitch[];
  rowCount: number;
}

interface Row {
  [key: string]: string;
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

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<Period>("monthly");
  const [data, setData] = useState<DashData | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [glitchFilter, setGlitchFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/data").then(r => r.json()),
      fetch("/api/rows").then(r => r.json()),
    ])
      .then(([d, r]) => {
        setData(d);
        setRows(r.rows || []);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const glitchTypes = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.glitches.map(g => g.type)));
  }, [data]);

  const filteredGlitches = useMemo(() => {
    if (!data) return [];
    return glitchFilter === "all" ? data.glitches : data.glitches.filter(g => g.type === glitchFilter);
  }, [data, glitchFilter]);

  const filteredRows = useMemo(() => {
    if (!rows.length) return [];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => Object.values(r).some(v => v.toLowerCase().includes(q)));
  }, [rows, search]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "performance", label: "Performance" },
    { id: "qa", label: "QA & Glitches" },
    { id: "data", label: "Raw Data" },
  ];

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
          <a
            href="https://soberlivingfinder.com"
            target="_blank"
            rel="noreferrer"
            className="text-green-200 text-xs hover:text-white transition-colors"
          >
            soberlivingfinder.com ↗
          </a>
        </div>
      </header>

      {/* Nav tabs */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 flex gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
              {t.id === "qa" && data && data.glitches.length > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {data.glitches.length}
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

        {!loading && !error && data && (
          <>
            {/* OVERVIEW */}
            {tab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <StatCard label="Total Rows" value={data.summary.totalRows} color="green" />
                  <StatCard label="VAs Tracked" value={data.summary.uniqueVAs} color="blue" />
                  <StatCard label="FB Groups" value={data.summary.uniqueGroups} color="purple" />
                  <StatCard label="Total Issues" value={data.summary.totalGlitches} color="red" />
                  <StatCard label="Missing Fields" value={data.summary.missingFields} color="orange" />
                  <StatCard label="Duplicate URLs" value={data.summary.duplicateUrls} color="yellow" />
                </div>

                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="font-semibold text-slate-800">VA Performance — This Month</h2>
                    <span className="text-xs text-slate-400">
                      {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                    </span>
                  </div>
                  <PerformanceTable stats={data.vaStats} period="monthly" />
                </div>

                {data.glitches.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <h2 className="font-semibold text-slate-800">Recent Issues</h2>
                      <button onClick={() => setTab("qa")} className="text-xs text-green-600 hover:underline">
                        View all →
                      </button>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {data.glitches.slice(0, 5).map((g, i) => (
                        <GlitchRow key={i} glitch={g} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PERFORMANCE */}
            {tab === "performance" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-slate-600 font-medium">Period:</span>
                  {(["daily", "weekly", "monthly", "alltime"] as Period[]).map(p => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        period === p
                          ? "bg-green-600 text-white"
                          : "bg-white border border-slate-200 text-slate-600 hover:border-green-300"
                      }`}
                    >
                      {p === "alltime" ? "All Time" : p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>

                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h2 className="font-semibold text-slate-800">Comments Posted per VA</h2>
                  </div>
                  <PerformanceTable stats={data.vaStats} period={period} detailed />
                </div>
              </div>
            )}

            {/* QA */}
            {tab === "qa" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-600 font-medium">Filter:</span>
                  <button
                    onClick={() => setGlitchFilter("all")}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      glitchFilter === "all" ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-600"
                    }`}
                  >
                    All ({data.glitches.length})
                  </button>
                  {glitchTypes.map(type => (
                    <button
                      key={type}
                      onClick={() => setGlitchFilter(type)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        glitchFilter === type ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-600"
                      }`}
                    >
                      {GLITCH_LABELS[type] ?? type} ({data.glitches.filter(g => g.type === type).length})
                    </button>
                  ))}
                </div>

                {filteredGlitches.length === 0 ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-10 text-center">
                    <div className="text-4xl mb-2">✓</div>
                    <p className="text-green-700 font-medium">No issues found!</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100">
                      <h2 className="font-semibold text-slate-800">{filteredGlitches.length} issues detected</h2>
                    </div>
                    <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
                      {filteredGlitches.map((g, i) => (
                        <GlitchRow key={i} glitch={g} detailed />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* RAW DATA */}
            {tab === "data" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="Search rows…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:border-green-400"
                  />
                  <span className="text-xs text-slate-400">{filteredRows.length} rows</span>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto max-h-[600px]">
                    {filteredRows.length > 0 ? (
                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-50 sticky top-0 z-10">
                          <tr>
                            {Object.keys(filteredRows[0]).map(col => (
                              <th
                                key={col}
                                className="px-3 py-2 text-left text-slate-500 font-medium whitespace-nowrap border-b border-slate-200"
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {filteredRows.map((row, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              {Object.values(row).map((val, j) => (
                                <td key={j} className="px-3 py-2 text-slate-700 whitespace-nowrap max-w-[200px] truncate">
                                  {String(val).startsWith("http") ? (
                                    <a href={val} target="_blank" rel="noreferrer" className="text-green-600 hover:underline">
                                      {val}
                                    </a>
                                  ) : (
                                    val
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="p-8 text-center text-slate-400 text-sm">
                        No data — add sheet IDs in <code className="bg-slate-100 px-1 rounded">lib/config.ts</code>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* No data state */}
        {!loading && !error && !data && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center">
            <p className="text-yellow-700 font-medium">No data loaded yet.</p>
            <p className="text-yellow-600 text-sm mt-1">Add your Google Sheet IDs in <code>lib/config.ts</code></p>
          </div>
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

function PerformanceTable({
  stats,
  period,
  detailed,
}: {
  stats: VAStat[];
  period: Period;
  detailed?: boolean;
}) {
  if (!stats.length) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        No data — add sheet IDs in <code className="bg-slate-100 px-1 rounded">lib/config.ts</code>
      </div>
    );
  }
  const val = (s: VAStat) => s[period];
  const max = Math.max(...stats.map(val), 1);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-5 py-3 text-left text-slate-500 font-medium">VA Name</th>
            {detailed ? (
              <>
                <th className="px-4 py-3 text-right text-slate-500 font-medium">Today</th>
                <th className="px-4 py-3 text-right text-slate-500 font-medium">This Week</th>
                <th className="px-4 py-3 text-right text-slate-500 font-medium">This Month</th>
                <th className="px-4 py-3 text-right text-slate-500 font-medium">All Time</th>
              </>
            ) : (
              <th className="px-4 py-3 text-right text-slate-500 font-medium">Comments</th>
            )}
            <th className="px-5 py-3 text-left text-slate-500 font-medium w-48">Progress</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {stats.map(s => (
            <tr key={s.vaName} className="hover:bg-slate-50">
              <td className="px-5 py-3 font-medium text-slate-800">{s.vaName}</td>
              {detailed ? (
                <>
                  <td className="px-4 py-3 text-right text-slate-600">{s.daily}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{s.weekly}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{s.monthly}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{s.alltime}</td>
                </>
              ) : (
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{val(s)}</td>
              )}
              <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all"
                      style={{ width: `${(val(s) / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 w-8 text-right">
                    {Math.round((val(s) / max) * 100)}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
              <a
                href={glitch.row["Direct Facebook Post URL"]}
                target="_blank"
                rel="noreferrer"
                className="text-green-600 hover:underline truncate max-w-[200px]"
              >
                FB Post ↗
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
