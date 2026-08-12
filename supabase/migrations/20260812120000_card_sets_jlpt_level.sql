-- A collection's JLPT level is independent from its display name. This allows
-- N5 Lesson 1 and N3 Lesson 1 to keep the same friendly name without colliding.
alter table public.card_sets
  add column if not exists jlpt_level text;

alter table public.card_sets
  drop constraint if exists card_sets_jlpt_level_check;

alter table public.card_sets
  add constraint card_sets_jlpt_level_check
  check (jlpt_level is null or jlpt_level in ('n5', 'n4', 'n3'));

create index if not exists card_sets_jlpt_level_idx
  on public.card_sets (jlpt_level);
