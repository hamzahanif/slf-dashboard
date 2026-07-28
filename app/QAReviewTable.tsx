"use client";

import { useState, useMemo, useEffect } from "react";
import { Row, vaColor, parseRowDate, rowKey, wpEditUrl, fmtNum } from "@/lib/dash";
import { exportCSV } from "@/lib/csv";

type QAStatus = "Pass" | "Fail" | "Duplicate" | "Pending" | "";
const DECISIONS = ["Pass", "Fail", "Duplicate"] as const;

/** Suggestions for the QA notes box. It stays a free-text field — these are
 *  offered via <datalist>, so a reviewer can pick one or type their own. */
const NOTE_PRESETS = [
  "Looks good",
  "Wrong Facebook group",
  "Duplicate listing",
  "Listing ID missing",
  "Listing not live",
  "Wrong facility name",
  "Media not uploaded",
  "Comment not posted",
  "Needs re-check",
];

const STATUS_STYLE: Record<string, string> = {
  Pass: "bg-green-100 text-green-700 border-green-300",
  Fail: "bg-red-100 text-red-700 border-red-300",
  Duplicate: "bg-purple-100 text-purple-700 border-purple-300",
  Pending: "bg-amber-100 text-amber-700 border-amber-300",
};
const STATUS_INK: Record<string, string> = {
  Pass: "text-green-600", Fail: "text-red-500",
  Duplicate: "text-purple-600", Pending: "text-amber-500",
};

