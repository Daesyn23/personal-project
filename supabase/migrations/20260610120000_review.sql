-- Review folders and flip-card items (hiragana + English front, kanji back)

create table if not exists public.review_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists review_folders_name_idx on public.review_folders (name);

create table if not exists public.review_items (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.review_folders (id) on delete cascade,
  kana text not null,
  definition text not null,
  kanji text not null,
  position int not null default 0,
  starred boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists review_items_folder_idx on public.review_items (folder_id);
create index if not exists review_items_folder_position_idx on public.review_items (folder_id, position);

alter table public.review_folders enable row level security;
alter table public.review_items enable row level security;

drop policy if exists "review_folders_select_anon" on public.review_folders;
drop policy if exists "review_folders_insert_anon" on public.review_folders;
drop policy if exists "review_folders_update_anon" on public.review_folders;
drop policy if exists "review_folders_delete_anon" on public.review_folders;
drop policy if exists "review_folders_select_authenticated" on public.review_folders;
drop policy if exists "review_folders_insert_authenticated" on public.review_folders;
drop policy if exists "review_folders_update_authenticated" on public.review_folders;
drop policy if exists "review_folders_delete_authenticated" on public.review_folders;

drop policy if exists "review_items_select_anon" on public.review_items;
drop policy if exists "review_items_insert_anon" on public.review_items;
drop policy if exists "review_items_update_anon" on public.review_items;
drop policy if exists "review_items_delete_anon" on public.review_items;
drop policy if exists "review_items_select_authenticated" on public.review_items;
drop policy if exists "review_items_insert_authenticated" on public.review_items;
drop policy if exists "review_items_update_authenticated" on public.review_items;
drop policy if exists "review_items_delete_authenticated" on public.review_items;

create policy "review_folders_select_anon"
  on public.review_folders for select to anon using (true);
create policy "review_folders_insert_anon"
  on public.review_folders for insert to anon with check (true);
create policy "review_folders_update_anon"
  on public.review_folders for update to anon using (true) with check (true);
create policy "review_folders_delete_anon"
  on public.review_folders for delete to anon using (true);

create policy "review_folders_select_authenticated"
  on public.review_folders for select to authenticated using (true);
create policy "review_folders_insert_authenticated"
  on public.review_folders for insert to authenticated with check (true);
create policy "review_folders_update_authenticated"
  on public.review_folders for update to authenticated using (true) with check (true);
create policy "review_folders_delete_authenticated"
  on public.review_folders for delete to authenticated using (true);

create policy "review_items_select_anon"
  on public.review_items for select to anon using (true);
create policy "review_items_insert_anon"
  on public.review_items for insert to anon with check (true);
create policy "review_items_update_anon"
  on public.review_items for update to anon using (true) with check (true);
create policy "review_items_delete_anon"
  on public.review_items for delete to anon using (true);

create policy "review_items_select_authenticated"
  on public.review_items for select to authenticated using (true);
create policy "review_items_insert_authenticated"
  on public.review_items for insert to authenticated with check (true);
create policy "review_items_update_authenticated"
  on public.review_items for update to authenticated using (true) with check (true);
create policy "review_items_delete_authenticated"
  on public.review_items for delete to authenticated using (true);
