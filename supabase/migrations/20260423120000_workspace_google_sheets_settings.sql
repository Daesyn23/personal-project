-- Per-user sync for saved Google Sheet links + worksheet UI prefs (tab, freeze, column widths, zoom).

create table if not exists public.workspace_google_sheets_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists workspace_google_sheets_settings_updated_at_idx
  on public.workspace_google_sheets_settings (updated_at desc);

alter table public.workspace_google_sheets_settings enable row level security;

drop policy if exists "workspace_google_sheets_settings_select_own" on public.workspace_google_sheets_settings;
drop policy if exists "workspace_google_sheets_settings_insert_own" on public.workspace_google_sheets_settings;
drop policy if exists "workspace_google_sheets_settings_update_own" on public.workspace_google_sheets_settings;
drop policy if exists "workspace_google_sheets_settings_delete_own" on public.workspace_google_sheets_settings;

-- Authenticated users only: each row is keyed by auth.uid().
create policy "workspace_google_sheets_settings_select_own"
  on public.workspace_google_sheets_settings for select to authenticated
  using (auth.uid() = user_id);

create policy "workspace_google_sheets_settings_insert_own"
  on public.workspace_google_sheets_settings for insert to authenticated
  with check (auth.uid() = user_id);

create policy "workspace_google_sheets_settings_update_own"
  on public.workspace_google_sheets_settings for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "workspace_google_sheets_settings_delete_own"
  on public.workspace_google_sheets_settings for delete to authenticated
  using (auth.uid() = user_id);
