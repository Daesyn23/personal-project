-- Flashcards for presentation-style study slides
create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  phonetic_reading text,
  native_script text,
  category_label text,
  definition text,
  context_note text,
  example_sentence text,
  example_translation text,
  "position" int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists flashcards_position_idx on public.flashcards ("position");

alter table public.flashcards enable row level security;

-- Adjust policies for your auth model. For a private project / single presenter, permissive anon access is common during development.
create policy "flashcards_select_anon"
  on public.flashcards for select
  to anon
  using (true);

create policy "flashcards_insert_anon"
  on public.flashcards for insert
  to anon
  with check (true);

create policy "flashcards_update_anon"
  on public.flashcards for update
  to anon
  using (true)
  with check (true);

create policy "flashcards_delete_anon"
  on public.flashcards for delete
  to anon
  using (true);

create policy "flashcards_select_authenticated"
  on public.flashcards for select
  to authenticated
  using (true);

create policy "flashcards_insert_authenticated"
  on public.flashcards for insert
  to authenticated
  with check (true);

create policy "flashcards_update_authenticated"
  on public.flashcards for update
  to authenticated
  using (true)
  with check (true);

create policy "flashcards_delete_authenticated"
  on public.flashcards for delete
  to authenticated
  using (true);
