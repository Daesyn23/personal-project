export type CardSetRow = {
  id: string;
  name: string;
  created_at?: string;
  card_count?: number;
};

export type FlashcardRow = {
  id: string;
  set_id: string | null;
  /** Romaji / reading (optional) */
  phonetic_reading: string | null;
  /** Legacy: mixed script line; prefer kana + kanji when set */
  native_script: string | null;
  kana: string | null;
  kanji: string | null;
  category_label: string | null;
  /** English meaning */
  definition: string | null;
  context_note: string | null;
  example_sentence: string | null;
  example_translation: string | null;
  /** Teacher prep (cultural notes, etc.); not shown on flashcard slides */
  teacher_research: string | null;
  position: number;
  created_at?: string;
};

export type FlashcardDraft = Omit<FlashcardRow, "id" | "created_at"> & {
  id?: string;
};

export type WorkspaceFolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at?: string;
  /** Subfolders + files directly inside this folder (filled when counts are loaded) */
  item_count?: number;
};

export type WorkspaceFileRow = {
  id: string;
  folder_id: string | null;
  filename: string;
  storage_path: string;
  mime_type: string | null;
  byte_size: number | null;
  created_at?: string;
};

/** Whisper phrase segment (Groq) persisted with audio lessons */
export type AudioLessonSegment = {
  startSec: number;
  endSec: number;
  text?: string;
};

export type AudioLessonRow = {
  id: string;
  title: string;
  filename: string;
  storage_path: string;
  mime_type: string | null;
  byte_size: number | null;
  duration_sec: number;
  sample_rate: number;
  number_of_channels: number;
  segments: AudioLessonSegment[];
  created_at: string;
  updated_at: string;
};
