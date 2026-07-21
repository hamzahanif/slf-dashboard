import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchPages(buildQuery: (base: any) => any): Promise<Record<string, unknown>[]> {
  const PAGE = 1000;
  const all: Record<string, unknown>[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(supabase.from("entries")).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// Fetches all entries for the dashboard, bypassing the 1000-row Supabase default limit.
// Strategy:
//   1. Fetch all VA-sheet rows (source_sheet != 'QA Tracker') — these are the primary records.
//   2. Collect the set of VA names that appear in VA sheets.
//   3. Fetch QA Tracker rows whose VA name is NOT in that set (e.g. Janine, who has no VA sheet).
//   This prevents double-counting the 4 main VAs while still surfacing VAs only in QA Tracker.
export async function fetchAllEntries(vaName?: string): Promise<Record<string, unknown>[]> {
  const vaRows = await fetchPages(q => {
    let r = q.select("*").neq("source_sheet", "QA Tracker").order("date", { ascending: false });
    if (vaName) r = r.ilike("va_name", vaName);
    return r;
  });

  // VAs that have their own sheets — don't pull their QA Tracker duplicates.
  const knownVAs = new Set(
    vaRows.map(r => (r.va_name as string)?.trim().toLowerCase()).filter(Boolean)
  );

  // If filtering to a specific VA that's already in VA sheets, skip QA Tracker entirely.
  if (vaName && knownVAs.size > 0) return vaRows;

  // Pull QA Tracker rows for VAs with no VA sheet of their own.
  const qaRows = await fetchPages(q => {
    let r = q.select("*").eq("source_sheet", "QA Tracker").order("date", { ascending: false });
    if (vaName) r = r.ilike("va_name", vaName);
    return r;
  });

  const extraRows = qaRows.filter(r => {
    const name = (r.va_name as string)?.trim().toLowerCase();
    return name && !knownVAs.has(name);
  });

  return [...vaRows, ...extraRows];
}
