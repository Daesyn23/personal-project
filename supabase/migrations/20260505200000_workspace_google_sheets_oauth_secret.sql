-- Server-only OAuth refresh token (readable/writable via Supabase service role only).
-- Anon/authenticated clients cannot SELECT this row — tokens never exposed to the browser bundle.

create table if not exists public.workspace_google_sheets_oauth (
  id text primary key default 'global' check (id = 'global'),
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.workspace_google_sheets_oauth enable row level security;

-- No SELECT/INSERT/UPDATE policies for anon or authenticated → access denied for JWT keys.
-- Service role bypasses RLS and is used only from Next.js API routes.
