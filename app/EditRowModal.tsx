"use client";

import { useState, useEffect } from "react";
import { parseRowDate, toYMD, VOCAB } from "@/lib/dash";
import type { SessionPayload } from "@/lib/session";

// Driven by the shared vocabulary so the edit modal, the log form and the
// stored data can never disagree about what a column may contain.
const SELECT_FIELDS: Record<string, string[]> = Object.fromEntries(
  Object.entries(VOCAB)
    .filter(([, v]) => v.options.length > 0)
    .map(([field, v]) => [field, v.options])
);
const TEXTAREA_FIELDS: string[] = [];
const READONLY_FIELDS = ["VA Name"];
/** Rendered as a date picker. Editable here, but locked on the Log Entry form. */
const DATE_FIELDS = ["Date"];
const HIDDEN_FIELDS = ["_id", "_sourceSheet"];

/** Coerce whatever the row holds into the YYYY-MM-DD an <input type="date"> needs. */
function toDateInput(v: string) {
  const d = parseRowDate(v ?? "");
  return d ? toYMD(d) : "";
}

interface Row {
  [key: string]: string;
}

interface Props {
  row: Row;
  user: SessionPayload;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditRowModal({ row, user, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Row>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Mirrors the server rule: admins may remove any entry, a VA only their own.
  // The API enforces this against the row's stored owner regardless of the UI.
  const owner = (row["VA Name"] ?? "").trim().toLowerCase();
  const canDelete = user.role === "admin" || (!!user.vaName && user.vaName.trim().toLowerCase() === owner);

  useEffect(() => {
    const initial: Row = {};
    for (const [k, v] of Object.entries(row)) {
      if (HIDDEN_FIELDS.includes(k)) continue;
      // Legacy rows can hold "Date(y,m,d)"; the picker needs YYYY-MM-DD.
      initial[k] = DATE_FIELDS.includes(k) ? toDateInput(v) : (v ?? "");
    }
    setForm(initial);
  }, [row]);

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setError("");
  }

  async function handleSave() {
    // An empty date would be written as NULL, which the entries table rejects —
    // and a row with no date drops out of every date-filtered view.
    if (!form["Date"]?.trim()) {
      setError("Date is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row._id,
          vaName: row["VA Name"],
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

  async function handleDelete() {
    setDeleting(true); setError("");
    try {
      const res = await fetch("/api/edit", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row._id }),
      });
      if (res.status === 401) { setError("Your sign-in expired. Sign in again, then retry."); return; }
      const data = await res.json();
      if (data.ok) { onSaved(); onClose(); }
      else setError(data.error ?? "Delete failed.");
    } catch (e) { setError(String(e)); }
    finally { setDeleting(false); }
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
            if (DATE_FIELDS.includes(field)) {
              return (
                <div key={field}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{field}</label>
                  <input type="date" value={form[field] ?? ""} onChange={e => set(field, e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
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

        </div>

        {/* Footer */}
        {/* Errors live in the footer, not the scrolling body — otherwise a
            validation message can render below the fold and look like nothing
            happened when Save is clicked. */}
        {/* Deleting is irreversible, so it takes a deliberate second click and
            names the record being removed. */}
        {confirmDelete && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-200 flex items-center gap-3 flex-wrap flex-shrink-0">
            <p className="text-sm text-red-800 flex-1 min-w-[200px]">
              Permanently delete <b>{row["Facility Name"]?.trim() || row["Facebook Group Name"]?.trim() || "this entry"}</b>
              {row["Date"] ? <> from {row["Date"]}</> : null}? This cannot be undone.
            </p>
            <button onClick={() => setConfirmDelete(false)} disabled={deleting}
              className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-white transition-colors">
              Keep it
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium px-4 py-1.5 rounded-lg text-sm transition-colors">
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
          </div>
        )}

        <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-3 flex-shrink-0">
          {canDelete && !confirmDelete && (
            <button onClick={() => { setConfirmDelete(true); setError(""); }}
              className="text-sm text-red-600 hover:text-red-700 hover:underline flex-shrink-0">
              Delete entry
            </button>
          )}
          {error && <p className="text-sm text-red-600 flex-1 min-w-0">{error}</p>}
          <div className="ml-auto flex gap-3 flex-shrink-0">
            <button onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving || deleting}
              className="bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-xl text-sm transition-colors">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
