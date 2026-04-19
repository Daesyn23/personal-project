-- Separate kana / kanji for vocabulary imports (English stays in definition)
alter table public.flashcards
  add column if not exists kana text;

alter table public.flashcards
  add column if not exists kanji text;
