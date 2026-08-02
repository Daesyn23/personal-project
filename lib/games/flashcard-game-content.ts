import type { FlashcardRow } from "@/lib/types";
import { shuffleArray } from "@/lib/shuffle-array";
import type { GameId, PlayableCard } from "@/lib/games/types";
import { GAME_META } from "@/lib/games/types";

export function japaneseDisplay(card: FlashcardRow): string {
  return (
    card.kanji?.trim() ||
    card.kana?.trim() ||
    card.native_script?.trim() ||
    ""
  );
}

export function japaneseReading(card: FlashcardRow): string {
  return (
    card.kana?.trim() ||
    card.native_script?.trim() ||
    card.kanji?.trim() ||
    ""
  );
}

export function toPlayableCards(rows: FlashcardRow[]): PlayableCard[] {
  const out: PlayableCard[] = [];
  for (const row of rows) {
    const jp = japaneseDisplay(row);
    const reading = japaneseReading(row);
    const en = row.definition?.trim() || "";
    if (!jp || !en) continue;
    out.push({
      id: row.id,
      jp,
      reading: reading || jp,
      en,
    });
  }
  return out;
}

export function canStartGame(gameId: GameId, playableCount: number): boolean {
  return playableCount >= GAME_META[gameId].minCards;
}

export type TrueFalseQuestion = {
  card: PlayableCard;
  shownEn: string;
  isTrue: boolean;
};

/** Build a true/false prompt; ~half are real pairs, half mix in another meaning. */
export function buildTrueFalseQuestion(
  card: PlayableCard,
  pool: PlayableCard[]
): TrueFalseQuestion {
  const others = pool.filter((c) => c.id !== card.id && c.en !== card.en);
  const forceTrue = others.length === 0 || Math.random() < 0.5;
  if (forceTrue) {
    return { card, shownEn: card.en, isTrue: true };
  }
  const fake = shuffleArray(others)[0]!;
  return { card, shownEn: fake.en, isTrue: false };
}

/** Split Japanese into grapheme-ish units for scramble tiles. */
export function splitJpChars(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter("ja", { granularity: "grapheme" });
    return [...seg.segment(trimmed)].map((s) => s.segment);
  }
  return Array.from(trimmed);
}

/** Shuffle characters; retry so the result is not already solved when possible. */
export function scrambleChars(chars: string[]): string[] {
  if (chars.length < 2) return [...chars];
  const joined = chars.join("");
  for (let i = 0; i < 12; i++) {
    const next = shuffleArray(chars);
    if (next.join("") !== joined) return next;
  }
  return shuffleArray(chars);
}

export type McQuestion = {
  card: PlayableCard;
  prompt: string;
  choices: string[];
  correctIndex: number;
};

export type McDirection = "jpToEn" | "enToJp";

export function buildMcQuestion(
  card: PlayableCard,
  pool: PlayableCard[],
  direction: McDirection,
  choiceCount = 4
): McQuestion {
  const prompt = direction === "jpToEn" ? card.jp : card.en;
  const correct = direction === "jpToEn" ? card.en : card.jp;
  const distractorSource = pool.filter((c) => c.id !== card.id);
  const distractors = shuffleArray(distractorSource)
    .map((c) => (direction === "jpToEn" ? c.en : c.jp))
    .filter((t, i, arr) => t !== correct && arr.indexOf(t) === i)
    .slice(0, Math.max(0, choiceCount - 1));

  while (distractors.length < choiceCount - 1) {
    distractors.push(`— ${distractors.length + 1} —`);
  }

  const choices = shuffleArray([correct, ...distractors.slice(0, choiceCount - 1)]);
  const correctIndex = choices.indexOf(correct);
  return { card, prompt, choices, correctIndex };
}

export function formatAccuracy(correct: number, wrong: number): string {
  const total = correct + wrong;
  if (total === 0) return "—";
  return `${Math.round((correct / total) * 100)}%`;
}
