-- Remember whether the lesson used JLPT-style division or raw Whisper segments (UI + next transcribe).

alter table public.audio_lessons
  add column if not exists phrase_division text;
