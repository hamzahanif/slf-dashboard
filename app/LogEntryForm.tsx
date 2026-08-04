"use client";

import { useState, useEffect, useCallback } from "react";
import type { SessionPayload } from "@/lib/session";
import { toYMD, VOCAB, VA_SHIFT, VA_MEDIA_DEFAULT, normFbUrl } from "@/lib/dash";

const VA_NAMES = ["Mico Real", "Muhammad Salman", "Abdul Rehman", "Fazeela"];

// Options come from the shared vocabulary so they can never drift from what is
// actually stored. Previously this file hardcoded its own lists — Media offered
// "Photos/Video/None" against Yes/No data, and Action offered "Comment/Message/
// Skip" when 96% of rows are "New Listing".
const SHIFTS = VOCAB["Shift"].options;
const MEDIA_OPTIONS = VOCAB["Media Uploaded"].options;
const COMMENT_LEFT_OPTIONS = VOCAB["Comment Left (Script A)"].options;
const COMMENT_STATUS_OPTIONS = VOCAB["Comment Status"].options;
const ACTION_TYPE_OPTIONS = VOCAB["Action Type"].options;
const HANDOFF_NOTES_OPTIONS = VOCAB["Handoff Notes"].options;
const STATUS_NOTES_OPTIONS = VOCAB["Status / Notes"].options;

/** Today's LOCAL calendar date. Must not use toISOString(), which is UTC —
 *  in UTC+5 that returns yesterday for anything logged before 05:00 local,
 *  and with the date field locked a VA could not correct it. */
function today(): string {
  return toYMD(new Date());
}

/** Current local clock time as HH:MM, for the WP Post Time field's default. */
function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface Props {
  user: SessionPayload;
}

