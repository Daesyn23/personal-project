-- Named sets (decks); each import creates a set and attaches cards to it
create table if not exists public.card_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists card_sets_created_at_idx on public.card_sets (created_at desc);

alter table public.flashcards
  add column if not exists set_id uuid references public.card_sets (id) on delete cascade;

create index if not exists flashcards_set_id_idx on public.flashcards (set_id);

alter table public.card_sets enable row level security;

create policy "card_sets_select_anon"
  on public.card_sets for select
  to anon
  using (true);

create policy "card_sets_insert_anon"
  on public.card_sets for insert
  to anon
  with check (true);

create policy "card_sets_update_anon"
  on public.card_sets for update
  to anon
  using (true)
  with check (true);

create policy "card_sets_delete_anon"
  on public.card_sets for delete
  to anon
  using (true);

create policy "card_sets_select_authenticated"
  on public.card_sets for select
  to authenticated
  using (true);

create policy "card_sets_insert_authenticated"
  on public.card_sets for insert
  to authenticated
  with check (true);

create policy "card_sets_update_authenticated"
  on public.card_sets for update
  to authenticated
  using (true)
  with check (true);

create policy "card_sets_delete_authenticated"
  on public.card_sets for delete
  to authenticated
  using (true);
