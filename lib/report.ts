// Builds a self-contained HTML report from a filtered set of rows.
//
// Self-contained is the whole point: no external CSS, fonts, scripts or images,
// so the file can be emailed, opened offline, or printed to PDF and still look
// identical. It also carries the filters that produced it, so a manager reading
// it later knows exactly what they are looking at.
import {
  Row, ALL_VAS, INACTIVE_VAS, vaColor, vaOf,
  hasListing, hasWp, isLive, parseRowDate, toYMD, startOfWeek, addDays, daysBetween,
  wpHour, fmtNum, pct,
} from "./dash";

export interface ReportFilter { label: string; value: string }
export interface ReportOptions {
  title: string;
  subtitle?: string;
  generatedBy: string;
  filters: ReportFilter[];
  rows: Row[];
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// ── stats ─────────────────────────────────────────────────────────────────────
function summarise(rows: Row[]) {
  const total = rows.length;
  const live = rows.filter(isLive).length;
  const listings = rows.filter(hasListing).length;
  const published = rows.filter(r => hasListing(r) && hasWp(r)).length;
  const verified = rows.filter(r => hasListing(r) && hasWp(r) && isLive(r)).length;
  const days = new Set(rows.map(r => r["Date"]?.slice(0, 10)).filter(Boolean)).size;
  const distinct = (f: string) => new Set(rows.map(r => (r[f] ?? "").trim()).filter(Boolean)).size;
  return {
    total, live, listings, published, verified, days,
    liveRate: pct(live, total),
    groups: distinct("Facebook Group Name"),
    facilities: distinct("Facility Name"),
    perDay: days ? +(total / days).toFixed(1) : 0,
  };
}

function perVA(rows: Row[]) {
  const m = new Map<string, Row[]>();
  for (const r of rows) { const v = vaOf(r); if (!m.has(v)) m.set(v, []); m.get(v)!.push(r); }
  return [...m.entries()].map(([va, rs]) => {
    const live = rs.filter(isLive).length;
    const days = new Set(rs.map(r => r["Date"]?.slice(0, 10)).filter(Boolean)).size;
    return {
      va, total: rs.length, live, listings: rs.filter(hasListing).length,
      liveRate: pct(live, rs.length),
      perDay: days ? +(rs.length / days).toFixed(1) : 0,
      inactive: INACTIVE_VAS.has(va),
    };
  }).sort((a, b) => b.total - a.total);
}

function tally(rows: Row[], field: string) {
  const m = new Map<string, number>();
  for (const r of rows) { const v = (r[field] ?? "").trim() || "—"; m.set(v, (m.get(v) ?? 0) + 1); }
  return [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
}

// ── activity chart (inline SVG, one line per VA) ──────────────────────────────
function activitySvg(rows: Row[]) {
  const dates = rows.map(r => parseRowDate(r["Date"])).filter(Boolean) as Date[];
  if (dates.length < 2) return "";
  const lo = new Date(Math.min(...dates.map(d => +d)));
  const hi = new Date(Math.max(...dates.map(d => +d)));
  const span = daysBetween(lo, hi) + 1;
  const mode: "daily" | "weekly" | "monthly" = span <= 45 ? "daily" : span <= 200 ? "weekly" : "monthly";
  const key = (d: Date) =>
    mode === "daily" ? toYMD(d)
      : mode === "weekly" ? toYMD(startOfWeek(d))
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  const periods: string[] = [];
  if (mode === "monthly") {
    const c = new Date(lo.getFullYear(), lo.getMonth(), 1);
    while (c <= hi) { periods.push(key(c)); c.setMonth(c.getMonth() + 1); }
  } else {
    const step = mode === "weekly" ? 7 : 1;
    let c = mode === "weekly" ? startOfWeek(lo) : lo;
    while (c <= hi) { periods.push(key(c)); c = addDays(c, step); }
  }

  const counts = new Map<string, Map<string, number>>();
  const present = new Set<string>();
  for (const r of rows) {
    const d = parseRowDate(r["Date"]); if (!d) continue;
    const k = key(d), va = vaOf(r); present.add(va);
    if (!counts.has(k)) counts.set(k, new Map());
    const mm = counts.get(k)!; mm.set(va, (mm.get(va) ?? 0) + 1);
  }
  const vas = [...ALL_VAS.filter(v => present.has(v)), ...[...present].filter(v => !ALL_VAS.includes(v))];
  const series = vas.map(va => ({ va, color: vaColor(va), data: periods.map(p => counts.get(p)?.get(va) ?? 0) }));
  const max = Math.max(...series.flatMap(s => s.data), 1);

  const W = 900, H = 260, PT = 16, PR = 16, PB = 34, PL = 44;
  const cW = W - PL - PR, cH = H - PT - PB, n = periods.length;
  const x = (i: number) => PL + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
  const y = (v: number) => PT + cH - (v / max) * cH;
  const label = (k: string) => {
    if (mode === "monthly") { const [yy, mm] = k.split("-"); return new Date(+yy, +mm - 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" }); }
    return parseRowDate(k)!.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const every = Math.max(1, Math.ceil(n / 10));

  const grid = [0, .25, .5, .75, 1].map(f => {
    const yy = y(max * f);
    return `<line x1="${PL}" y1="${yy}" x2="${W - PR}" y2="${yy}" stroke="#e8edf3" stroke-width="1"/>
      <text x="${PL - 8}" y="${yy + 4}" text-anchor="end" font-size="11" fill="#94a3b8">${Math.round(max * f)}</text>`;
  }).join("");
  const lines = series.map(s =>
    `<polyline points="${s.data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"
      fill="none" stroke="${s.color}" stroke-width="${INACTIVE_VAS.has(s.va) ? 1.6 : 2.5}" stroke-linejoin="round"
      stroke-linecap="round" opacity="${INACTIVE_VAS.has(s.va) ? .45 : 1}"/>`).join("");
  const xlabels = periods.map((p, i) =>
    (i % every === 0 || i === n - 1)
      ? `<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="#94a3b8">${esc(label(p))}</text>` : ""
  ).join("");
  const legend = series.map(s =>
    `<span class="lg"><i style="background:${s.color}"></i>${esc(s.va)}${INACTIVE_VAS.has(s.va) ? " (inactive)" : ""}</span>`).join("");

  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Entries over time by VA">
    ${grid}${lines}${xlabels}</svg><div class="legend">${legend}</div>`;
}

// ── publishing heatmap ────────────────────────────────────────────────────────
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function heatmap(rows: Row[]) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  let total = 0;
  for (const r of rows) {
    const h = wpHour(r), d = parseRowDate(r["Date"]);
    if (h === null || !d) continue;
    grid[(d.getDay() + 6) % 7][h]++; total++;
  }
  if (!total) return "";
  const max = Math.max(...grid.flat());
  const RAMP = ["#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a", "#15803d"];
  const cell = (v: number) => v === 0 ? "#f6f8fa" : RAMP[Math.min(RAMP.length - 1, Math.floor((v / max) * RAMP.length))];
  const hr = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "a" : "p"}`;
  const head = `<tr><th></th>${Array.from({ length: 24 }, (_, h) =>
    `<th class="hh">${h % 3 === 0 ? hr(h) : ""}</th>`).join("")}</tr>`;
  const body = grid.map((rowv, d) =>
    `<tr><th class="dw">${DOW[d]}</th>${rowv.map(v =>
      `<td class="hc" style="background:${cell(v)}" title="${v}"></td>`).join("")}</tr>`).join("");
  return `<table class="heat">${head}${body}</table>
    <p class="muted">${fmtNum(total)} listings with a recorded WordPress publish time.</p>`;
}

// ── document ──────────────────────────────────────────────────────────────────
export function buildReportHtml(o: ReportOptions): string {
  const s = summarise(o.rows);
  const vas = perVA(o.rows);
  const maxVa = Math.max(...vas.map(v => v.total), 1);
  const now = new Date();

  const kpi = (label: string, value: string, sub: string, accent: string) => `
    <div class="kpi"><span class="bar" style="background:${accent}"></span>
      <p class="k-l">${esc(label)}</p><p class="k-v">${esc(value)}</p><p class="k-s">${esc(sub)}</p></div>`;

  const funnel = [
    { l: "Entries logged", v: s.total, c: "#64748b" },
    { l: "Listing ID assigned", v: s.listings, c: "#8b5cf6" },
    { l: "Published to WP", v: s.published, c: "#2563eb" },
    { l: "Verified live", v: s.verified, c: "#16a34a" },
  ].map((st, i, arr) => {
    const share = pct(st.v, s.total);
    const drop = i ? arr[i - 1].v - st.v : 0;
    return `<div class="fn">
      <div class="fn-h"><span>${esc(st.l)}</span><span><b>${fmtNum(st.v)}</b> · ${share}%</span></div>
      <div class="fn-t"><div class="fn-f" style="width:${Math.max(share, 1)}%;background:${st.c}"></div></div>
      ${i && drop > 0 ? `<p class="fn-d">−${fmtNum(drop)} dropped from previous step</p>` : ""}
    </div>`;
  }).join("");

  const vaRows = vas.map((v, i) => `
    <tr${v.inactive ? ' class="inact"' : ""}>
      <td class="rank">${i + 1}</td>
      <td><span class="dot" style="background:${vaColor(v.va)}"></span>${esc(v.va)}${v.inactive ? ' <span class="tag">Inactive</span>' : ""}</td>
      <td class="num"><b>${fmtNum(v.total)}</b></td>
      <td class="num">${fmtNum(v.listings)}</td>
      <td class="num">${fmtNum(v.live)}</td>
      <td class="num">${v.liveRate}%</td>
      <td class="num">${v.perDay}</td>
      <td class="shr"><div class="tr"><div class="tf" style="width:${(v.total / maxVa) * 100}%;background:${vaColor(v.va)}"></div></div></td>
    </tr>`).join("");

  const breakdown = (title: string, items: { label: string; n: number }[], cap = 8) => {
    const top = items.slice(0, cap);
    const mx = Math.max(...top.map(t => t.n), 1);
    return `<div class="card"><h3>${esc(title)}</h3><table class="bd">${top.map(t => `
      <tr><td class="bl">${esc(t.label)}</td><td class="num">${fmtNum(t.n)}</td>
      <td class="shr"><div class="tr"><div class="tf" style="width:${(t.n / mx) * 100}%;background:#94a3b8"></div></div></td></tr>`).join("")}
      </table>${items.length > cap ? `<p class="muted">+${items.length - cap} more · ${fmtNum(items.length)} distinct</p>` : ""}</div>`;
  };

  const chips = o.filters.length
    ? o.filters.map(f => `<span class="chip"><b>${esc(f.label)}</b> ${esc(f.value)}</span>`).join("")
    : `<span class="chip">No filters — all records</span>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)} — ${now.toLocaleDateString("en-GB")}</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#f1f5f9;color:#0f172a;
  font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:28px}
header{background:#15803d;color:#fff;border-radius:16px;padding:24px 28px;margin-bottom:18px}
header h1{margin:0;font-size:23px;letter-spacing:-.01em}
header p{margin:6px 0 0;color:#bbf7d0;font-size:13px}
.meta{margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.22);
  display:flex;flex-wrap:wrap;gap:8px}
.chip{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);
  border-radius:999px;padding:4px 11px;font-size:12px;color:#fff}
.chip b{color:#dcfce7;font-weight:600}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));margin-bottom:18px}
.kpi{position:relative;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px 16px 16px 20px;overflow:hidden}
.kpi .bar{position:absolute;left:0;top:0;bottom:0;width:4px}
.k-l{margin:0;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8}
.k-v{margin:6px 0 0;font-size:27px;font-weight:800;letter-spacing:-.02em}
.k-s{margin:3px 0 0;font-size:12px;color:#64748b}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:20px 22px;margin-bottom:16px}
.card h2{margin:0 0 4px;font-size:16px}
.card h3{margin:0 0 12px;font-size:13px;font-weight:700;text-transform:uppercase;
  letter-spacing:.05em;color:#94a3b8}
.card .sub{margin:0 0 16px;font-size:12.5px;color:#64748b}
.cols{display:grid;gap:16px;grid-template-columns:1fr 1fr}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:8px 10px;font-size:13px;border-bottom:1px solid #f1f5f9}
thead th{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:700}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td.rank{color:#cbd5e1;font-weight:700;width:26px}
tr.inact td{color:#94a3b8}
.tag{font-size:9.5px;font-weight:700;background:#f1f5f9;color:#94a3b8;
  border:1px solid #e2e8f0;border-radius:999px;padding:1px 6px}
.dot{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:7px;vertical-align:-1px}
.shr{width:120px}
.tr{height:7px;background:#f1f5f9;border-radius:99px;overflow:hidden}
.tf{height:100%;border-radius:99px}
.bd td{border:0;padding:5px 8px}
.bl{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chart{width:100%;height:auto;display:block}
.legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;padding-top:10px;border-top:1px solid #f1f5f9}
.lg{font-size:12px;color:#64748b;display:inline-flex;align-items:center;gap:6px}
.lg i{width:11px;height:11px;border-radius:3px;display:inline-block}
.fn{margin-bottom:12px}
.fn-h{display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px}
.fn-t{height:22px;background:#f1f5f9;border-radius:7px;overflow:hidden}
.fn-f{height:100%;border-radius:7px}
.fn-d{margin:4px 0 0;font-size:11px;color:#ef4444}
.heat{border-collapse:separate;border-spacing:2px;width:100%}
.heat th.hh{font-size:8.5px;color:#94a3b8;font-weight:600;padding:0;border:0}
.heat th.dw{font-size:10px;color:#94a3b8;font-weight:600;width:32px;padding:0 4px 0 0;border:0;text-align:left}
.heat td.hc{height:15px;border-radius:3px;padding:0;border:0}
.muted{margin:10px 0 0;font-size:11.5px;color:#94a3b8}
footer{text-align:center;color:#94a3b8;font-size:11.5px;padding:18px 0 6px}
@media print{
  body{background:#fff}
  .wrap{max-width:none;padding:0}
  .card,.kpi{break-inside:avoid;page-break-inside:avoid;border-color:#dbe2ea}
  header{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
@page{margin:14mm}
</style></head><body><div class="wrap">

<header>
  <h1>${esc(o.title)}</h1>
  <p>${esc(o.subtitle ?? "Sober Living Finder — VA Performance")} · generated ${esc(now.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }))} by ${esc(o.generatedBy)}</p>
  <div class="meta">${chips}</div>
</header>

<div class="grid">
  ${kpi("Total entries", fmtNum(s.total), `${s.days} active days`, "#0f172a")}
  ${kpi("Verified live", fmtNum(s.live), `${s.liveRate}% of entries`, "#16a34a")}
  ${kpi("Listings created", fmtNum(s.listings), `${pct(s.listings, s.total)}% of entries`, "#8b5cf6")}
  ${kpi("FB groups reached", fmtNum(s.groups), "distinct groups", "#2563eb")}
  ${kpi("Facilities listed", fmtNum(s.facilities), "distinct facilities", "#ec4899")}
  ${kpi("Entries per active day", String(s.perDay), "average", "#f59e0b")}
</div>

<div class="card">
  <h2>Activity over time</h2>
  <p class="sub">Entries per period, one line per VA.</p>
  ${activitySvg(o.rows) || '<p class="muted">Not enough data in range to plot a trend.</p>'}
</div>

<div class="cols">
  <div class="card">
    <h2>Listing pipeline</h2>
    <p class="sub">Cumulative — each stage is a subset of the one above.</p>
    ${funnel}
  </div>
  <div class="card">
    <h2>Publishing rhythm</h2>
    <p class="sub">When listings go live on WordPress, by weekday and hour.</p>
    ${heatmap(o.rows) || '<p class="muted">No WordPress publish times in range.</p>'}
  </div>
</div>

<div class="card">
  <h2>VA performance</h2>
  <p class="sub">Ranked by total entries.</p>
  <table>
    <thead><tr><th></th><th>VA</th><th class="num">Entries</th><th class="num">Listings</th>
      <th class="num">Live</th><th class="num">Live %</th><th class="num">Per day</th><th>Share</th></tr></thead>
    <tbody>${vaRows}</tbody>
  </table>
</div>

<div class="cols">
  ${breakdown("Top Facebook groups", tally(o.rows, "Facebook Group Name"))}
  ${breakdown("Shift split", tally(o.rows, "Shift"), 6)}
</div>
<div class="cols">
  ${breakdown("Action types", tally(o.rows, "Action Type"), 6)}
  ${breakdown("Handoff outcome", tally(o.rows, "Handoff Notes"), 8)}
</div>

<footer>Sober Living Finder · VA Performance Dashboard · ${fmtNum(o.rows.length)} records in this report</footer>
</div></body></html>`;
}

/** Trigger a download of the report. */
export function downloadReport(html: string, filename: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Open the report in a new tab, ready for Print → Save as PDF. */
export function openReport(html: string) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html); w.document.close();
  return true;
}

/**
 * Share the report. Uses the native share sheet when the browser supports
 * sharing files (mobile, Safari), otherwise downloads it and opens a pre-filled
 * email so the user can attach it — we never send anything on their behalf.
 */
export async function shareReport(html: string, filename: string, subject: string): Promise<"shared" | "fallback"> {
  const file = new File([html], filename, { type: "text/html" });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: subject, text: subject }); return "shared"; }
    catch { /* user cancelled, or the sheet failed — fall through */ }
  }
  downloadReport(html, filename);
  return "fallback";
}
