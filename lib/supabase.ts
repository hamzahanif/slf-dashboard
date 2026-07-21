import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Fetches all rows from `entries`, bypassing the 1000-row default limit.
export async function fetchAllEntries(filters: {
  excludeQATracker?: boolean;
  vaName?: string;
}): Promise<Record<string, unknown>[]> {
  const PAGE = 1000;
  const all: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    let q = supabase
      .from("entries")
      .select("*")
      .order("date", { ascending: false })
      .range(from, from + PAGE - 1);

    if (filters.excludeQATracker) q = q.neq("source_sheet", "QA Tracker");
    if (filters.vaName) q = q.ilike("va_name", filters.vaName);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}
