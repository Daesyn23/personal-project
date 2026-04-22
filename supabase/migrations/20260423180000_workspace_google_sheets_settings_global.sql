-- Shared app-wide sheet settings (one row). Replaces per-user auth-scoped table.

drop policy if exists "workspace_google_sheets_settings_select_own" on public.workspace_google_sheets_settings;
drop policy if exists "workspace_google_sheets_settings_insert_own" on public.workspace_google_sheets_settings;
drop policy if exists "workspace_google_sheets_settings_update_own" on public.workspace_google_sheets_settings;
drop policy if exists "workspace_google_sheets_settings_delete_own" on public.workspace_google_sheets_settings;

drop table if exists public.workspace_google_sheets_settings;

create table public.workspace_google_sheets_settings (
  id text primary key default 'global' check (id = 'global'),
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists workspace_google_sheets_settings_updated_at_idx
  on public.workspace_google_sheets_settings (updated_at desc);

insert into public.workspace_google_sheets_settings (id, state)
values (
  'global',
  '{"v":1,"links":[],"activeLinkId":null,"bySpreadsheetId":{}}'::jsonb
)
on conflict (id) do nothing;

alter table public.workspace_google_sheets_settings enable row level security;

drop policy if exists "workspace_google_sheets_settings_select_anon" on public.workspace_google_sheets_settings;
drop policy if exists "workspace_google_sheets_settings_insert_anon" on public.workspace_google_sheets_settings;
drop policy if exists "workspace_google_sheets_settings_update_anon" on public.workspace_google_sheets_settings;
drop policy if exists "workspace_google_sheets_settings_select_authenticated" on public.workspace_google_sheets_settings;
drop policy if exists "workspace_google_sheets_settings_insert_authenticated" on public.workspace_google_sheets_settings;
drop policy if exists "workspace_google_sheets_settings_update_authenticated" on public.workspace_google_sheets_settings;

-- Same access model as flashcards / workspace folders during development: any client with anon key.
create policy "workspace_google_sheets_settings_select_anon"
  on public.workspace_google_sheets_settings for select to anon using (true);
create policy "workspace_google_sheets_settings_insert_anon"
  on public.workspace_google_sheets_settings for insert to anon with check (id = 'global');
create policy "workspace_google_sheets_settings_update_anon"
  on public.workspace_google_sheets_settings for update to anon using (true) with check (id = 'global');

create policy "workspace_google_sheets_settings_select_authenticated"
  on public.workspace_google_sheets_settings for select to authenticated using (true);
create policy "workspace_google_sheets_settings_insert_authenticated"
  on public.workspace_google_sheets_settings for insert to authenticated with check (id = 'global');
create policy "workspace_google_sheets_settings_update_authenticated"
  on public.workspace_google_sheets_settings for update to authenticated using (true) with check (id = 'global');
