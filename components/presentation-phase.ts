import type { FlashcardRow } from "@/lib/types";

export type PresentationPhase = "word" | "detail";

export function japaneseLine(card: FlashcardRow): string | null {
  const kana = (card.kana ?? "").trim();
  const kanji = (card.kanji ?? "").trim();
  const legacy = (card.native_script ?? "").trim();
  return kana || kanji || legacy || null;
}

/**
 * Text safe for presentation TTS: drop textbook hints and symbols engines pronounce
 * (brackets, parens, ～, punctuation, verb-group numerals, etc.).
 */
export function textForFlashcardSpeech(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[～〜･・※★☆♪♫→←↔/\\|#@$%^&*+=<>{}「」『』【】]/g, "")
    .replace(/\s+(?:Ⅰ|Ⅱ|Ⅲ|I{1,3}|II|III)\s*$/i, "")
    .replace(/[^\p{L}\p{M}\s']/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Second slide only when there is an example sentence and/or translation to show. */
export function hasDetailPhase(card: FlashcardRow): boolean {
  const ex1 = (card.example_sentence ?? "").trim();
  const ex2 = (card.example_translation ?? "").trim();
  return !!(ex1 || ex2);
}
