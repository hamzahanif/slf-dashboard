-- Soft delete for entries.
-- Run once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run: IF NOT EXISTS makes it idempotent.
--
-- Until this runs, the Delete action REFUSES rather than falling back to a
-- permanent delete — losing a row while believing it is recoverable is the one
-- failure worth blocking on.

alter table public.entries
  add column if not exists deleted_at timestamptz;

-- Reads filter on this constantly, so index the live rows.
create index if not exists entries_deleted_at_idx
  on public.entries (deleted_at)
  where deleted_at is null;

-- Restore everything deleted by mistake:
--   update public.entries set deleted_at = null where deleted_at is not null;
--
-- See what is currently in the bin:
--   select id, date, va_name, facility_name, deleted_at
--   from public.entries where deleted_at is not null order by deleted_at desc;
--
-- Purge the bin permanently (irreversible):
--   delete from public.entries where deleted_at < now() - interval '30 days';
