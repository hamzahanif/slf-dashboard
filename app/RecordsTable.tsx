"use client";

import { useState, useMemo, useEffect } from "react";
import type { Glitch } from "@/lib/analytics";
import {
  Row, parseRowDate, fmtNum, vaColor,
  GLITCH_LABELS, GLITCH_PILL, GLITCH_ACCENT,
} from "@/lib/dash";
import { exportCSV } from "@/lib/csv";

type ColType = "date" | "time" | "url" | "num" | "text";

/** WP post times arrive as either "H:MM" or a full ISO timestamp. Pull the
 *  clock time out textually — no Date parsing, so no timezone shifting. */
function fmtTime(raw: string) {
  const m = raw.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : raw;
}
interface Col { key: string; label: string; type?: ColType; w: number }

// Display order — most-referenced fields first, long free-text last.
const COLUMNS: Col[] = [
  { key: "Date", label: "Date", type: "date", w: 104 },
  { key: "Facility Name", label: "Facility Name", w: 210 },
  { key: "SLF Listing ID", label: "SLF Listing ID", type: "num", w: 110 },
  { key: "Action Type", label: "Action Type", w: 130 },
  { key: "WP- Post time", label: "WP Post Time", type: "time", w: 108 },
  { key: "VA Name", label: "VA Name", w: 140 },
  { key: "Shift", label: "Shift", w: 110 },
  { key: "Facebook Group Name", label: "Facebook Group", w: 220 },
  { key: "Direct Facebook Post URL", label: "FB Post URL", type: "url", w: 200 },
  { key: "Comment Status", label: "Comment Status", w: 130 },
  { key: "Media Uploaded", label: "Media", w: 100 },
  { key: "FB Account", label: "FB Account", w: 130 },
  { key: "Comment Left (Script A)", label: "Comment (Script A)", w: 190 },
  { key: "Promo Comment (Script B or C)", label: "Promo Comment", w: 190 },
  { key: "Handoff Notes", label: "Handoff Notes", w: 180 },
  { key: "Status / Notes", label: "Status / Notes", w: 180 },
];
const PAGE_SIZES = [50, 100, 250, 1000];
/** Columns with few enough distinct values get a dropdown instead of a text box. */
const SELECT_MAX = 25;

