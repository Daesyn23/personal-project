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
  position: number;
  created_at?: string;
};

export type FlashcardDraft = Omit<FlashcardRow, "id" | "created_at"> & {
  id?: string;
};
