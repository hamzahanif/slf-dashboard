"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Row, ALL_VAS, INACTIVE_VAS, vaColor, vaOf,
  hasListing, hasWp, isLive, isAccurate,
  parseRowDate, toYMD, startOfWeek, addDays, daysBetween, wpHour,
  filterByRange, fmtNum, pct,
} from "@/lib/dash";
import type { ReportFilter } from "@/lib/report";
import ExportReport from "./ExportReport";

type Preset = "today" | "yesterday" | "7d" | "30d" | "month" | "alltime" | "custom";
type Outcome = "all" | "live" | "notlive" | "nolisting" | "nowp";
type Gran = "daily" | "weekly" | "monthly";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" }, { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7d" }, { id: "30d", label: "Last 30d" },
  { id: "month", label: "This month" }, { id: "alltime", label: "All time" },
  { id: "custom", label: "Custom" },
];
const OUTCOMES: { id: Outcome; label: string }[] = [
  { id: "all", label: "All outcomes" }, { id: "live", label: "Live only" },
  { id: "notlive", label: "Not live" }, { id: "nolisting", label: "Missing listing ID" },
  { id: "nowp", label: "Missing WP time" },
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
/** The equally-long window immediately before `r`, for period-over-period deltas. */
function prevRange(r: [Date, Date] | null): [Date, Date] | null {
  if (!r) return null;
  const len = daysBetween(r[0], r[1]) + 1;
  return [addDays(r[0], -len), addDays(r[0], -1)];
}
function fmtRange(r: [Date, Date] | null, p: Preset) {
  if (!r) return "All time";
  const [s, e] = r, o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (p === "today") return `Today · ${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  if (p === "yesterday") return `Yesterday · ${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  if (s.toDateString() === e.toDateString()) return s.toLocaleDateString("en-US", o);
  return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", o)}`;
}

// ── Small UI atoms ────────────────────────────────────────────────────────────
function Card({ title, sub, right, children, className = "" }: {
  title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col ${className}`}>
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-bold text-slate-800 text-sm leading-tight">{title}</h2>
          {sub && <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{sub}</p>}
        </div>
        {right}
      </div>
      <div className="px-5 pb-5 flex-1">{children}</div>
    </section>
  );
}

function Empty({ h = "h-40", msg = "No data for these filters" }: { h?: string; msg?: string }) {
  return <div className={`${h} flex flex-col items-center justify-center gap-1.5 text-slate-300`}>
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 15h8M8 11h8" />
    </svg>
    <span className="text-xs">{msg}</span>
  </div>;
}

function SegBtn<T extends string>({ opts, value, onChange }: { opts: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
      {opts.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${value === o.id ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Multi-select dropdown with search — used for Shift / Group / Action filters. */
function MultiSelect({ label, options, selected, onChange, width = "w-56" }: {
  label: string; options: string[]; selected: Set<string>; onChange: (s: Set<string>) => void; width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const shown = q ? options.filter(o => o.toLowerCase().includes(q.toLowerCase())) : options;
  const n = selected.size;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${n ? "bg-green-50 border-green-300 text-green-800" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}>
        {label}{n > 0 && <span className="bg-green-600 text-white rounded-full px-1.5 text-[10px] font-bold">{n}</span>}
        <svg viewBox="0 0 24 24" className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className={`absolute z-40 mt-1 ${width} bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden`}>
          {options.length > 8 && (
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
              className="w-full px-3 py-2 text-xs border-b border-slate-100 focus:outline-none" />
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {shown.length === 0 && <p className="px-3 py-3 text-xs text-slate-400">No matches</p>}
            {shown.map(o => {
              const on = selected.has(o);
              return (
                <button key={o} onClick={() => {
                  const s = new Set(selected); if (on) s.delete(o); else s.add(o); onChange(s);
                }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-slate-50">
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${on ? "bg-green-600 border-green-600" : "border-slate-300"}`}>
                    {on && <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="4"><path d="M20 6L9 17l-5-5" /></svg>}
                  </span>
                  <span className="truncate text-slate-700">{o}</span>
                </button>
              );
            })}
          </div>
          {n > 0 && <button onClick={() => onChange(new Set())} className="w-full px-3 py-2 text-[11px] text-slate-500 hover:bg-slate-50 border-t border-slate-100">Clear {label.toLowerCase()}</button>}
        </div>
      )}
    </div>
  );
}

function Chip({ label, onRemove, color }: { label: string; onRemove: () => void; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full bg-white border border-slate-200 text-[11px] text-slate-600 shadow-sm">
      {color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />}
      <span className="max-w-[160px] truncate">{label}</span>
      <button onClick={onRemove} className="w-4 h-4 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 flex-shrink-0">
        <svg viewBox="0 0 24 24" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
    </span>
  );
}

// ── KPI tile with sparkline + period-over-period delta ────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div className="h-6" />;
  const max = Math.max(...data, 1), W = 100, H = 22;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - (v / max) * (H - 2) - 1}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-6 mt-1.5 overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity=".85" />
    </svg>
  );
}

