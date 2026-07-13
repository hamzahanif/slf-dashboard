"use client";

import { useState, useEffect } from "react";

const SHIFTS = ["Morning", "Afternoon", "Evening", "Night"];
const MEDIA_OPTIONS = ["Photos", "Video", "None"];
const COMMENT_LEFT_OPTIONS = ["Yes", "No"];
const COMMENT_STATUS_OPTIONS = ["Pending", "Approved", "Rejected", "Live"];
const ACTION_TYPE_OPTIONS = ["Comment", "Message", "Skip"];
const HANDOFF_NOTES_OPTIONS = ["Live", "Not Live", "Pending", "Follow Up", "Other"];

const SELECT_FIELDS: Record<string, string[]> = {
  Shift: SHIFTS,
  "Media Uploaded": MEDIA_OPTIONS,
  "Comment Left (Script A)": COMMENT_LEFT_OPTIONS,
  "Comment Status": COMMENT_STATUS_OPTIONS,
  "Action Type": ACTION_TYPE_OPTIONS,
  "Handoff Notes": HANDOFF_NOTES_OPTIONS,
};
const TEXTAREA_FIELDS = ["Promo Comment", "Status / Notes", "Handoff Notes"];
const READONLY_FIELDS = ["VA Name", "Date"];
const HIDDEN_FIELDS = ["_sourceGid"];

interface Row {
  [key: string]: string;
}

interface Props {
  row: Row;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditRowModal({ row, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Row>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const initial: Row = {};
    for (const [k, v] of Object.entries(row)) {
      if (!HIDDEN_FIELDS.includes(k)) initial[k] = v ?? "";
    }
    setForm(initial);
  }, [row]);

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setError("");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceGid: row._sourceGid,
          vaName: row["VA Name"],
          url: row["Direct Facebook Post URL"] || undefined,
          facilityName: row["Facility Name"] || undefined,
          updates: form,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        onSaved();
        onClose();
      } else {
        setError(data.error ?? "Update failed.");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const displayFields = Object.keys(form).filter(k => !HIDDEN_FIELDS.includes(k));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-green-700 px-6 py-4 rounded-t-2xl flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">Edit Entry</h2>
            <p className="text-green-200 text-xs mt-0.5">
              {row["VA Name"]} · {row["Date"]} · {row["Facility Name"] || row["Facebook Group Name"] || ""}
            </p>
          </div>
          <button onClick={onClose}
            className="text-green-200 hover:text-white text-xl leading-none ml-4">✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {displayFields.map(field => {
            const isReadonly = READONLY_FIELDS.includes(field);
            const isSelect = field in SELECT_FIELDS;
            const isTextarea = TEXTAREA_FIELDS.includes(field) && !isSelect;

            if (isReadonly) {
              return (
                <div key={field}>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{field}</label>
                  <div className="w-full border border-slate-100 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-500">
                    {form[field] || "—"}
                  </div>
                </div>
              );
            }
            if (isSelect) {
              return (
                <div key={field}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{field}</label>
                  <select value={form[field] ?? ""} onChange={e => set(field, e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 bg-white">
                    <option value="">— select —</option>
                    {SELECT_FIELDS[field].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              );
            }
            if (isTextarea) {
              return (
                <div key={field}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{field}</label>
                  <textarea value={form[field] ?? ""} onChange={e => set(field, e.target.value)}
                    rows={2}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 resize-none"
                  />
                </div>
              );
            }
            return (
              <div key={field}>
                <label className="block text-xs font-medium text-slate-600 mb-1">{field}</label>
                <input type="text" value={form[field] ?? ""} onChange={e => set(field, e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
                />
              </div>
            );
          })}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-xl text-sm transition-colors">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
