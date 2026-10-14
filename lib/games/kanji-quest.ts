import { toHiragana } from "wanakana";
import type { KanjiLesson } from "../kanji-learning";

export type QuestMode = "kanji" | "vocabulary";
export type QuestCard = { id: string; prompt: string; character: string; meaning: string; answers: string[] };
export type QuestAnswer = { card: QuestCard; correct: boolean; hinted: boolean; answer: string };

/** Convert input without stripping punctuation or kanji that should fail grading. */
export function questReading(value: string): string {
  return toHiragana(value.normalize("NFKC").trim().toLowerCase()).normalize("NFC");
}

function listedReadings(value: string): string[] {
  return value.normalize("NFKC").replace(/[()]/g, "").split(/[、・,\s/|]+/)
    .map(questReading).filter(value => /^[ぁ-ゖー]+$/u.test(value) && value !== "ー");
}

export function acceptsQuestAnswer(card: QuestCard, value: string): boolean {
  const reading = questReading(value);
  return /^[ぁ-ゖー]+$/u.test(reading) && card.answers.includes(reading);
}

export function buildQuestDeck(lesson: KanjiLesson, mode: QuestMode): QuestCard[] {
  if (mode === "kanji") return lesson.entries.map(entry => {
    const answers = [...listedReadings(entry.kunyomi), ...listedReadings(entry.onyomi)];
    // Some source headers omit readings. Recover only directly aligned vocabulary:
    // 春 → はる; 降る → ふ (strip the visible okurigana from the reading).
    for (const row of entry.vocabulary) {
      if (row.word === entry.character) answers.push(...listedReadings(row.reading));
      else if (!entry.kunyomi && !entry.onyomi && row.word.startsWith(entry.character)) {
        const suffix = row.word.slice(entry.character.length);
        if (/^[ぁ-ゖ]+$/u.test(suffix)) {
          for (const reading of listedReadings(row.reading)) {
            if (reading.endsWith(suffix)) answers.push(reading.slice(0, -suffix.length));
          }
        }
      }
    }
    return { id: entry.id, prompt: entry.character, character: entry.character,
      meaning: entry.lessonMeaning || entry.meaning, answers: [...new Set(answers.filter(Boolean))] };
  }).filter(card => card.answers.length);

  // Identical words can appear under several kanji; merge their reading variants.
  const words = new Map<string, QuestCard>();
  for (const entry of lesson.entries) for (const row of entry.vocabulary) {
    const answers = listedReadings(row.reading);
    // Skip templates (～人, X分のY) and source annotations; these need a filled-in
    // context before they can have a complete, unambiguous hiragana answer.
    if (!answers.length || !/[一-龯々]/u.test(row.word) || !/^[一-龯々ぁ-ゖァ-ヶー]+$/u.test(row.word)) continue;
    const existing = words.get(row.word);
    if (existing) existing.answers = [...new Set([...existing.answers, ...answers])];
    else words.set(row.word, { id: `${lesson.number}:${row.word}`, prompt: row.word,
      character: entry.character, meaning: row.meaning, answers: [...new Set(answers)] });
  }
  return [...words.values()];
}

export function questStats(answers: QuestAnswer[]) {
  let streak = 0, bestStreak = 0, points = 0, correct = 0;
  for (const answer of answers) {
    if (answer.correct) {
      correct++;
      points += answer.hinted ? 5 : 10;
      bestStreak = Math.max(bestStreak, ++streak);
    } else streak = 0;
  }
  return { correct, points, streak, bestStreak };
}
