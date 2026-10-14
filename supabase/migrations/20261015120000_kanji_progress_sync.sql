-- Private, append-only practice summaries. A round can be retried safely;
-- authenticated users can only read and add their own progress.
create table if not exists public.workspace_kanji_progress_events (
  user_id uuid not null default auth.uid(),
  id text not null check (length(id) between 1 and 200),
  progress jsonb not null check ((
    jsonb_typeof(progress) = 'object'
    and progress->>'version' = '1'
    and jsonb_typeof(progress->'lessons') = 'object'
    and jsonb_typeof(progress->'days') = 'object'
    and octet_length(progress::text) <= 131072
  ) is true),
  played_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.workspace_kanji_progress_events enable row level security;
revoke all on public.workspace_kanji_progress_events from public, anon, authenticated;
grant select, insert on public.workspace_kanji_progress_events to authenticated;
drop policy if exists "kanji_progress_read_own" on public.workspace_kanji_progress_events;
drop policy if exists "kanji_progress_add_own" on public.workspace_kanji_progress_events;
create policy "kanji_progress_read_own"
  on public.workspace_kanji_progress_events for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "kanji_progress_add_own"
  on public.workspace_kanji_progress_events for insert to authenticated
  with check ((select auth.uid()) = user_id);
comment on table public.workspace_kanji_progress_events is
  'Private account-scoped kanji round summaries and one-time browser imports; no anonymous access or browser updates/deletes.';
