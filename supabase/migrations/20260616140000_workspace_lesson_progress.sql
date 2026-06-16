-- Current Minna lesson progress (sync across devices with same Supabase anon key)

create table if not exists public.workspace_lesson_progress (
  id text primary key default 'global' check (id = 'global'),
  lesson_number int not null default 1 check (lesson_number > 0),
  jlpt_level text not null default 'n4' check (jlpt_level in ('n5', 'n4', 'n3')),
  updated_at timestamptz not null default now()
);

insert into public.workspace_lesson_progress (id, lesson_number, jlpt_level)
values ('global', 1, 'n4')
on conflict (id) do nothing;

alter table public.workspace_lesson_progress enable row level security;

drop policy if exists "workspace_lesson_progress_select_anon" on public.workspace_lesson_progress;
drop policy if exists "workspace_lesson_progress_insert_anon" on public.workspace_lesson_progress;
drop policy if exists "workspace_lesson_progress_update_anon" on public.workspace_lesson_progress;
drop policy if exists "workspace_lesson_progress_select_authenticated" on public.workspace_lesson_progress;
drop policy if exists "workspace_lesson_progress_insert_authenticated" on public.workspace_lesson_progress;
drop policy if exists "workspace_lesson_progress_update_authenticated" on public.workspace_lesson_progress;

create policy "workspace_lesson_progress_select_anon"
  on public.workspace_lesson_progress for select to anon using (true);
create policy "workspace_lesson_progress_insert_anon"
  on public.workspace_lesson_progress for insert to anon with check (id = 'global');
create policy "workspace_lesson_progress_update_anon"
  on public.workspace_lesson_progress for update to anon using (true) with check (id = 'global');

create policy "workspace_lesson_progress_select_authenticated"
  on public.workspace_lesson_progress for select to authenticated using (true);
create policy "workspace_lesson_progress_insert_authenticated"
  on public.workspace_lesson_progress for insert to authenticated with check (id = 'global');
create policy "workspace_lesson_progress_update_authenticated"
  on public.workspace_lesson_progress for update to authenticated using (true) with check (id = 'global');
