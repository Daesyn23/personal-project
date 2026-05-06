-- Audio lessons: Whisper segments + optional transcripts, files in storage

create table if not exists public.audio_lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  filename text not null,
  storage_path text not null,
  mime_type text,
  byte_size bigint,
  duration_sec double precision not null,
  sample_rate int not null,
  number_of_channels int not null,
  segments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists audio_lessons_updated_idx on public.audio_lessons (updated_at desc);

alter table public.audio_lessons enable row level security;

drop policy if exists "audio_lessons_select_anon" on public.audio_lessons;
drop policy if exists "audio_lessons_insert_anon" on public.audio_lessons;
drop policy if exists "audio_lessons_update_anon" on public.audio_lessons;
drop policy if exists "audio_lessons_delete_anon" on public.audio_lessons;
drop policy if exists "audio_lessons_select_authenticated" on public.audio_lessons;
drop policy if exists "audio_lessons_insert_authenticated" on public.audio_lessons;
drop policy if exists "audio_lessons_update_authenticated" on public.audio_lessons;
drop policy if exists "audio_lessons_delete_authenticated" on public.audio_lessons;

create policy "audio_lessons_select_anon"
  on public.audio_lessons for select to anon using (true);
create policy "audio_lessons_insert_anon"
  on public.audio_lessons for insert to anon with check (true);
create policy "audio_lessons_update_anon"
  on public.audio_lessons for update to anon using (true) with check (true);
create policy "audio_lessons_delete_anon"
  on public.audio_lessons for delete to anon using (true);

create policy "audio_lessons_select_authenticated"
  on public.audio_lessons for select to authenticated using (true);
create policy "audio_lessons_insert_authenticated"
  on public.audio_lessons for insert to authenticated with check (true);
create policy "audio_lessons_update_authenticated"
  on public.audio_lessons for update to authenticated using (true) with check (true);
create policy "audio_lessons_delete_authenticated"
  on public.audio_lessons for delete to authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit)
values ('audio-lessons', 'audio-lessons', false, 83886080)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "audio_lessons_storage_select_anon" on storage.objects;
drop policy if exists "audio_lessons_storage_insert_anon" on storage.objects;
drop policy if exists "audio_lessons_storage_update_anon" on storage.objects;
drop policy if exists "audio_lessons_storage_delete_anon" on storage.objects;
drop policy if exists "audio_lessons_storage_select_authenticated" on storage.objects;
drop policy if exists "audio_lessons_storage_insert_authenticated" on storage.objects;
drop policy if exists "audio_lessons_storage_update_authenticated" on storage.objects;
drop policy if exists "audio_lessons_storage_delete_authenticated" on storage.objects;

create policy "audio_lessons_storage_select_anon"
  on storage.objects for select to anon
  using (bucket_id = 'audio-lessons');
create policy "audio_lessons_storage_insert_anon"
  on storage.objects for insert to anon
  with check (bucket_id = 'audio-lessons');
create policy "audio_lessons_storage_update_anon"
  on storage.objects for update to anon
  using (bucket_id = 'audio-lessons');
create policy "audio_lessons_storage_delete_anon"
  on storage.objects for delete to anon
  using (bucket_id = 'audio-lessons');

create policy "audio_lessons_storage_select_authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'audio-lessons');
create policy "audio_lessons_storage_insert_authenticated"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'audio-lessons');
create policy "audio_lessons_storage_update_authenticated"
  on storage.objects for update to authenticated
  using (bucket_id = 'audio-lessons');
create policy "audio_lessons_storage_delete_authenticated"
  on storage.objects for delete to authenticated
  using (bucket_id = 'audio-lessons');
