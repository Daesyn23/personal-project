-- Workspace AI chat: saved threads + messages (syncs across devices with same Supabase anon key)

create table public.workspace_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.workspace_ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sort_order int not null,
  created_at timestamptz not null default now(),
  unique (conversation_id, sort_order)
);

create index workspace_ai_messages_conversation_sort_idx
  on public.workspace_ai_messages (conversation_id, sort_order);

create index workspace_ai_conversations_updated_idx
  on public.workspace_ai_conversations (updated_at desc);

alter table public.workspace_ai_conversations enable row level security;
alter table public.workspace_ai_messages enable row level security;

drop policy if exists "workspace_ai_conversations_select_anon" on public.workspace_ai_conversations;
drop policy if exists "workspace_ai_conversations_insert_anon" on public.workspace_ai_conversations;
drop policy if exists "workspace_ai_conversations_update_anon" on public.workspace_ai_conversations;
drop policy if exists "workspace_ai_conversations_delete_anon" on public.workspace_ai_conversations;
drop policy if exists "workspace_ai_conversations_select_authenticated" on public.workspace_ai_conversations;
drop policy if exists "workspace_ai_conversations_insert_authenticated" on public.workspace_ai_conversations;
drop policy if exists "workspace_ai_conversations_update_authenticated" on public.workspace_ai_conversations;
drop policy if exists "workspace_ai_conversations_delete_authenticated" on public.workspace_ai_conversations;

create policy "workspace_ai_conversations_select_anon"
  on public.workspace_ai_conversations for select to anon using (true);
create policy "workspace_ai_conversations_insert_anon"
  on public.workspace_ai_conversations for insert to anon with check (true);
create policy "workspace_ai_conversations_update_anon"
  on public.workspace_ai_conversations for update to anon using (true) with check (true);
create policy "workspace_ai_conversations_delete_anon"
  on public.workspace_ai_conversations for delete to anon using (true);

create policy "workspace_ai_conversations_select_authenticated"
  on public.workspace_ai_conversations for select to authenticated using (true);
create policy "workspace_ai_conversations_insert_authenticated"
  on public.workspace_ai_conversations for insert to authenticated with check (true);
create policy "workspace_ai_conversations_update_authenticated"
  on public.workspace_ai_conversations for update to authenticated using (true) with check (true);
create policy "workspace_ai_conversations_delete_authenticated"
  on public.workspace_ai_conversations for delete to authenticated using (true);

drop policy if exists "workspace_ai_messages_select_anon" on public.workspace_ai_messages;
drop policy if exists "workspace_ai_messages_insert_anon" on public.workspace_ai_messages;
drop policy if exists "workspace_ai_messages_update_anon" on public.workspace_ai_messages;
drop policy if exists "workspace_ai_messages_delete_anon" on public.workspace_ai_messages;
drop policy if exists "workspace_ai_messages_select_authenticated" on public.workspace_ai_messages;
drop policy if exists "workspace_ai_messages_insert_authenticated" on public.workspace_ai_messages;
drop policy if exists "workspace_ai_messages_update_authenticated" on public.workspace_ai_messages;
drop policy if exists "workspace_ai_messages_delete_authenticated" on public.workspace_ai_messages;

create policy "workspace_ai_messages_select_anon"
  on public.workspace_ai_messages for select to anon using (true);
create policy "workspace_ai_messages_insert_anon"
  on public.workspace_ai_messages for insert to anon with check (true);
create policy "workspace_ai_messages_update_anon"
  on public.workspace_ai_messages for update to anon using (true) with check (true);
create policy "workspace_ai_messages_delete_anon"
  on public.workspace_ai_messages for delete to anon using (true);

create policy "workspace_ai_messages_select_authenticated"
  on public.workspace_ai_messages for select to authenticated using (true);
create policy "workspace_ai_messages_insert_authenticated"
  on public.workspace_ai_messages for insert to authenticated with check (true);
create policy "workspace_ai_messages_update_authenticated"
  on public.workspace_ai_messages for update to authenticated using (true) with check (true);
create policy "workspace_ai_messages_delete_authenticated"
  on public.workspace_ai_messages for delete to authenticated using (true);
