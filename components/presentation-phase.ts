import type { FlashcardRow } from "@/lib/types";

export type PresentationPhase = "word" | "detail";

export function japaneseLine(card: FlashcardRow): string | null {
  const kana = (card.kana ?? "").trim();
  const kanji = (card.kanji ?? "").trim();
  const legacy = (card.native_script ?? "").trim();
  return kana || kanji || legacy || null;
}

/** Second slide only when there is an example sentence and/or translation to show. */
export function hasDetailPhase(card: FlashcardRow): boolean {
  const ex1 = (card.example_sentence ?? "").trim();
  const ex2 = (card.example_translation ?? "").trim();
  return !!(ex1 || ex2);
}
