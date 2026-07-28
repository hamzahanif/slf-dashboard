-- Adds the per-column QA verification flags used by the QA Review tab.
-- Run once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run: IF NOT EXISTS makes it idempotent.
--
-- Until this runs, the app still works: the QA decision and notes save
-- normally and the two checkmarks simply don't persist between reloads.

alter table public.qa_reviews
  add column if not exists group_checked   boolean not null default false,
  add column if not exists listing_checked boolean not null default false;