function KpiTile({ label, value, suffix, delta, deltaUnit, spark, color, hint }: {
  label: string; value: number; suffix?: string; delta: number | null; deltaUnit: "%" | "pt";
  spark: number[]; color: string; hint?: string;
}) {
  const up = delta !== null && delta > 0, down = delta !== null && delta < 0;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow relative overflow-hidden group">
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: color }} />
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">{label}</p>
      <div className="flex items-baseline gap-1.5 mt-1.5">
        <span className="text-[26px] font-black tabular-nums leading-none text-slate-800">{fmtNum(value)}</span>
        {suffix && <span className="text-sm font-bold text-slate-400">{suffix}</span>}
      </div>
      <div className="flex items-center gap-1.5 mt-1.5 h-4">
        {delta !== null ? (
          <>
            <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${up ? "text-green-600" : down ? "text-red-500" : "text-slate-400"}`}>
              <svg viewBox="0 0 24 24" className={`w-3 h-3 ${down ? "rotate-180" : ""} ${delta === 0 ? "hidden" : ""}`} fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
              {delta === 0 ? "no change" : `${Math.abs(delta).toFixed(deltaUnit === "pt" ? 1 : 0)}${deltaUnit === "pt" ? "pt" : "%"}`}
            </span>
            <span className="text-[10px] text-slate-400">vs prev</span>
          </>
        ) : <span className="text-[10px] text-slate-300">{hint ?? "no prior period"}</span>}
      </div>
      <Sparkline data={spark} color={color} />
    </div>
  );
}

// ── Activity over time — stacked area by VA, with crosshair tooltip ───────────
function ActivityChart({ rows, range, vaList }: { rows: Row[]; range: [Date, Date] | null; vaList: string[] }) {
  const span = useMemo(() => {
    if (range) return daysBetween(range[0], range[1]) + 1;
    const ds = rows.map(r => parseRowDate(r["Date"])).filter(Boolean) as Date[];
    if (!ds.length) return 0;
    return daysBetween(new Date(Math.min(...ds.map(d => +d))), new Date(Math.max(...ds.map(d => +d)))) + 1;
  }, [rows, range]);
  const auto: Gran = span <= 45 ? "daily" : span <= 200 ? "weekly" : "monthly";
  const [gran, setGran] = useState<Gran | "auto">("auto");
  const g: Gran = gran === "auto" ? auto : gran;
  const [hi, setHi] = useState<number | null>(null);

  const { periods, series, totals, maxTotal } = useMemo(() => {
    const key = (d: Date) =>
      g === "daily" ? toYMD(d)
        : g === "weekly" ? toYMD(startOfWeek(d))
          : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const counts = new Map<string, Map<string, number>>();
    let lo: Date | null = null, hiD: Date | null = null;
    for (const r of rows) {
      const d = parseRowDate(r["Date"]); if (!d) continue;
      if (!lo || d < lo) lo = d; if (!hiD || d > hiD) hiD = d;
      const k = key(d), va = vaOf(r);
      if (!counts.has(k)) counts.set(k, new Map());
      const m = counts.get(k)!; m.set(va, (m.get(va) ?? 0) + 1);
    }
    // Dense period axis so gaps in activity are visible rather than collapsed.
    const start = range ? range[0] : lo, end = range ? range[1] : hiD;
    const periods: string[] = [];
    if (start && end) {
      if (g === "monthly") {
        const c = new Date(start.getFullYear(), start.getMonth(), 1);
        while (c <= end) { periods.push(`${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}`); c.setMonth(c.getMonth() + 1); }
      } else {
        const step = g === "weekly" ? 7 : 1;
        let c = g === "weekly" ? startOfWeek(start) : start;
        while (c <= end) { periods.push(toYMD(c)); c = addDays(c, step); }
      }
    }
    const series = vaList.map(va => ({ va, color: vaColor(va), data: periods.map(p => counts.get(p)?.get(va) ?? 0) }));
    const totals = periods.map((_, i) => series.reduce((s, x) => s + x.data[i], 0));
    return { periods, series, totals, maxTotal: Math.max(...totals, 1) };
  }, [rows, range, g, vaList]);

  const label = (k: string) => {
    if (g === "monthly") { const [y, m] = k.split("-"); return new Date(+y, +m - 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" }); }
    const d = parseRowDate(k)!;
    return (g === "weekly" ? "" : "") + d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  if (!periods.length) return <Empty h="h-56" />;

  const W = 720, H = 220, PT = 14, PR = 10, PB = 26, PL = 34;
  const cW = W - PL - PR, cH = H - PT - PB, n = periods.length;
  const xOf = (i: number) => PL + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
  const yOf = (v: number) => PT + cH - (v / maxTotal) * cH;

  // Cumulative stack, drawn back-to-front.
  const cum: number[][] = [];
  let running = new Array(n).fill(0);
  for (const s of series) { running = running.map((v, i) => v + s.data[i]); cum.push([...running]); }
  const every = Math.max(1, Math.ceil(n / 9));

  return (
    <div className="space-y-2.5">
      <div className="flex justify-end -mt-1">
        <SegBtn<Gran | "auto"> value={gran} onChange={setGran}
          opts={[{ id: "auto", label: `Auto (${auto})` }, { id: "daily", label: "Daily" }, { id: "weekly", label: "Weekly" }, { id: "monthly", label: "Monthly" }]} />
      </div>
      <div className="relative select-none">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible" onMouseLeave={() => setHi(null)}>
          {[0, .25, .5, .75, 1].map(v => {
            const y = yOf(maxTotal * v);
            return <g key={v}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={PL - 5} y={y + 3.5} textAnchor="end" fontSize="9" fill="#94a3b8">{Math.round(maxTotal * v)}</text>
            </g>;
          })}
          {cum.map((upper, si) => {
            const lower = si === 0 ? new Array(n).fill(0) : cum[si - 1];
            const d = `M${xOf(0)},${yOf(lower[0])}` +
              upper.map((v, i) => ` L${xOf(i)},${yOf(v)}`).join("") +
              [...lower].reverse().map((v, ri) => ` L${xOf(n - 1 - ri)},${yOf(v)}`).join("") + "Z";
            return <path key={series[si].va} d={d} fill={series[si].color} fillOpacity={INACTIVE_VAS.has(series[si].va) ? .3 : .68} stroke="white" strokeWidth="1" />;
          })}
          {periods.map((p, i) => {
            // Regular ticks, plus the final one — but only when it won't collide
            // with the last regular tick.
            const onTick = i % every === 0;
            const isLast = i === n - 1;
            if (!onTick && !isLast) return null;
            if (isLast && !onTick && (n - 1) % every < every * 0.6) return null;
            return <text key={p} x={xOf(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#94a3b8">{label(p)}</text>;
          })}
          {hi !== null && <line x1={xOf(hi)} y1={PT} x2={xOf(hi)} y2={PT + cH} stroke="#475569" strokeWidth="1" strokeDasharray="3 3" />}
          {periods.map((_, i) => (
            <rect key={i} x={xOf(i) - (n > 1 ? cW / (n - 1) : cW) / 2} y={PT} width={n > 1 ? cW / (n - 1) : cW} height={cH}
              fill="transparent" onMouseEnter={() => setHi(i)} />
          ))}
        </svg>
        {hi !== null && totals[hi] >= 0 && (
          <div className="absolute pointer-events-none bg-slate-900 text-white text-[11px] px-3 py-2 rounded-xl shadow-2xl z-20 min-w-[150px]"
            style={{ left: `${(xOf(hi) / W) * 100}%`, top: 4, transform: `translateX(${hi > n / 2 ? "-105%" : "5%"})` }}>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">{label(periods[hi])}</div>
            {series.filter(s => s.data[hi] > 0).sort((a, b) => b.data[hi] - a.data[hi]).map(s => (
              <div key={s.va} className="flex items-center justify-between gap-4 leading-5">
                <span className="flex items-center gap-1.5 text-slate-300"><span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />{s.va.split(" ")[0]}</span>
                <span className="font-bold tabular-nums">{s.data[hi]}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 mt-1 pt-1 border-t border-slate-700 font-bold">
              <span className="text-slate-400">Total</span><span className="tabular-nums">{totals[hi]}</span>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-slate-100">
        {series.map(s => (
          <span key={s.va} className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />{s.va}
            {INACTIVE_VAS.has(s.va) && <span className="text-[9px] text-slate-400">(inactive)</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Pipeline funnel ───────────────────────────────────────────────────────────
function Funnel({ rows }: { rows: Row[] }) {
  const t = rows.length;
  // Each stage must be a strict subset of the one above it, or the drop-off
  // numbers are meaningless (a row can carry a WP time without a listing ID).
  const stages = [
    { label: "Entries logged", v: t, c: "#64748b" },
    { label: "Listing ID assigned", v: rows.filter(hasListing).length, c: "#8b5cf6" },
    { label: "Published to WP", v: rows.filter(r => hasListing(r) && hasWp(r)).length, c: "#2563eb" },
    { label: "Verified live", v: rows.filter(r => hasListing(r) && hasWp(r) && isLive(r)).length, c: "#16a34a" },
  ];
  if (!t) return <Empty h="h-56" />;
  return (
    <div className="space-y-3">
      {stages.map((s, i) => {
        const share = pct(s.v, t);
        const prev = i === 0 ? null : stages[i - 1].v;
        const drop = prev !== null && prev > 0 ? prev - s.v : 0;
        return (
          <div key={s.label}>
            <div className="flex items-baseline justify-between mb-1 gap-2">
              <span className="text-[11px] font-medium text-slate-600 truncate">{s.label}</span>
              <span className="text-[11px] tabular-nums flex-shrink-0">
                <b className="text-slate-800">{fmtNum(s.v)}</b>
                <span className="text-slate-400"> · {share}%</span>
              </span>
            </div>
            <div className="h-7 bg-slate-100 rounded-lg overflow-hidden relative">
              <div className="h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-2"
                style={{ width: `${Math.max(share, 2)}%`, background: s.c }}>
                {share >= 22 && <span className="text-[10px] font-bold text-white">{share}%</span>}
              </div>
            </div>
            {i > 0 && drop > 0 && (
              <p className="text-[10px] text-slate-400 mt-1">
                <span className="text-red-500 font-semibold">−{fmtNum(drop)}</span> dropped from previous step
              </p>
            )}
          </div>
        );
      })}
      <div className="pt-2 mt-1 border-t border-slate-100 flex items-center justify-between">
        <span className="text-[11px] text-slate-500">End-to-end conversion</span>
        <span className="text-lg font-black tabular-nums text-green-600">{pct(stages[3].v, t)}%</span>
      </div>
    </div>
  );
}

// ── VA leaderboard — click a row to filter the whole page ─────────────────────
function Leaderboard({ rows, selected, onToggle }: { rows: Row[]; selected: Set<string>; onToggle: (va: string) => void }) {
  const per = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) { const v = vaOf(r); if (!m.has(v)) m.set(v, []); m.get(v)!.push(r); }
    return [...m.entries()].map(([va, rs]) => ({
      va, total: rs.length,
      live: rs.filter(isLive).length,
      acc: rs.filter(isAccurate).length,
      days: new Set(rs.map(r => r["Date"]?.slice(0, 10)).filter(Boolean)).size,
    })).map(x => ({ ...x, liveRate: pct(x.live, x.total), perDay: x.days ? +(x.total / x.days).toFixed(1) : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);
  if (!per.length) return <Empty />;
  const max = Math.max(...per.map(p => p.total), 1);
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <div className="space-y-1">
      {per.map((p, i) => {
        const c = vaColor(p.va), on = selected.has(p.va), dim = selected.size > 0 && !on;
        return (
          <button key={p.va} onClick={() => onToggle(p.va)}
            className={`w-full text-left px-2 py-2 rounded-xl transition-all ${on ? "bg-green-50 ring-1 ring-green-200" : "hover:bg-slate-50"} ${dim ? "opacity-40" : ""}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs w-5 flex-shrink-0">{medal[i] ?? <span className="text-slate-300 font-bold">{i + 1}</span>}</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: c }} />
              <span className={`text-xs font-semibold truncate flex-1 ${INACTIVE_VAS.has(p.va) ? "text-slate-400" : "text-slate-700"}`}>{p.va}</span>
              {INACTIVE_VAS.has(p.va) && <span className="text-[9px] font-bold px-1.5 py-px rounded-full bg-slate-100 text-slate-400 border border-slate-200 flex-shrink-0">Inactive</span>}
              <span className="text-xs font-black tabular-nums text-slate-800 flex-shrink-0">{fmtNum(p.total)}</span>
            </div>
            <div className="flex items-center gap-2 pl-7">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden flex">
                <div className="h-full transition-all duration-500" style={{ width: `${(p.live / max) * 100}%`, background: c }} />
                <div className="h-full transition-all duration-500" style={{ width: `${((p.total - p.live) / max) * 100}%`, background: c, opacity: .25 }} />
              </div>
              <span className="text-[10px] tabular-nums text-slate-400 w-24 text-right flex-shrink-0">
                <b className="text-slate-600">{p.liveRate}%</b> live · {p.perDay}/d
              </span>
            </div>
          </button>
        );
      })}
      <p className="text-[10px] text-slate-400 pt-2 mt-1 border-t border-slate-100">
        Solid = verified live, faded = remainder. Click a VA to filter the page.
      </p>
    </div>
  );
}

