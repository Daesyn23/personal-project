-- Folders and uploaded files (PDFs, etc.) for My Workspace — separate from flashcard sets

create table if not exists public.workspace_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.workspace_folders (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists workspace_folders_parent_idx on public.workspace_folders (parent_id);
create index if not exists workspace_folders_name_idx on public.workspace_folders (name);

create table if not exists public.workspace_files (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.workspace_folders (id) on delete cascade,
  filename text not null,
  storage_path text not null,
  mime_type text,
  byte_size bigint,
  created_at timestamptz not null default now()
);

create index if not exists workspace_files_folder_idx on public.workspace_files (folder_id);

alter table public.workspace_folders enable row level security;
alter table public.workspace_files enable row level security;

drop policy if exists "workspace_folders_select_anon" on public.workspace_folders;
drop policy if exists "workspace_folders_insert_anon" on public.workspace_folders;
drop policy if exists "workspace_folders_update_anon" on public.workspace_folders;
drop policy if exists "workspace_folders_delete_anon" on public.workspace_folders;
drop policy if exists "workspace_folders_select_authenticated" on public.workspace_folders;
drop policy if exists "workspace_folders_insert_authenticated" on public.workspace_folders;
drop policy if exists "workspace_folders_update_authenticated" on public.workspace_folders;
drop policy if exists "workspace_folders_delete_authenticated" on public.workspace_folders;

drop policy if exists "workspace_files_select_anon" on public.workspace_files;
drop policy if exists "workspace_files_insert_anon" on public.workspace_files;
drop policy if exists "workspace_files_update_anon" on public.workspace_files;
drop policy if exists "workspace_files_delete_anon" on public.workspace_files;
drop policy if exists "workspace_files_select_authenticated" on public.workspace_files;
drop policy if exists "workspace_files_insert_authenticated" on public.workspace_files;
drop policy if exists "workspace_files_update_authenticated" on public.workspace_files;
drop policy if exists "workspace_files_delete_authenticated" on public.workspace_files;

create policy "workspace_folders_select_anon"
  on public.workspace_folders for select to anon using (true);
create policy "workspace_folders_insert_anon"
  on public.workspace_folders for insert to anon with check (true);
create policy "workspace_folders_update_anon"
  on public.workspace_folders for update to anon using (true) with check (true);
create policy "workspace_folders_delete_anon"
  on public.workspace_folders for delete to anon using (true);

create policy "workspace_folders_select_authenticated"
  on public.workspace_folders for select to authenticated using (true);
create policy "workspace_folders_insert_authenticated"
  on public.workspace_folders for insert to authenticated with check (true);
create policy "workspace_folders_update_authenticated"
  on public.workspace_folders for update to authenticated using (true) with check (true);
create policy "workspace_folders_delete_authenticated"
  on public.workspace_folders for delete to authenticated using (true);

create policy "workspace_files_select_anon"
  on public.workspace_files for select to anon using (true);
create policy "workspace_files_insert_anon"
  on public.workspace_files for insert to anon with check (true);
create policy "workspace_files_update_anon"
  on public.workspace_files for update to anon using (true) with check (true);
create policy "workspace_files_delete_anon"
  on public.workspace_files for delete to anon using (true);

create policy "workspace_files_select_authenticated"
  on public.workspace_files for select to authenticated using (true);
create policy "workspace_files_insert_authenticated"
  on public.workspace_files for insert to authenticated with check (true);
create policy "workspace_files_update_authenticated"
  on public.workspace_files for update to authenticated using (true) with check (true);
create policy "workspace_files_delete_authenticated"
  on public.workspace_files for delete to authenticated using (true);

-- Storage bucket (private — download via signed URLs from the app)
insert into storage.buckets (id, name, public, file_size_limit)
values ('workspace-files', 'workspace-files', false, 52428800)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "workspace_storage_select_anon" on storage.objects;
drop policy if exists "workspace_storage_insert_anon" on storage.objects;
drop policy if exists "workspace_storage_update_anon" on storage.objects;
drop policy if exists "workspace_storage_delete_anon" on storage.objects;
drop policy if exists "workspace_storage_select_authenticated" on storage.objects;
drop policy if exists "workspace_storage_insert_authenticated" on storage.objects;
drop policy if exists "workspace_storage_update_authenticated" on storage.objects;
drop policy if exists "workspace_storage_delete_authenticated" on storage.objects;

create policy "workspace_storage_select_anon"
  on storage.objects for select to anon
  using (bucket_id = 'workspace-files');
create policy "workspace_storage_insert_anon"
  on storage.objects for insert to anon
  with check (bucket_id = 'workspace-files');
create policy "workspace_storage_update_anon"
  on storage.objects for update to anon
  using (bucket_id = 'workspace-files');
create policy "workspace_storage_delete_anon"
  on storage.objects for delete to anon
  using (bucket_id = 'workspace-files');

create policy "workspace_storage_select_authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'workspace-files');
create policy "workspace_storage_insert_authenticated"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'workspace-files');
create policy "workspace_storage_update_authenticated"
  on storage.objects for update to authenticated
  using (bucket_id = 'workspace-files');
create policy "workspace_storage_delete_authenticated"
  on storage.objects for delete to authenticated
  using (bucket_id = 'workspace-files');