function Icon({ d, cls = "w-4 h-4" }: { d: React.ReactNode; cls?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className={cls}>{d}</svg>;
}
const SearchIcon = <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></>;
const DownloadIcon = <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>;
const ExternalIcon = <><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>;

export default function QAReviewTable({ rows, dateLabel }: { rows: Row[]; dateLabel: string }) {
  const [reviews, setReviews] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<QAStatus | "all">("all");
  const [vaFilter, setVaFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  // Set when the API reports the checkmark columns don't exist yet.
  const [checksUnsupported, setChecksUnsupported] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/qa-review")
      .then(r => r.json())
      .then(d => { if (alive) setReviews(d.reviews ?? {}); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const statusOf = (r: Row): QAStatus => (reviews[rowKey(r)]?.["QA Status"] ?? "") as QAStatus;

  const allVAs = useMemo(
    () => [...new Set(rows.map(r => r["VA Name"]?.trim()).filter(Boolean))].sort() as string[],
    [rows]);

  const counts = useMemo(() => {
    const c = { Pass: 0, Fail: 0, Duplicate: 0, Pending: 0 };
    for (const r of rows) {
      const s = statusOf(r);
      if (s === "Pass" || s === "Fail" || s === "Duplicate") c[s]++; else c.Pending++;
    }
    return c;
  }, [rows, reviews]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (vaFilter !== "all" && r["VA Name"]?.trim() !== vaFilter) return false;
      if (statusFilter !== "all") {
        const s = statusOf(r);
        // "Pending" covers both an explicit Pending and never-reviewed.
        if (statusFilter === "Pending" ? (s !== "" && s !== "Pending") : s !== statusFilter) return false;
      }
      if (q && !Object.entries(r).some(([k, v]) => !k.startsWith("_") && v?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, vaFilter, statusFilter, search, reviews]);

  // Paginate: the full set runs to thousands of rows, and rendering them all
  // makes the page crawl. Note the page does NOT reset when `reviews` changes,
  // so marking a row Pass/Fail doesn't yank you back to page 1 mid-review.
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => visible.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [visible, safePage, pageSize]);
  useEffect(() => { setPage(0); }, [search, vaFilter, statusFilter, pageSize]);

  /** Upsert the whole review, overriding only the fields in `patch`. Every
   *  control on the row funnels through here so one field never clears another. */
  async function save(r: Row, patch: Partial<{
    status: QAStatus; notes: string; groupChecked: boolean; listingChecked: boolean;
  }>) {
    const k = rowKey(r);
    const cur = reviews[k] ?? {};
    const next = {
      status: (patch.status ?? cur["QA Status"] ?? "Pending") as QAStatus,
      notes: patch.notes ?? cur["QA Notes"] ?? "",
      groupChecked: patch.groupChecked ?? cur["Group Checked"] === "1",
      listingChecked: patch.listingChecked ?? cur["Listing Checked"] === "1",
    };
    setSaving(k);
    const d = parseRowDate(r["Date"]);
    try {
      const res = await fetch("/api/qa-review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowKey: k, vaName: r["VA Name"] ?? "",
          date: d ? d.toLocaleDateString("en-US") : r["Date"],
          url: r["Direct Facebook Post URL"] || undefined,
          facilityName: r["Facility Name"] || undefined,
          ...next,
        }),
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.checksPersisted === false) setChecksUnsupported(true);
        setReviews(p => ({
          ...p,
          [k]: {
            ...p[k], "Row Key": k,
            "QA Status": next.status,
            "QA Notes": next.notes,
            "Group Checked": next.groupChecked ? "1" : "",
            "Listing Checked": next.listingChecked ? "1" : "",
            ...(body?.reviewedBy ? { "Reviewed By": body.reviewedBy } : {}),
          },
        }));
      }
    } finally { setSaving(null); }
  }

  /** Small square check toggle used on the Group and Listing ID columns. */
  function CheckMark({ on, busy, onClick, label }: { on: boolean; busy: boolean; onClick: () => void; label: string }) {
    return (
      <button onClick={onClick} disabled={busy} title={on ? `${label}: verified — click to clear` : `Mark ${label} as verified`}
        aria-pressed={on}
        className={`w-5 h-5 rounded flex-shrink-0 border flex items-center justify-center transition-all disabled:opacity-40 ${on ? "bg-green-600 border-green-600 text-white" : "bg-white border-slate-300 text-transparent hover:border-green-400 hover:text-green-300"}`}>
        <Icon d={<polyline points="20 6 9 17 4 12" />} cls="w-3 h-3" />
      </button>
    );
  }

  return (
    // Capped width. Without this there is ~1500px of slack on a 27" monitor,
    // and whichever column is flexible swallows all of it. Capping keeps every
    // column at a sensible size instead of trading one bloated column for another.
    <div className="h-full min-h-0 flex flex-col gap-3 w-full max-w-[1600px]">
      {/* Shared suggestion list for every row's QA note box. */}
      <datalist id="qa-note-presets">
        {NOTE_PRESETS.map(n => <option key={n} value={n} />)}
      </datalist>

      {checksUnsupported && (
        <div className="flex-shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <b>Checkmarks aren&apos;t saving yet.</b> The database is missing the
          <code className="mx-1 px-1 py-0.5 rounded bg-amber-100 font-mono">group_checked</code>/
          <code className="mx-1 px-1 py-0.5 rounded bg-amber-100 font-mono">listing_checked</code>
          columns. Run <code className="mx-1 px-1 py-0.5 rounded bg-amber-100 font-mono">supabase/qa_reviews_add_checks.sql</code>
          in the Supabase SQL editor. QA decisions and notes are saving normally.
        </div>
      )}

      {/* Stat tiles double as status filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
        {(["Pending", "Pass", "Fail", "Duplicate"] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            className={`rounded-2xl border p-4 text-left transition-all hover:shadow-md ${statusFilter === s ? STATUS_STYLE[s] + " shadow-sm" : "bg-white border-slate-200"}`}>
            <div className={`text-2xl font-black tabular-nums ${statusFilter === s ? "" : STATUS_INK[s]}`}>
              {fmtNum(counts[s])}
            </div>
            <div className="text-xs text-slate-500 mt-1">{s === "Pending" ? "Unreviewed" : s}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon d={SearchIcon} cls="w-4 h-4" /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search entries…"
            className="bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm w-56 focus:outline-none focus:border-green-400" />
        </div>
        <select value={vaFilter} onChange={e => setVaFilter(e.target.value)}
          className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400">
          <option value="all">All VAs</option>
          {allVAs.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        {(statusFilter !== "all" || vaFilter !== "all" || search) && (
          <button onClick={() => { setStatusFilter("all"); setVaFilter("all"); setSearch(""); }}
            className="text-xs font-medium text-red-500 hover:text-red-600 hover:underline px-1">Clear filters</button>
        )}
        <span className="text-xs text-slate-400">
          <b className="text-slate-600">{fmtNum(visible.length)}</b>
          {visible.length !== rows.length && <> of {fmtNum(rows.length)}</>} entries · {dateLabel}
        </span>
        <button onClick={() => exportCSV(visible, `slf-qa-${new Date().toISOString().slice(0, 10)}.csv`)}
          className="ml-auto flex items-center gap-1.5 bg-white border border-slate-200 hover:border-green-400 hover:text-green-700 text-slate-600 text-xs font-medium px-3 py-2 rounded-xl transition-colors">
          <Icon d={DownloadIcon} cls="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      {/* Table — fills whatever height the screen gives it, no fixed cap */}
      <div className="flex-1 min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center gap-3">
            <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-400">Loading reviews…</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-300">
            <Icon d={<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />} cls="w-10 h-10" />
            <p className="text-sm">No entries match the current filter</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-xs border-separate border-spacing-0">
              <thead>
                <tr className="h-9">
                  {[
                    // Every column gets an explicit width so the split is deliberate.
                    // Leaving any of them to size themselves lets the longest text
                    // win the space, which is how Group/FB ended up at 455px while
                    // the notes box got 187. Mins let them shrink on a laptop.
                    { l: "Date", w: 100 },
                    { l: "Facility", w: 300, min: 150 },
                    { l: "Group / FB Post", w: 310, min: 170 },
                    { l: "Listing ID", w: 118 },
                    { l: "QA Notes", w: 330, min: 170 },
                    { l: "VA", w: 130 },
                  ].map(h => (
                    <th key={h.l} style={{ width: h.w, minWidth: h.min ?? h.w }}
                      className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 px-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {h.l}
                    </th>
                  ))}
                  <th style={{ width: 185, minWidth: 185 }}
                    className="sticky top-0 right-0 z-30 bg-slate-50 border-b border-l border-slate-200 px-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    QA Decision
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(r => {
                  const k = rowKey(r);
                  const status = statusOf(r);
                  const busy = saving === k;
                  const d = parseRowDate(r["Date"]);
                  const listingId = (r["SLF Listing ID"] ?? "").trim();
                  const group = (r["Facebook Group Name"] ?? "").trim();
                  const postUrl = (r["Direct Facebook Post URL"] ?? "").trim();
                  const va = (r["VA Name"] ?? "").trim();
                  const review = reviews[k];
                  const reviewedBy = review?.["Reviewed By"];
                  const groupOk = review?.["Group Checked"] === "1";
                  const listingOk = review?.["Listing Checked"] === "1";
                  // Opaque background is required: the QA Decision cell is pinned.
                  const bg = status === "Pass" ? "bg-green-50/60" : status === "Fail" ? "bg-red-50/60"
                    : status === "Duplicate" ? "bg-purple-50/60" : "bg-white";
                  return (
                    <tr key={k} className={`${bg} hover:brightness-[0.985] transition-all`}>
                      <td className="border-b border-slate-100 px-4 py-3 align-top text-slate-500 whitespace-nowrap">
                        {d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : (r["Date"] || "—")}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 align-top text-slate-700 font-medium">
                        <span className="line-clamp-2" title={r["Facility Name"]}>{r["Facility Name"]?.trim() || <span className="text-slate-300 font-normal">—</span>}</span>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 align-top">
                        <div className="flex items-start gap-2">
                          <CheckMark on={groupOk} busy={busy} label="Group / FB post"
                            onClick={() => save(r, { groupChecked: !groupOk })} />
                          <div className="min-w-0">
                            <span className="text-slate-600 line-clamp-2" title={group}>{group || <span className="text-slate-300">—</span>}</span>
                            {postUrl && (
                              <a href={postUrl} target="_blank" rel="noreferrer"
                                className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-green-600 hover:underline">
                                <Icon d={ExternalIcon} cls="w-3 h-3" /> View FB post
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 align-top whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <CheckMark on={listingOk} busy={busy} label="Listing ID"
                            onClick={() => save(r, { listingChecked: !listingOk })} />
                          {listingId ? (
                            <a href={wpEditUrl(listingId)} target="_blank" rel="noreferrer"
                              title="Open in WordPress admin"
                              className="inline-flex items-center gap-1 font-semibold text-green-600 hover:underline tabular-nums">
                              {listingId}<Icon d={ExternalIcon} cls="w-3 h-3" />
                            </a>
                          ) : <span className="text-slate-300">—</span>}
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2.5 align-top">
                        {/* Free-text field with suggestions: pick a preset from the
                            dropdown or type anything. Saves on blur / Enter. */}
                        <input
                          list="qa-note-presets"
                          defaultValue={review?.["QA Notes"] ?? ""}
                          disabled={busy}
                          placeholder="Add QA note…"
                          onBlur={e => {
                            const v = e.target.value.trim();
                            if (v !== (review?.["QA Notes"] ?? "")) save(r, { notes: v });
                          }}
                          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          className="w-full text-xs rounded-lg border border-slate-200 px-2 py-1.5 bg-white focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 disabled:opacity-50" />
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 align-top whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: vaColor(va) }} />
                          {va || "—"}
                        </span>
                      </td>
                      <td className={`sticky right-0 z-10 ${bg} border-b border-l border-slate-100 px-3 py-3 align-top`}>
                        <div className="flex items-center gap-1">
                          {DECISIONS.map(s => (
                            <button key={s} disabled={busy} onClick={() => save(r, { status: status === s ? "Pending" : s })}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all disabled:opacity-40 ${status === s ? STATUS_STYLE[s] : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                              {busy && status === s ? "…" : s}
                            </button>
                          ))}
                        </div>
                        {reviewedBy && <p className="text-[10px] text-slate-400 mt-1 truncate" title={reviewedBy}>by {reviewedBy}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && visible.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-t border-slate-200 bg-slate-50/60 flex-shrink-0">
            <span className="text-[11px] text-slate-500">
              {fmtNum(safePage * pageSize + 1)}–{fmtNum(Math.min((safePage + 1) * pageSize, visible.length))} of {fmtNum(visible.length)}
            </span>
            <select value={pageSize} onChange={e => setPageSize(+e.target.value)}
              className="text-[11px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white text-slate-600 cursor-pointer focus:outline-none">
              {[50, 100, 250, 1000].map(n => <option key={n} value={n}>{n} / page</option>)}
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
