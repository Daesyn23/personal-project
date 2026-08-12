import type { FlashcardSetLevel } from "@/lib/types";

export const FLASHCARD_SET_LEVELS: { value: FlashcardSetLevel; label: string }[] = [
  { value: "n5", label: "JLPT N5" },
  { value: "n4", label: "JLPT N4" },
  { value: "n3", label: "JLPT N3" },
];

export function flashcardSetLevelLabel(level: FlashcardSetLevel | null | undefined): string | null {
  if (!level) return null;
  return level.toUpperCase();
}
