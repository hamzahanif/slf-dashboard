"use client";

import { useState, useRef, useEffect } from "react";
import type { Row } from "@/lib/dash";
import { buildReportHtml, downloadReport, openReport, shareReport, type ReportFilter } from "@/lib/report";

function Icon({ d, cls = "w-3.5 h-3.5" }: { d: React.ReactNode; cls?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className={cls}>{d}</svg>;
}
const ShareIcon = <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></>;
const PrintIcon = <><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>;
const DownIcon = <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>;
const ChevIcon = <path d="M6 9l6 6 6-6" />;

export default function ExportReport({
  rows, title, subtitle, filters, generatedBy,
}: {
  rows: Row[];
  title: string;
  subtitle?: string;
  filters: ReportFilter[];
  generatedBy: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(t);
  }, [note]);

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `slf-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${stamp}.html`;
  const build = () => buildReportHtml({ title, subtitle, generatedBy, filters, rows });

  const act = async (kind: "open" | "download" | "share") => {
    setOpen(false);
    const html = build();
    if (kind === "download") { downloadReport(html, filename); setNote("Report downloaded."); return; }
    if (kind === "open") {
      const ok = openReport(html);
      setNote(ok ? "Opened in a new tab — use Print → Save as PDF." : "Pop-up blocked. Allow pop-ups, or use Download.");
      return;
    }
    const how = await shareReport(html, filename, `${title} — ${stamp}`);
    setNote(how === "shared"
      ? "Shared."
      : "Your browser can't share files directly, so the report was downloaded — attach it to an email to your manager.");
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} disabled={rows.length === 0}
        title={rows.length === 0 ? "Nothing to export for these filters" : "Export or share this report"}
        className="flex items-center gap-1.5 bg-white border border-slate-200 hover:border-green-400 hover:text-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 text-xs font-medium px-3 py-2 rounded-xl transition-colors">
        <Icon d={ShareIcon} /> Export report
        <Icon d={ChevIcon} cls="w-3 h-3 opacity-50" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-700">Report of the current view</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {rows.length.toLocaleString()} records · the filters you applied are printed on the report.
            </p>
          </div>
          <button onClick={() => act("open")}
            className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors">
            <span className="text-slate-400 mt-0.5"><Icon d={PrintIcon} /></span>
            <span><span className="block text-xs font-medium text-slate-700">Open &amp; print / save as PDF</span>
              <span className="block text-[11px] text-slate-400">Opens in a new tab, ready to print</span></span>
          </button>
          <button onClick={() => act("download")}
            className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors">
            <span className="text-slate-400 mt-0.5"><Icon d={DownIcon} /></span>
            <span><span className="block text-xs font-medium text-slate-700">Download HTML</span>
              <span className="block text-[11px] text-slate-400">Self-contained file — opens anywhere, offline</span></span>
          </button>
          <button onClick={() => act("share")}
            className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors border-t border-slate-100">
            <span className="text-slate-400 mt-0.5"><Icon d={ShareIcon} /></span>
            <span><span className="block text-xs font-medium text-slate-700">Share with a manager</span>
              <span className="block text-[11px] text-slate-400">Uses your device&apos;s share sheet where available</span></span>
          </button>
        </div>
      )}

      {note && (
        <div className="absolute right-0 mt-1 w-72 bg-slate-800 text-white text-[11px] rounded-lg px-3 py-2 shadow-lg z-50">
          {note}
        </div>
      )}
    </div>
  );
}