export default function LogEntryForm({ user }: Props) {
  const isAdmin = user.role === "admin";
  const defaultVaName = isAdmin ? "" : (user.vaName ?? "");

  // Pre-filled with the most common answer for each field, so a routine entry
  // only needs the group / URL / facility / listing ID typed in.
  const [form, setForm] = useState({
    Date: today(),
    vaName: defaultVaName,
    Shift: VA_SHIFT[defaultVaName] ?? "",
    "Facebook Group Name": "",
    "Direct Facebook Post URL": "",
    "Facility Name": "",
    "SLF Listing ID": "",
    "Media Uploaded": VA_MEDIA_DEFAULT[defaultVaName] ?? VOCAB["Media Uploaded"].default,
    "Comment Left (Script A)": VOCAB["Comment Left (Script A)"].default,
    "Comment Status": VOCAB["Comment Status"].default,
    "Action Type": VOCAB["Action Type"].default,
    "Promo Comment": VOCAB["Promo Comment"].default,
    // Defaults to right now — the date is already set above, so this field
    // only needs the clock time. Still editable for a slightly earlier post.
    "WP Post Time": nowTime(),
    "FB Account": "",
    "Handoff Notes": VOCAB["Handoff Notes"].default,
    "Status / Notes": VOCAB["Status / Notes"].default,
  });

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [confirmedDup, setConfirmedDup] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // How many listings this VA has already logged for the selected date, so
  // that's visible without leaving the form to check Records.
  const [dayCount, setDayCount] = useState<number | null>(null);
  const [dayCountLoading, setDayCountLoading] = useState(false);

  const refreshDayCount = useCallback(async (va: string, date: string) => {
    if (!va || !date) { setDayCount(null); return; }
    setDayCountLoading(true);
    try {
      const res = await fetch("/api/rows");
      const data = await res.json();
      const rows: { [k: string]: string }[] = data.rows ?? [];
      const n = rows.filter(r =>
        r["VA Name"]?.trim() === va && (r["Date"] ?? "").slice(0, 10) === date
      ).length;
      setDayCount(n);
    } catch { setDayCount(null); }
    finally { setDayCountLoading(false); }
  }, []);

  useEffect(() => { refreshDayCount(form.vaName, form.Date); }, [form.vaName, form.Date, refreshDayCount]);

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setResult(null);
    if (field === "Direct Facebook Post URL") { setDupWarning(null); setConfirmedDup(false); }
  }

  async function checkDuplicate(url: string) {
    if (!url.trim()) return;
    try {
      const res = await fetch("/api/rows");
      const data = await res.json();
      const rows: { [k: string]: string }[] = data.rows ?? [];
      const matches = rows.filter(r => r["Direct Facebook Post URL"] && normFbUrl(r["Direct Facebook Post URL"]) === normFbUrl(url));
      if (matches.length > 0) {
        const names = [...new Set(matches.map(r => r["VA Name"]?.trim()).filter(Boolean))].join(", ");
        setDupWarning(`⚠️ This URL was already submitted ${matches.length}× by: ${names}. Check before submitting.`);
      } else {
        setDupWarning(null);
      }
    } catch { /* silent */ }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vaName) { setResult({ error: "Please select a VA." }); return; }
    if (!form["Facebook Group Name"]) { setResult({ error: "Facebook Group Name is required." }); return; }
    if (!form["Direct Facebook Post URL"]) { setResult({ error: "Direct Facebook Post URL is required." }); return; }

    if (dupWarning && !confirmedDup) { setResult({ error: "This URL already exists. Click 'Submit anyway' to confirm." }); return; }
    setSessionExpired(false);   // clear any stale expiry banner on retry
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaName: form.vaName,
          Date: form.Date,
          Shift: form.Shift,
          "Facebook Group Name": form["Facebook Group Name"],
          "Direct Facebook Post URL": form["Direct Facebook Post URL"],
          "Facility Name": form["Facility Name"],
          "SLF Listing ID": form["SLF Listing ID"],
          "Media Uploaded": form["Media Uploaded"],
          "Comment Left (Script A)": form["Comment Left (Script A)"],
          "Comment Status": form["Comment Status"],
          "Action Type": form["Action Type"],
          "Promo Comment": form["Promo Comment"],
          "WP Post Time": form["WP Post Time"],
          "FB Account": form["FB Account"],
          "Handoff Notes": form["Handoff Notes"],
          "Status / Notes": form["Status / Notes"],
        }),
      });
      // The session JWT lasts 12h. A tab left open past that gets a bare 401,
      // which used to surface as "Not authenticated" with the entry lost. Keep
      // the form filled and tell them exactly what to do instead.
      if (res.status === 401) {
        setSessionExpired(true);
        setResult(null);
        return;
      }
      const data = await res.json();
      if (data.ok) {
        setResult({ ok: true });
        // Reset transient fields, keep Date and VA — a VA backfilling several
        // entries for one day shouldn't have to re-pick the date every time.
        // Clear only what changes per entry. Shift, FB account and every
        // dropdown go back to their default rather than to blank, so logging a
        // run of similar entries doesn't mean re-picking the same answers.
        setForm(f => ({
          ...f,
          Shift: f.Shift,
          "Facebook Group Name": "",
          "Direct Facebook Post URL": "",
          "Facility Name": "",
          "SLF Listing ID": "",
          "Media Uploaded": VA_MEDIA_DEFAULT[f.vaName] ?? VOCAB["Media Uploaded"].default,
          "Comment Left (Script A)": VOCAB["Comment Left (Script A)"].default,
          "Comment Status": VOCAB["Comment Status"].default,
          "Action Type": VOCAB["Action Type"].default,
          "Promo Comment": VOCAB["Promo Comment"].default,
          // Reset to the current time for the next listing, not blank.
          "WP Post Time": nowTime(),
          "FB Account": f["FB Account"],
          "Handoff Notes": VOCAB["Handoff Notes"].default,
          "Status / Notes": VOCAB["Status / Notes"].default,
        }));
        refreshDayCount(form.vaName, form.Date);
      } else {
        setResult({ error: data.error ?? "Submission failed." });
      }
    } catch (err) {
      setResult({ error: String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-green-700 px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-white font-bold text-lg">Log New Entry</h2>
            <p className="text-green-200 text-sm mt-0.5">Fill in the details and submit — data goes straight to your Google Sheet.</p>
          </div>
          {/* Daily count for the selected VA + date, so this doesn't require a
              trip to Records to check "today's entries". */}
          {form.vaName && (
            <div className="shrink-0 bg-green-800/60 rounded-xl px-4 py-2 text-center">
              <div className="text-white font-bold text-xl leading-none">
                {dayCountLoading ? "…" : dayCount ?? "—"}
              </div>
              <div className="text-green-200 text-[11px] mt-1 whitespace-nowrap">
                logged {form.Date === toYMD(new Date()) ? "today" : `on ${form.Date}`}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* Section: Basic Info */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Basic Info</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Date <span className="text-red-400">*</span></label>
                {/* Defaults to today but is editable, so a VA can backfill. */}
                <input type="date" value={form.Date}
                  onChange={e => set("Date", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">VA Name <span className="text-red-400">*</span></label>
                {isAdmin ? (
                  <select value={form.vaName}
                    onChange={e => {
                      // Each VA works one fixed shift and has their own typical
                      // answer for Media Uploaded, so refill both when an admin
                      // picks who they're logging for.
                      const va = e.target.value;
                      setForm(f => ({
                        ...f, vaName: va,
                        Shift: VA_SHIFT[va] ?? f.Shift,
                        "Media Uploaded": VA_MEDIA_DEFAULT[va] ?? VOCAB["Media Uploaded"].default,
                      }));
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 bg-white">
                    <option value="">Select VA…</option>
                    {VA_NAMES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                ) : (
                  <input type="text" value={form.vaName} readOnly
                    className="w-full border border-slate-100 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Shift</label>
                <select value={form.Shift} onChange={e => set("Shift", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 bg-white">
                  <option value="">Select shift…</option>
                  {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Section: Activity */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Activity</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Facebook Group Name <span className="text-red-400">*</span></label>
                  <input type="text" value={form["Facebook Group Name"]}
                    onChange={e => set("Facebook Group Name", e.target.value)}
                    placeholder="e.g. Sober Living Homes Network"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Facility Name</label>
                  <input type="text" value={form["Facility Name"]}
                    onChange={e => set("Facility Name", e.target.value)}
                    placeholder="Name of the sober living facility"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Direct Facebook Post URL <span className="text-red-400">*</span></label>
                <input type="url" value={form["Direct Facebook Post URL"]}
                  onChange={e => set("Direct Facebook Post URL", e.target.value)}
                  onBlur={e => checkDuplicate(e.target.value)}
                  placeholder="https://www.facebook.com/groups/..."
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 ${dupWarning ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}
                />
                {dupWarning && (
                  <div className="mt-1.5 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <span className="text-amber-600 text-xs leading-relaxed flex-1">{dupWarning}</span>
                    <button type="button" onClick={() => { setDupWarning(null); setConfirmedDup(true); }}
                      className="text-[10px] font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded whitespace-nowrap">
                      Submit anyway
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">FB Account</label>
                <input type="text" value={form["FB Account"]}
                  onChange={e => set("FB Account", e.target.value)}
                  placeholder="Facebook profile used"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
                />
              </div>
            </div>
          </div>

          {/* Section: Listing */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Listing</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">SLF Listing ID</label>
                <input type="text" value={form["SLF Listing ID"]}
                  onChange={e => set("SLF Listing ID", e.target.value)}
                  placeholder="e.g. 1234"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Media Uploaded</label>
                <select value={form["Media Uploaded"]} onChange={e => set("Media Uploaded", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 bg-white">
                  <option value="">Select…</option>
                  {MEDIA_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">WP Post Time</label>
                {/* Time only — the date above already covers the date part, and
                    every stored value is a plain clock time anyway. Defaults to
                    now; still editable for a slightly earlier post. */}
                <input type="time" value={form["WP Post Time"]}
                  onChange={e => set("WP Post Time", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
                />
              </div>
            </div>
          </div>

          {/* Section: Comment */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Comment</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Comment Left (Script A)</label>
                <select value={form["Comment Left (Script A)"]} onChange={e => set("Comment Left (Script A)", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 bg-white">
                  <option value="">Select…</option>
                  {COMMENT_LEFT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Comment Status</label>
                <select value={form["Comment Status"]} onChange={e => set("Comment Status", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 bg-white">
                  <option value="">Select…</option>
                  {COMMENT_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Action Type</label>
                <select value={form["Action Type"]} onChange={e => set("Action Type", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 bg-white">
                  <option value="">Select…</option>
                  {ACTION_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Promo Comment</label>
              {/* Was a free-text box, but every row in the DB holds Yes or No. */}
              <select value={form["Promo Comment"]} onChange={e => set("Promo Comment", e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 bg-white">
                {VOCAB["Promo Comment"].options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>

          {/* Section: Outcome */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Outcome</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Handoff Notes</label>
                <select value={form["Handoff Notes"]} onChange={e => set("Handoff Notes", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 bg-white">
                  <option value="">Select…</option>
                  {HANDOFF_NOTES_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Status / Notes</label>
                {/* Free text with suggestions: pick a standard value or type one. */}
                <input type="text" list="status-notes-options" value={form["Status / Notes"]}
                  onChange={e => set("Status / Notes", e.target.value)}
                  placeholder="Optional"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
                />
                <datalist id="status-notes-options">
                  {STATUS_NOTES_OPTIONS.map(o => <option key={o} value={o} />)}
                </datalist>
              </div>
            </div>
          </div>

          {/* Status message */}
          {sessionExpired && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-amber-900 text-sm space-y-2">
              <p className="font-semibold">Your sign-in expired — nothing was lost.</p>
              <p>
                Sessions last 12 hours and this tab has been open longer. Your entry is
                still filled in below. Sign in again in a new tab, then come back and
                press Submit.
              </p>
              <a href="/login" target="_blank" rel="noreferrer"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-medium px-3 py-1.5 rounded-lg text-xs transition-colors">
                Open sign-in in a new tab
              </a>
            </div>
          )}
          {result?.ok && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-green-700 text-sm font-medium">
              Entry submitted successfully — it&apos;s now in the Google Sheet.
            </div>
          )}
          {result?.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
              {result.error}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={submitting}
              className="bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-xl text-sm transition-colors">
              {submitting ? "Submitting…" : "Submit Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
