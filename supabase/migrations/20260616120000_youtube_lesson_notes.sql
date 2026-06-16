-- YouTube lesson teaching write-ups (sync across devices with same Supabase anon key)

create table if not exists public.youtube_lesson_notes (
  video_id text primary key,
  video_title text not null,
  notes text not null,
  transcript_language text not null default 'unknown',
  generated_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists youtube_lesson_notes_updated_idx
  on public.youtube_lesson_notes (updated_at desc);

alter table public.youtube_lesson_notes enable row level security;

drop policy if exists "youtube_lesson_notes_select_anon" on public.youtube_lesson_notes;
drop policy if exists "youtube_lesson_notes_insert_anon" on public.youtube_lesson_notes;
drop policy if exists "youtube_lesson_notes_update_anon" on public.youtube_lesson_notes;
drop policy if exists "youtube_lesson_notes_delete_anon" on public.youtube_lesson_notes;
drop policy if exists "youtube_lesson_notes_select_authenticated" on public.youtube_lesson_notes;
drop policy if exists "youtube_lesson_notes_insert_authenticated" on public.youtube_lesson_notes;
drop policy if exists "youtube_lesson_notes_update_authenticated" on public.youtube_lesson_notes;
drop policy if exists "youtube_lesson_notes_delete_authenticated" on public.youtube_lesson_notes;

create policy "youtube_lesson_notes_select_anon"
  on public.youtube_lesson_notes for select to anon using (true);
create policy "youtube_lesson_notes_insert_anon"
  on public.youtube_lesson_notes for insert to anon with check (true);
create policy "youtube_lesson_notes_update_anon"
  on public.youtube_lesson_notes for update to anon using (true) with check (true);
create policy "youtube_lesson_notes_delete_anon"
  on public.youtube_lesson_notes for delete to anon using (true);

create policy "youtube_lesson_notes_select_authenticated"
  on public.youtube_lesson_notes for select to authenticated using (true);
create policy "youtube_lesson_notes_insert_authenticated"
  on public.youtube_lesson_notes for insert to authenticated with check (true);
create policy "youtube_lesson_notes_update_authenticated"
  on public.youtube_lesson_notes for update to authenticated using (true) with check (true);
create policy "youtube_lesson_notes_delete_authenticated"
  on public.youtube_lesson_notes for delete to authenticated using (true);
