"use client";

import { useState } from "react";
import type { SessionPayload } from "@/lib/session";

const VA_NAMES = ["Mico Real", "Muhammad Salman", "Abdul Rehman", "Fazeela"];

const SHIFTS = ["Morning", "Afternoon", "Evening", "Night"];
const MEDIA_OPTIONS = ["Photos", "Video", "None"];
const COMMENT_LEFT_OPTIONS = ["Yes", "No"];
const COMMENT_STATUS_OPTIONS = ["Pending", "Approved", "Rejected", "Live"];
const ACTION_TYPE_OPTIONS = ["Comment", "Message", "Skip"];
const HANDOFF_NOTES_OPTIONS = ["Live", "Not Live", "Pending", "Follow Up", "Other"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  user: SessionPayload;
}

export default function LogEntryForm({ user }: Props) {
  const isAdmin = user.role === "admin";
  const defaultVaName = isAdmin ? "" : (user.vaName ?? "");

  const [form, setForm] = useState({
    Date: today(),
    vaName: defaultVaName,
    Shift: "",
    "Facebook Group Name": "",
    "Direct Facebook Post URL": "",
    "Facility Name": "",
    "SLF Listing ID": "",
    "Media Uploaded": "",
    "Comment Left (Script A)": "",
    "Comment Status": "",
    "Action Type": "",
    "Promo Comment": "",
    "WP Post Time": "",
    "FB Account": "",
    "Handoff Notes": "",
    "Status / Notes": "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [confirmedDup, setConfirmedDup] = useState(false);

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
      const norm = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^(www\.|m\.|web\.)/, "").replace(/\?.*$/, "").replace(/\/$/, "");
      const matches = rows.filter(r => r["Direct Facebook Post URL"] && norm(r["Direct Facebook Post URL"]) === norm(url));
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
      const data = await res.json();
      if (data.ok) {
        setResult({ ok: true });
        // Reset transient fields, keep Date and VA
        setForm(f => ({
          ...f,
          Shift: "",
          "Facebook Group Name": "",
          "Direct Facebook Post URL": "",
          "Facility Name": "",
          "SLF Listing ID": "",
          "Media Uploaded": "",
          "Comment Left (Script A)": "",
          "Comment Status": "",
          "Action Type": "",
          "Promo Comment": "",
          "WP Post Time": "",
          "FB Account": f["FB Account"],
          "Handoff Notes": "",
          "Status / Notes": "",
        }));
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
        <div className="bg-green-700 px-6 py-4">
          <h2 className="text-white font-bold text-lg">Log New Entry</h2>
          <p className="text-green-200 text-sm mt-0.5">Fill in the details and submit — data goes straight to your Google Sheet.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* Section: Basic Info */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Basic Info</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Date <span className="text-red-400">*</span></label>
                <input type="date" value={form.Date}
                  onChange={e => set("Date", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">VA Name <span className="text-red-400">*</span></label>
                {isAdmin ? (
                  <select value={form.vaName} onChange={e => set("vaName", e.target.value)}
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
                  <label className="block text-xs font-medium text-slate-600 mb-1">FB Account</label>
                  <input type="text" value={form["FB Account"]}
                    onChange={e => set("FB Account", e.target.value)}
                    placeholder="Facebook profile used"
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
                <label className="block text-xs font-medium text-slate-600 mb-1">Facility Name</label>
                <input type="text" value={form["Facility Name"]}
                  onChange={e => set("Facility Name", e.target.value)}
                  placeholder="Name of the sober living facility"
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
                <input type="datetime-local" value={form["WP Post Time"]}
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
              <textarea value={form["Promo Comment"]}
                onChange={e => set("Promo Comment", e.target.value)}
                rows={2}
                placeholder="Paste the promo comment text if applicable"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 resize-none"
              />
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
                <input type="text" value={form["Status / Notes"]}
                  onChange={e => set("Status / Notes", e.target.value)}
                  placeholder="Any additional notes"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
                />
              </div>
            </div>
          </div>

          {/* Status message */}
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