function Icon({ d, cls = "w-3.5 h-3.5" }: { d: React.ReactNode; cls?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className={cls}>{d}</svg>;
}
const PencilIcon = <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" /></>;
const SearchIcon = <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></>;
const DownloadIcon = <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>;

export default function RecordsTable({
  rows, glitchMap, highlightId, onEdit, dateLabel,
  search, setSearch, showIssuesOnly, setShowIssuesOnly,
}: {
  rows: Row[];
  glitchMap: Map<string, Glitch[]>;
  highlightId: string | null;
  onEdit: (r: Row) => void;
  dateLabel: string;
  search: string; setSearch: (s: string) => void;
  showIssuesOnly: boolean; setShowIssuesOnly: (v: boolean) => void;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "Date", dir: "desc" });
  const [colF, setColF] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);

  // Distinct values per column decide dropdown-vs-text, and populate the dropdown.
  const distinct = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const c of COLUMNS) {
      if (c.type === "url" || c.type === "num" || c.key === "Date") continue;
      const s = new Set<string>();
      for (const r of rows) { const v = (r[c.key] ?? "").trim(); if (v) { s.add(v); if (s.size > SELECT_MAX) break; } }
      if (s.size <= SELECT_MAX) m[c.key] = [...s].sort((a, b) => a.localeCompare(b));
    }
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const active = Object.entries(colF).filter(([, v]) => v);
    return rows.filter(r => {
      if (showIssuesOnly && !glitchMap.has(r._id)) return false;
      if (q && !Object.entries(r).some(([k, v]) => !k.startsWith("_") && v?.toLowerCase().includes(q))) return false;
      for (const [k, v] of active) {
        const cell = (r[k] ?? "").trim();
        // Dropdown columns match exactly; free-text columns match on substring.
        if (distinct[k] ? cell !== v : !cell.toLowerCase().includes(v.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, search, colF, showIssuesOnly, glitchMap, distinct]);

  const sorted = useMemo(() => {
    const col = COLUMNS.find(c => c.key === sort.key);
    const mul = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = (a[sort.key] ?? "").trim(), bv = (b[sort.key] ?? "").trim();
      if (!av && !bv) return 0;
      if (!av) return 1;            // blanks sink to the bottom either direction
      if (!bv) return -1;
      if (col?.type === "date") {
        const ad = parseRowDate(av), bd = parseRowDate(bv);
        return mul * ((ad ? +ad : 0) - (bd ? +bd : 0));
      }
      if (col?.type === "time") return mul * fmtTime(av).localeCompare(fmtTime(bv));
      if (col?.type === "num") {
        const an = parseFloat(av), bn = parseFloat(bv);
        if (!isNaN(an) && !isNaN(bn)) return mul * (an - bn);
      }
      return mul * av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = useMemo(
    () => sorted.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [sorted, safePage, pageSize]);

  // Any change to the result set sends you back to page 1.
  useEffect(() => { setPage(0); }, [search, colF, showIssuesOnly, pageSize, sort]);

  // When the app deep-links to a row, jump to whichever page holds it.
  useEffect(() => {
    if (!highlightId) return;
    const i = sorted.findIndex(r => r._id === highlightId);
    if (i >= 0) setPage(Math.floor(i / pageSize));
  }, [highlightId, sorted, pageSize]);

  const issueCount = useMemo(() => rows.filter(r => glitchMap.has(r._id)).length, [rows, glitchMap]);
  const activeFilters = Object.entries(colF).filter(([, v]) => v);
  const toggleSort = (key: string) =>
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });

  const cell = (row: Row, c: Col) => {
    const raw = (row[c.key] ?? "").trim();
    if (!raw) return <span className="text-slate-300">—</span>;
    if (c.type === "date") {
      const d = parseRowDate(raw);
      return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : raw;
    }
    if (c.type === "time") return <span className="tabular-nums">{fmtTime(raw)}</span>;
    if (c.type === "url" && /^https?:\/\//.test(raw)) {
      return <a href={raw} target="_blank" rel="noreferrer" className="text-green-600 hover:underline"
        title={raw}>{raw.replace(/^https?:\/\/(www\.)?/, "").slice(0, 34)}…</a>;
    }
    if (c.key === "VA Name") {
      return <span className="inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: vaColor(raw) }} />{raw}
      </span>;
    }
    return raw;
  };

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2.5 flex-wrap flex-shrink-0">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon d={SearchIcon} cls="w-4 h-4" /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search records…"
            className="bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm w-64 focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100" />
        </div>
        <button onClick={() => setShowIssuesOnly(!showIssuesOnly)}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border transition-colors ${showIssuesOnly ? "bg-red-50 border-red-300 text-red-700" : "bg-white border-slate-200 text-slate-600 hover:border-red-300 hover:text-red-600"}`}>
          <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
          Issues only ({fmtNum(issueCount)})
        </button>
        {(activeFilters.length > 0 || search) && (
          <button onClick={() => { setColF({}); setSearch(""); }}
            className="text-xs font-medium text-red-500 hover:text-red-600 hover:underline px-1">
            Clear {activeFilters.length > 0 ? `${activeFilters.length} column filter${activeFilters.length > 1 ? "s" : ""}` : "search"}
          </button>
        )}
        <span className="text-xs text-slate-400">
          <b className="text-slate-600">{fmtNum(sorted.length)}</b>
          {sorted.length !== rows.length && <> of {fmtNum(rows.length)}</>} records · {dateLabel}
        </span>
        <button onClick={() => exportCSV(sorted, `slf-records-${new Date().toISOString().slice(0, 10)}.csv`, COLUMNS.map(c => c.key))}
          className="ml-auto flex items-center gap-1.5 bg-white border border-slate-200 hover:border-green-400 hover:text-green-700 text-slate-600 text-xs font-medium px-3 py-2 rounded-xl transition-colors">
          <Icon d={DownloadIcon} /> Export CSV
        </button>
      </div>

      {/* ── Table: the only thing that scrolls ── */}
      <div className="flex-1 min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
          {/* The header and filter row stay mounted even with zero results —
              otherwise there is no way to undo the filter that emptied the table. */}
          <table className="text-xs border-separate border-spacing-0" style={{ minWidth: "100%" }}>
              <thead>
                {/* Header row — sortable */}
                <tr className="h-9">
                  <th className="sticky top-0 left-0 z-40 bg-slate-50 border-b border-r border-slate-200 px-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider" style={{ width: 92, minWidth: 92 }}>
                    Issues
                  </th>
                  {COLUMNS.map(c => {
                    const on = sort.key === c.key;
                    return (
                      <th key={c.key} style={{ width: c.w, minWidth: c.w }}
                        className="sticky top-0 z-30 bg-slate-50 border-b border-slate-200 px-3 text-left">
                        <button onClick={() => toggleSort(c.key)}
                          className={`flex items-center gap-1 w-full text-left text-[10px] font-bold uppercase tracking-wider transition-colors ${on ? "text-green-700" : "text-slate-400 hover:text-slate-600"}`}>
                          <span className="truncate">{c.label}</span>
                          <span className={`flex-shrink-0 ${on ? "" : "opacity-0 group-hover:opacity-40"}`}>
                            {on
                              ? <Icon d={sort.dir === "asc" ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M5 12l7 7 7-7" />} cls="w-3 h-3" />
                              : <Icon d={<path d="M8 9l4-4 4 4M8 15l4 4 4-4" />} cls="w-3 h-3" />}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                  <th className="sticky top-0 right-0 z-40 bg-slate-50 border-b border-l border-slate-200 px-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider" style={{ width: 72, minWidth: 72 }}>
                    Actions
                  </th>
                </tr>
                {/* Filter row */}
                <tr className="h-9">
                  <th className="sticky left-0 z-40 bg-white border-b border-r border-slate-200 px-2" style={{ top: 36 }} />
                  {COLUMNS.map(c => (
                    <th key={c.key} className="sticky z-30 bg-white border-b border-slate-200 px-1.5" style={{ top: 36 }}>
                      {distinct[c.key] ? (
                        <select value={colF[c.key] ?? ""} onChange={e => setColF(f => ({ ...f, [c.key]: e.target.value }))}
                          className={`w-full text-[11px] font-normal rounded-md border px-1.5 py-1 focus:outline-none cursor-pointer ${colF[c.key] ? "border-green-400 bg-green-50 text-green-800" : "border-slate-200 text-slate-500"}`}>
                          <option value="">All</option>
                          {distinct[c.key].map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      ) : (
                        <input value={colF[c.key] ?? ""} onChange={e => setColF(f => ({ ...f, [c.key]: e.target.value }))}
                          placeholder="Filter…"
                          className={`w-full text-[11px] font-normal rounded-md border px-1.5 py-1 focus:outline-none ${colF[c.key] ? "border-green-400 bg-green-50" : "border-slate-200"}`} />
                      )}
                    </th>
                  ))}
                  <th className="sticky right-0 z-40 bg-white border-b border-l border-slate-200" style={{ top: 36 }} />
                </tr>
              </thead>
              <tbody>
                {visible.map(row => {
                  const gs = glitchMap.get(row._id) ?? [];
                  const hot = row._id === highlightId;
                  const accent = gs[0] ? (GLITCH_ACCENT[gs[0].type] ?? "#94a3b8") : null;
                  // Sticky cells inherit the row background, so every state here
                  // must be FULLY OPAQUE — a translucent bg (bg-red-50/40) lets the
                  // scrolling middle columns show through the pinned ones.
                  const bg = hot ? "bg-yellow-50" : gs.length ? "bg-rose-50 hover:bg-rose-100" : "bg-white hover:bg-slate-50";
                  return (
                    <tr key={row._id} id={"row-" + row._id} className={`${bg} transition-colors`}>
                      <td className="sticky left-0 z-20 bg-inherit border-b border-r border-slate-100 px-3 py-2 align-top"
                        style={{ boxShadow: accent && !hot ? `inset 3px 0 0 ${accent}` : undefined }}>
                        {gs.length === 0
                          ? <span className="text-slate-200 text-[10px]">—</span>
                          : <div className="flex flex-col gap-0.5">
                            {gs.slice(0, 2).map((g, i) => (
                              <span key={i} title={g.detail}
                                className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-center leading-tight ${GLITCH_PILL[g.type] ?? "bg-slate-100 text-slate-600"}`}>
                                {GLITCH_LABELS[g.type] ?? g.type}
                              </span>
                            ))}
                            {gs.length > 2 && <span className="text-[9px] text-slate-400 text-center">+{gs.length - 2} more</span>}
                          </div>}
                      </td>
                      {COLUMNS.map(c => (
                        <td key={c.key} style={{ maxWidth: c.w }}
                          className="border-b border-slate-100 px-3 py-2 text-slate-600 truncate whitespace-nowrap"
                          title={(row[c.key] ?? "").trim() || undefined}>
                          {cell(row, c)}
                        </td>
                      ))}
                      <td className="sticky right-0 z-20 bg-inherit border-b border-l border-slate-100 px-2 py-2 text-center">
                        <button onClick={() => onEdit(row)} title="Edit record"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-green-700 hover:bg-green-50 border border-transparent hover:border-green-200 transition-colors">
                          <Icon d={PencilIcon} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
          </table>
          {visible.length === 0 && (
            // sticky+w-full pins this to the scroll viewport, so it stays centred
            // on screen instead of drifting off with the much wider table.
            <div className="sticky left-0 w-full py-16 flex flex-col items-center gap-2 text-slate-300">
              <Icon d={<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></>} cls="w-9 h-9" />
              <p className="text-sm">{showIssuesOnly ? "No issues match these filters" : "No records match these filters"}</p>
              {(activeFilters.length > 0 || search) && (
                <button onClick={() => { setColF({}); setSearch(""); }}
                  className="text-xs font-medium text-green-600 hover:underline">Clear filters</button>
              )}
            </div>
          )}
        </div>

        {/* ── Pager ── */}
        {sorted.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-t border-slate-200 bg-slate-50/60 flex-shrink-0">
            <span className="text-[11px] text-slate-500">
              {fmtNum(safePage * pageSize + 1)}–{fmtNum(Math.min((safePage + 1) * pageSize, sorted.length))} of {fmtNum(sorted.length)}
            </span>
            <select value={pageSize} onChange={e => setPageSize(+e.target.value)}
              className="text-[11px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white text-slate-600 cursor-pointer focus:outline-none">
              {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
            </select>
            <div className="ml-auto flex items-center gap-1">
              <button disabled={safePage === 0} onClick={() => setPage(0)}
                className="px-2 py-1 text-[11px] rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:border-slate-300">First</button>
              <button disabled={safePage === 0} onClick={() => setPage(p => p - 1)}
                className="px-2 py-1 text-[11px] rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:border-slate-300">Prev</button>
              <span className="text-[11px] text-slate-500 px-2 tabular-nums">Page {safePage + 1} / {pageCount}</span>
              <button disabled={safePage >= pageCount - 1} onClick={() => setPage(p => p + 1)}
                className="px-2 py-1 text-[11px] rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:border-slate-300">Next</button>
              <button disabled={safePage >= pageCount - 1} onClick={() => setPage(pageCount - 1)}
                className="px-2 py-1 text-[11px] rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:border-slate-300">Last</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
