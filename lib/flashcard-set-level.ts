import type { CardSetRow, FlashcardSetLevel } from "@/lib/types";

export const FLASHCARD_SET_LEVELS: { value: FlashcardSetLevel; label: string }[] = [
  { value: "n5", label: "JLPT N5" },
  { value: "n4", label: "JLPT N4" },
  { value: "n3", label: "JLPT N3" },
];

export function flashcardSetLevelLabel(level: FlashcardSetLevel | null | undefined): string | null {
  if (!level) return null;
  return level.toUpperCase();
}

const LEVEL_SORT_ORDER: Record<FlashcardSetLevel, number> = {
  n5: 0,
  n4: 1,
  n3: 2,
};

function lessonNumberFromSetName(name: string): number | null {
  const match = name.trim().match(/\blesson\s*#?\s*(\d+)\b/i);
  if (!match) return null;
  const lessonNumber = Number.parseInt(match[1]!, 10);
  return Number.isFinite(lessonNumber) ? lessonNumber : null;
}

/** Sort tagged lesson collections by N5 → N4 → N3, then by lesson number. */
export function compareFlashcardSets(a: CardSetRow, b: CardSetRow): number {
  const aLevel = a.jlpt_level ? LEVEL_SORT_ORDER[a.jlpt_level] : Number.MAX_SAFE_INTEGER;
  const bLevel = b.jlpt_level ? LEVEL_SORT_ORDER[b.jlpt_level] : Number.MAX_SAFE_INTEGER;
  if (aLevel !== bLevel) return aLevel - bLevel;

  const aLesson = lessonNumberFromSetName(a.name);
  const bLesson = lessonNumberFromSetName(b.name);
  if (aLesson !== null && bLesson !== null && aLesson !== bLesson) return aLesson - bLesson;
  if (aLesson !== null && bLesson === null) return -1;
  if (aLesson === null && bLesson !== null) return 1;

  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