// ── Publishing rhythm: day-of-week × hour heatmap of WP post times ────────────
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function PublishHeatmap({ rows }: { rows: Row[] }) {
  const { grid, max, total, peak } = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
    let total = 0;
    for (const r of rows) {
      const h = wpHour(r), d = parseRowDate(r["Date"]);
      if (h === null || !d) continue;
      const dow = (d.getDay() + 6) % 7; // Mon=0
      grid[dow][h]++; total++;
    }
    let max = 0, peak = { d: 0, h: 0, v: 0 };
    for (let i = 0; i < 7; i++) for (let j = 0; j < 24; j++) {
      if (grid[i][j] > max) max = grid[i][j];
      if (grid[i][j] > peak.v) peak = { d: i, h: j, v: grid[i][j] };
    }
    return { grid, max, total, peak };
  }, [rows]);

  // Sequential single-hue ramp, light -> dark (never a rainbow).
  const RAMP = ["#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a", "#15803d"];
  const cell = (v: number) => v === 0 ? "#f8fafc" : RAMP[Math.min(RAMP.length - 1, Math.floor((v / max) * RAMP.length))];
  const [tip, setTip] = useState<{ d: number; h: number; v: number } | null>(null);
  const hr = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;

  if (!total) return <Empty msg="No WordPress post times in range" />;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="flex mb-1 pl-8">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex-1 text-center text-[8px] text-slate-400">{h % 3 === 0 ? hr(h) : ""}</div>
            ))}
          </div>
          {grid.map((rowv, d) => (
            <div key={d} className="flex items-center mb-0.5">
              <span className="w-8 text-[9px] text-slate-400 font-medium flex-shrink-0">{DOW[d]}</span>
              {rowv.map((v, h) => (
                <div key={h} className="flex-1 px-px" onMouseEnter={() => setTip({ d, h, v })} onMouseLeave={() => setTip(null)}>
                  <div className="h-5 rounded-sm transition-all hover:ring-2 hover:ring-slate-800 hover:ring-offset-1 cursor-default"
                    style={{ background: cell(v) }} title={`${DOW[d]} ${hr(h)} · ${v} listings`} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-slate-100">
        <p className="text-[11px] text-slate-500">
          Peak: <b className="text-slate-700">{DOW[peak.d]} {hr(peak.h)}</b> · {peak.v} listings
          <span className="text-slate-400"> · {fmtNum(total)} timed</span>
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400">Less</span>
          <div className="w-3.5 h-3.5 rounded-sm" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }} />
          {RAMP.map(c => <div key={c} className="w-3.5 h-3.5 rounded-sm" style={{ background: c }} />)}
          <span className="text-[10px] text-slate-400">More</span>
        </div>
      </div>
      {tip && tip.v > 0 && (
        <p className="text-[11px] text-slate-500 -mt-1">{DOW[tip.d]} at {hr(tip.h)} — <b className="text-slate-700">{tip.v}</b> listings published</p>
      )}
    </div>
  );
}

// ── Ranked list (FB groups, shifts, action types) — clickable to filter ───────
function RankedList({ items, onPick, selected, max: showMax = 8, valueLabel = "entries" }: {
  items: { label: string; v: number; sub?: string }[];
  onPick?: (label: string) => void; selected?: Set<string>; max?: number; valueLabel?: string;
}) {
  if (!items.length) return <Empty h="h-32" />;
  const top = items.slice(0, showMax);
  const max = Math.max(...top.map(i => i.v), 1);
  return (
    <div className="space-y-1.5">
      {top.map(it => {
        const on = selected?.has(it.label);
        const dim = selected && selected.size > 0 && !on;
        const Wrap = onPick ? "button" : "div";
        return (
          <Wrap key={it.label} {...(onPick ? { onClick: () => onPick(it.label) } : {})}
            className={`w-full text-left block rounded-lg px-2 py-1.5 transition-all ${onPick ? "hover:bg-slate-50 cursor-pointer" : ""} ${on ? "bg-green-50 ring-1 ring-green-200" : ""} ${dim ? "opacity-40" : ""}`}>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-[11px] text-slate-700 truncate font-medium">{it.label}</span>
              <span className="text-[11px] tabular-nums flex-shrink-0">
                <b className="text-slate-800">{fmtNum(it.v)}</b>
                {it.sub && <span className="text-slate-400"> · {it.sub}</span>}
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-slate-400 transition-all duration-500" style={{ width: `${(it.v / max) * 100}%` }} />
            </div>
          </Wrap>
        );
      })}
      {items.length > showMax && <p className="text-[10px] text-slate-400 pt-1">+{items.length - showMax} more · {fmtNum(items.length)} total distinct</p>}
      <span className="sr-only">{valueLabel}</span>
    </div>
  );
}

// ── Data health ───────────────────────────────────────────────────────────────
function DataHealth({ rows }: { rows: Row[] }) {
  const h = useMemo(() => {
    const skip = (r: Row) => /duplicate|skipped/i.test(r["Action Type"] ?? "");
    // VAs who have left the team can't fix anything, so their rows are excluded
    // from the score and the issue counts. They still seed the duplicate maps —
    // an active VA reposting one of their old URLs is still worth flagging.
    const live = rows.filter(r => !INACTIVE_VAS.has(vaOf(r)));
    const retired = rows.length - live.length;
    const urls = new Map<string, number>(), ids = new Map<string, number>();
    let dupUrl = 0, dupId = 0;
    for (const r of rows) {
      const actionable = !INACTIVE_VAS.has(vaOf(r));
      const u = (r["Direct Facebook Post URL"] ?? "").trim().toLowerCase();
      if (u) { const c = (urls.get(u) ?? 0); if (c && actionable) dupUrl++; urls.set(u, c + 1); }
      const id = (r["SLF Listing ID"] ?? "").trim();
      if (id) { const c = (ids.get(id) ?? 0); if (c && actionable) dupId++; ids.set(id, c + 1); }
    }
    const issues = [
      { label: "Missing listing ID", v: live.filter(r => !hasListing(r) && !skip(r)).length, c: "#f59e0b" },
      { label: "Missing WP post time", v: live.filter(r => !hasWp(r) && !skip(r)).length, c: "#2563eb" },
      { label: "Missing facility name", v: live.filter(r => !r["Facility Name"]?.trim()).length, c: "#ec4899" },
      { label: "Missing FB post URL", v: live.filter(r => !r["Direct Facebook Post URL"]?.trim()).length, c: "#8b5cf6" },
      { label: "Duplicate FB URL", v: dupUrl, c: "#ef4444" },
      { label: "Duplicate listing ID", v: dupId, c: "#dc2626" },
    ].sort((a, b) => b.v - a.v);
    const clean = live.filter(r =>
      (hasListing(r) || skip(r)) && (hasWp(r) || skip(r)) &&
      !!r["Facility Name"]?.trim() && !!r["Direct Facebook Post URL"]?.trim()).length;
    // Floor, not round — a single incomplete record must never display as 100%.
    const score = live.length ? Math.floor((clean / live.length) * 100) : 0;
    return { issues, clean, score, total: live.length, retired };
  }, [rows]);
  if (!rows.length) return <Empty h="h-32" />;
  const tone = h.score >= 85 ? "#16a34a" : h.score >= 60 ? "#f59e0b" : "#ef4444";
  const R = 34, C = 2 * Math.PI * R;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="flex-shrink-0">
        <svg viewBox="0 0 84 84" className="w-24 h-24">
          <g transform="rotate(-90 42 42)">
            <circle cx="42" cy="42" r={R} fill="none" stroke="#f1f5f9" strokeWidth="9" />
            <circle cx="42" cy="42" r={R} fill="none" stroke={tone} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${(h.score / 100) * C} ${C}`} className="transition-all duration-700" />
          </g>
          <text x="42" y="42" textAnchor="middle" fontSize="19" fontWeight="800" fill={tone}>{h.score}%</text>
          <text x="42" y="55" textAnchor="middle" fontSize="8" fill="#94a3b8">complete</text>
        </svg>
      </div>
      <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {h.issues.map(i => (
          <div key={i.label} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: i.v ? i.c : "#e2e8f0" }} />
            <span className="text-[11px] text-slate-500 flex-1 truncate">{i.label}</span>
            <span className={`text-[11px] font-bold tabular-nums ${i.v ? "text-slate-800" : "text-slate-300"}`}>{fmtNum(i.v)}</span>
          </div>
        ))}
        <p className="col-span-full text-[10px] text-slate-400 pt-2 mt-1 border-t border-slate-100">
          {fmtNum(h.clean)} of {fmtNum(h.total)} records complete. Rows marked <i>duplicate</i> or <i>skipped</i> are exempt from listing-ID and WP-time checks.
          {h.retired > 0 && <> {fmtNum(h.retired)} {h.retired === 1 ? "record" : "records"} from former team members excluded.</>}
        </p>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function DashboardHome({ rows, userName = "" }: { rows: Row[]; userName?: string }) {
  const [preset, setPreset] = useState<Preset>("30d");
  const [cs, setCs] = useState(""); const [ce, setCe] = useState("");
  const [vaSel, setVaSel] = useState<Set<string>>(new Set());
  const [shiftSel, setShiftSel] = useState<Set<string>>(new Set());
  const [groupSel, setGroupSel] = useState<Set<string>>(new Set());
  const [actionSel, setActionSel] = useState<Set<string>>(new Set());
  const [outcome, setOutcome] = useState<Outcome>("all");
  const [q, setQ] = useState("");

  // Options come from the full dataset so choices never vanish as you filter.
  const opts = useMemo(() => {
    const u = (f: (r: Row) => string) => [...new Set(rows.map(f).map(s => s.trim()).filter(Boolean))].sort();
    return { shifts: u(r => r["Shift"] ?? ""), groups: u(r => r["Facebook Group Name"] ?? ""), actions: u(r => r["Action Type"] ?? "") };
  }, [rows]);

  const range = useMemo(() => getRange(preset, cs, ce), [preset, cs, ce]);
  const prior = useMemo(() => prevRange(range), [range]);

  // Everything except the date window — so current and prior periods share filters.
  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (vaSel.size && !vaSel.has(vaOf(r))) return false;
      if (shiftSel.size && !shiftSel.has((r["Shift"] ?? "").trim())) return false;
      if (groupSel.size && !groupSel.has((r["Facebook Group Name"] ?? "").trim())) return false;
      if (actionSel.size && !actionSel.has((r["Action Type"] ?? "").trim())) return false;
      if (outcome === "live" && !isLive(r)) return false;
      if (outcome === "notlive" && isLive(r)) return false;
      if (outcome === "nolisting" && hasListing(r)) return false;
      if (outcome === "nowp" && hasWp(r)) return false;
      if (needle && !Object.values(r).some(v => v?.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [rows, vaSel, shiftSel, groupSel, actionSel, outcome, q]);

  const cur = useMemo(() => filterByRange(base, range), [base, range]);
  const pre = useMemo(() => filterByRange(base, prior), [base, prior]);

  const kpi = (rs: Row[]) => {
    const total = rs.length;
    const live = rs.filter(isLive).length;
    const days = new Set(rs.map(r => r["Date"]?.slice(0, 10)).filter(Boolean)).size;
    const distinct = (f: string) => new Set(rs.map(r => (r[f] ?? "").trim()).filter(Boolean)).size;
    return {
      total, live, days,
      liveRate: pct(live, total),
      groups: distinct("Facebook Group Name"),
      facilities: distinct("Facility Name"),
      perDay: days ? +(total / days).toFixed(1) : 0,
    };
  };
  const K = useMemo(() => kpi(cur), [cur]);
  const P = useMemo(() => kpi(pre), [pre]);
  const hasPrior = !!prior && pre.length > 0;
  const rel = (a: number, b: number) => (!hasPrior || !b) ? null : Math.round(((a - b) / b) * 100);
  const ptd = (a: number, b: number) => !hasPrior ? null : a - b;

  // Daily sparkline series over the active window.
  const sparks = useMemo(() => {
    const days: string[] = [];
    if (range) { let c = range[0]; while (c <= range[1] && days.length < 90) { days.push(toYMD(c)); c = addDays(c, 1); } }
    else {
      const ds = cur.map(r => parseRowDate(r["Date"])).filter(Boolean) as Date[];
      if (ds.length) { const mx = new Date(Math.max(...ds.map(d => +d))); for (let i = 29; i >= 0; i--) days.push(toYMD(addDays(mx, -i))); }
    }
    const mk = (f: (r: Row) => boolean) => {
      const m = new Map<string, number>();
      for (const r of cur) { if (!f(r)) continue; const d = parseRowDate(r["Date"]); if (d) { const k = toYMD(d); m.set(k, (m.get(k) ?? 0) + 1); } }
      return days.map(d => m.get(d) ?? 0);
    };
    // Distinct values touched per day (e.g. how many groups were worked that day).
    const mkDistinct = (field: string) => {
      const m = new Map<string, Set<string>>();
      for (const r of cur) {
        const v = (r[field] ?? "").trim(); if (!v) continue;
        const d = parseRowDate(r["Date"]); if (!d) continue;
        const k = toYMD(d); if (!m.has(k)) m.set(k, new Set()); m.get(k)!.add(v);
      }
      return days.map(d => m.get(d)?.size ?? 0);
    };
    const all = mk(() => true), live = mk(isLive);
    return {
      all, live,
      liveRate: all.map((t, i) => t ? Math.round((live[i] / t) * 100) : 0),
      groups: mkDistinct("Facebook Group Name"),
      facilities: mkDistinct("Facility Name"),
    };
  }, [cur, range]);

  const vaList = useMemo(() => {
    const present = new Set(cur.map(vaOf));
    const known = ALL_VAS.filter(v => present.has(v));
    const extra = [...present].filter(v => !ALL_VAS.includes(v)).sort();
    return [...known, ...extra];
  }, [cur]);

  const groupItems = useMemo(() => {
    const m = new Map<string, { v: number; live: number }>();
    for (const r of cur) {
      const g = (r["Facebook Group Name"] ?? "").trim(); if (!g) continue;
      if (!m.has(g)) m.set(g, { v: 0, live: 0 });
      const x = m.get(g)!; x.v++; if (isLive(r)) x.live++;
    }
    return [...m.entries()].map(([label, x]) => ({ label, v: x.v, sub: `${pct(x.live, x.v)}% live` })).sort((a, b) => b.v - a.v);
  }, [cur]);

  const simple = (field: string) => {
    const m = new Map<string, number>();
    for (const r of cur) { const k = (r[field] ?? "").trim() || "—"; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].map(([label, v]) => ({ label, v, sub: `${pct(v, cur.length)}%` })).sort((a, b) => b.v - a.v);
  };
  const shiftItems = useMemo(() => simple("Shift"), [cur]);
  const actionItems = useMemo(() => simple("Action Type"), [cur]);

  // Auto-generated highlights.
  const insights = useMemo(() => {
    const out: { k: string; v: string; tone: string }[] = [];
    const byVa = new Map<string, number>();
    for (const r of cur) byVa.set(vaOf(r), (byVa.get(vaOf(r)) ?? 0) + 1);
    const top = [...byVa.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) out.push({ k: "Top performer", v: `${top[0]} — ${fmtNum(top[1])} (${pct(top[1], cur.length)}% of all)`, tone: vaColor(top[0]) });
    const byDay = new Map<string, number>();
    for (const r of cur) { const d = parseRowDate(r["Date"]); if (d) { const k = toYMD(d); byDay.set(k, (byDay.get(k) ?? 0) + 1); } }
    const best = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) out.push({ k: "Busiest day", v: `${parseRowDate(best[0])!.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} — ${best[1]} entries`, tone: "#2563eb" });
    const byHour = new Map<number, number>();
    for (const r of cur) { const h = wpHour(r); if (h !== null) byHour.set(h, (byHour.get(h) ?? 0) + 1); }
    const ph = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0];
    if (ph) out.push({ k: "Peak publish hour", v: `${((ph[0] + 11) % 12) + 1}${ph[0] < 12 ? "am" : "pm"} — ${ph[1]} listings`, tone: "#8b5cf6" });
    const gap = cur.filter(r => !hasListing(r) && !/duplicate|skipped/i.test(r["Action Type"] ?? "") && !INACTIVE_VAS.has(vaOf(r))).length;
    out.push({ k: "Needs attention", v: gap ? `${fmtNum(gap)} ${gap === 1 ? "entry" : "entries"} missing a listing ID` : "No missing listing IDs", tone: gap ? "#ef4444" : "#16a34a" });
    return out;
  }, [cur]);

  const activeChips = [
    ...[...vaSel].map(v => ({ label: v, color: vaColor(v), clear: () => setVaSel(s => { const n = new Set(s); n.delete(v); return n; }) })),
    ...[...shiftSel].map(v => ({ label: `Shift: ${v}`, color: undefined, clear: () => setShiftSel(s => { const n = new Set(s); n.delete(v); return n; }) })),
    ...[...groupSel].map(v => ({ label: v, color: undefined, clear: () => setGroupSel(s => { const n = new Set(s); n.delete(v); return n; }) })),
    ...[...actionSel].map(v => ({ label: `Action: ${v}`, color: undefined, clear: () => setActionSel(s => { const n = new Set(s); n.delete(v); return n; }) })),
    ...(outcome !== "all" ? [{ label: OUTCOMES.find(o => o.id === outcome)!.label, color: undefined, clear: () => setOutcome("all") }] : []),
    ...(q.trim() ? [{ label: `“${q.trim()}”`, color: undefined, clear: () => setQ("") }] : []),
  ];
  const clearAll = () => { setVaSel(new Set()); setShiftSel(new Set()); setGroupSel(new Set()); setActionSel(new Set()); setOutcome("all"); setQ(""); };
  const toggleVa = (va: string) => setVaSel(s => { const n = new Set(s); if (n.has(va)) n.delete(va); else n.add(va); return n; });
  const label = fmtRange(range, preset);

  // Every active filter, described in words, so the exported report states the
  // exact view it was produced from.
  const reportFilters: ReportFilter[] = [
    { label: "Period", value: label },
    ...(vaSel.size ? [{ label: "VA", value: [...vaSel].join(", ") }] : []),
    ...(shiftSel.size ? [{ label: "Shift", value: [...shiftSel].join(", ") }] : []),
    ...(groupSel.size ? [{ label: "FB group", value: [...groupSel].join(", ") }] : []),
    ...(actionSel.size ? [{ label: "Action", value: [...actionSel].join(", ") }] : []),
    ...(outcome !== "all" ? [{ label: "Outcome", value: OUTCOMES.find(o => o.id === outcome)!.label }] : []),
    ...(q.trim() ? [{ label: "Search", value: q.trim() }] : []),
    { label: "Records", value: `${fmtNum(cur.length)} of ${fmtNum(rows.length)}` },
  ];

  return (
    <div className="space-y-4">
      {/* ── Sticky filter bar ── */}
      {/* Sticky only from lg up — below that the bar wraps to several rows and
          would eat half the viewport if pinned. */}
      <div className="lg:sticky lg:top-0 z-30 -mx-5 -mt-5 px-5 pt-4 pb-3 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => setPreset(p.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${preset === p.id ? "bg-green-600 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                {p.label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-1">
              <input type="date" value={cs} onChange={e => setCs(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-green-400" />
              <span className="text-slate-300 text-xs">–</span>
              <input type="date" value={ce} onChange={e => setCe(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-green-400" />
            </div>
          )}
          <div className="w-px h-6 bg-slate-200 mx-0.5 hidden sm:block" />
          <MultiSelect label="VA" options={ALL_VAS} selected={vaSel} onChange={setVaSel} width="w-48" />
          {opts.shifts.length > 0 && <MultiSelect label="Shift" options={opts.shifts} selected={shiftSel} onChange={setShiftSel} width="w-48" />}
          {opts.groups.length > 0 && <MultiSelect label="FB Group" options={opts.groups} selected={groupSel} onChange={setGroupSel} width="w-72" />}
          {opts.actions.length > 0 && <MultiSelect label="Action" options={opts.actions} selected={actionSel} onChange={setActionSel} width="w-56" />}
          <select value={outcome} onChange={e => setOutcome(e.target.value as Outcome)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer focus:outline-none ${outcome !== "all" ? "bg-green-50 border-green-300 text-green-800" : "bg-white border-slate-200 text-slate-600"}`}>
            {OUTCOMES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <div className="relative flex-1 min-w-[150px] max-w-xs">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search all fields…"
              className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:border-green-400" />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[11px]">
              <span className="text-slate-500">{label}</span><span className="text-slate-300">·</span>
              <span className="font-bold text-slate-800 tabular-nums">{fmtNum(cur.length)}</span>
              <span className="text-slate-400">of {fmtNum(rows.length)}</span>
            </div>
            <ExportReport rows={cur} title="Dashboard Report" filters={reportFilters} generatedBy={userName} />
          </div>
        </div>
        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filters</span>
            {activeChips.map((c, i) => <Chip key={i} label={c.label} color={c.color} onRemove={c.clear} />)}
            <button onClick={clearAll} className="text-[11px] font-medium text-red-500 hover:text-red-600 hover:underline ml-1">Clear all</button>
          </div>
        )}
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiTile label="Total entries" value={K.total} delta={rel(K.total, P.total)} deltaUnit="%" spark={sparks.all} color="#0f172a" />
        <KpiTile label="Verified live" value={K.live} delta={rel(K.live, P.live)} deltaUnit="%" spark={sparks.live} color="#16a34a" />
        <KpiTile label="Live rate" value={K.liveRate} suffix="%" delta={ptd(K.liveRate, P.liveRate)} deltaUnit="pt" spark={sparks.liveRate} color="#2563eb" />
        <KpiTile label="FB groups reached" value={K.groups} delta={rel(K.groups, P.groups)} deltaUnit="%" spark={sparks.groups} color="#8b5cf6" />
        <KpiTile label="Facilities listed" value={K.facilities} delta={rel(K.facilities, P.facilities)} deltaUnit="%" spark={sparks.facilities} color="#ec4899" />
        <KpiTile label="Entries per active day" value={K.perDay} delta={rel(K.perDay, P.perDay)} deltaUnit="%" spark={sparks.all} color="#f59e0b" hint={`${K.days} active days`} />
      </div>

      {/* ── Highlights ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3.5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-3">
        {insights.map(i => (
          <div key={i.k} className="flex items-start gap-2.5 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: i.tone }} />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">{i.k}</p>
              <p className="text-xs text-slate-700 font-medium leading-snug mt-0.5 truncate" title={i.v}>{i.v}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Trend + funnel ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title="Activity over time" sub={`Entries stacked by VA · ${label}`}>
          {cur.length ? <ActivityChart rows={cur} range={range} vaList={vaList} /> : <Empty h="h-56" />}
        </Card>
        <Card title="Listing pipeline" sub="Cumulative — each stage is a subset of the one above">
          <Funnel rows={cur} />
        </Card>
      </div>

      {/* ── Leaderboard + heatmap ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="VA leaderboard" sub={`Ranked by entries · ${label}`}
          right={vaSel.size > 0 ? <button onClick={() => setVaSel(new Set())} className="text-[11px] text-red-500 hover:underline">Reset</button> : undefined}>
          <Leaderboard rows={cur} selected={vaSel} onToggle={toggleVa} />
        </Card>
        <Card title="Publishing rhythm" sub="When listings actually go live on WordPress">
          <PublishHeatmap rows={cur} />
        </Card>
      </div>

      {/* ── Groups + breakdowns ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="xl:col-span-2" title="Top Facebook groups" sub="Click to filter the page">
          <RankedList items={groupItems} onPick={g => setGroupSel(s => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; })} selected={groupSel} max={8} />
        </Card>
        <Card title="Shift split" sub="Share of entries">
          <RankedList items={shiftItems} onPick={v => setShiftSel(s => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; })} selected={shiftSel} max={6} />
        </Card>
        <Card title="Action types" sub="Share of entries">
          <RankedList items={actionItems} onPick={v => setActionSel(s => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; })} selected={actionSel} max={6} />
        </Card>
      </div>

      {/* ── Data health ── */}
      <Card title="Data health" sub="Field completeness and duplicate checks on actionable records">
        <DataHealth rows={cur} />
      </Card>
    </div>
  );
}
