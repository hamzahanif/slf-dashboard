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
/**
 * Whether entries.deleted_at exists yet (supabase/entries_add_deleted_at.sql).
 * Probed once per process so reads keep working before the migration is run.
 */
let softDelete: boolean | null = null;
async function hasSoftDelete(): Promise<boolean> {
  if (softDelete !== null) return softDelete;
  const { error } = await supabase.from("entries").select("deleted_at").limit(1);
  softDelete = !error;
  return softDelete;
}

export async function fetchAllEntries(vaName?: string): Promise<Record<string, unknown>[]> {
  const soft = await hasSoftDelete();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const live = (r: any) => soft ? r.is("deleted_at", null) : r;

  const vaRows = await fetchPages(q => {
    // `id` as a tiebreaker makes the sort deterministic. Without it, thousands
    // of rows share the same `date`, so Postgres is free to order ties
    // differently between two separate paginated queries — the same row can
    // then land in both page N and page N+1, producing a literal duplicate
    // entry (and a false "Duplicate Listing ID" glitch against itself).
    let r = live(q.select("*").neq("source_sheet", "QA Tracker"))
      .order("date", { ascending: false }).order("id", { ascending: true });
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
    let r = live(q.select("*").eq("source_sheet", "QA Tracker"))
      .order("date", { ascending: false }).order("id", { ascending: true });
    if (vaName) r = r.ilike("va_name", vaName);
    return r;
  });

  const extraRows = qaRows.filter(r => {
    const name = (r.va_name as string)?.trim().toLowerCase();
    return name && !knownVAs.has(name);
  });

  return [...vaRows, ...extraRows];
}
