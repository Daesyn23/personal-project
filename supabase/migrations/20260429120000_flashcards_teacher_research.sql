-- Teacher-only prep notes; never shown on presentation slides
alter table public.flashcards
  add column if not exists teacher_research text;
