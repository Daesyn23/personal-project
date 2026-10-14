import type { QuestAnswer, QuestMode } from "./kanji-quest";

export type LessonProgress = { answered: number; correct: number; xp: number; rounds: number; kanjiIds: string[] };
export type KanjiProgress = {
  version: 1;
  lessons: Record<string, LessonProgress>;
  days: Record<string, number>;
  bestStreak: number;
  perfectRounds: number;
  savedRounds: string[];
  lastLesson: number | null;
};
export type PracticeRound = { id: string; lesson: number; mode: QuestMode; completed: boolean; answers: QuestAnswer[] };

export const emptyProgress = (): KanjiProgress => ({ version: 1, lessons: {}, days: {}, bestStreak: 0, perfectRounds: 0, savedRounds: [], lastLesson: null });

/** Calendar dates follow the learner's local time, including around midnight. */
export function studyDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function studyStreak(progress: KanjiProgress, now = new Date()): number {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!progress.days[studyDate(day)]) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (progress.days[studyDate(day)]) { streak++; day.setDate(day.getDate() - 1); }
  return streak;
}

export function progressTotals(progress: KanjiProgress) {
  return Object.values(progress.lessons).reduce((total, lesson) => ({
    answered: total.answered + lesson.answered, correct: total.correct + lesson.correct,
    xp: total.xp + lesson.xp, rounds: total.rounds + lesson.rounds, practiced: total.practiced + lesson.kanjiIds.length,
  }), { answered: 0, correct: 0, xp: 0, rounds: 0, practiced: 0 });
}

export function recordRound(progress: KanjiProgress, round: PracticeRound, now = new Date()): KanjiProgress {
  if (!round.answers.length || progress.savedRounds.includes(round.id)) return progress;
  const previous = progress.lessons[round.lesson] ?? { answered: 0, correct: 0, xp: 0, rounds: 0, kanjiIds: [] };
  let correct = 0, xp = 0, streak = 0, bestStreak = progress.bestStreak;
  for (const answer of round.answers) {
    if (answer.correct) { correct++; xp += answer.hinted ? 5 : 10; bestStreak = Math.max(bestStreak, ++streak); }
    else streak = 0;
  }
  const day = studyDate(now);
  return {
    version: 1,
    lessons: { ...progress.lessons, [round.lesson]: {
      answered: previous.answered + round.answers.length, correct: previous.correct + correct,
      xp: previous.xp + xp, rounds: previous.rounds + 1,
      kanjiIds: [...new Set([...previous.kanjiIds, ...(round.mode === "kanji" ? round.answers.map(answer => answer.card.id) : [])])],
    } },
    days: { ...progress.days, [day]: (progress.days[day] ?? 0) + round.answers.length },
    bestStreak, perfectRounds: progress.perfectRounds + Number(round.completed && correct === round.answers.length),
    savedRounds: [...progress.savedRounds, round.id].slice(-512), lastLesson: round.lesson,
  };
}

const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Reject broken/older data instead of letting it break the games. */
export function parseProgress(raw: string | null): KanjiProgress {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!object(value) || value.version !== 1 || !object(value.lessons) || !object(value.days)
      || !count(value.bestStreak) || !count(value.perfectRounds)
      || !Array.isArray(value.savedRounds) || !value.savedRounds.every(id => typeof id === "string")
      || !(value.lastLesson === null || (count(value.lastLesson) && value.lastLesson <= 40))) return emptyProgress();
    for (const [lesson, stats] of Object.entries(value.lessons)) {
      if (!/^(?:[0-9]|[1-3][0-9]|40)$/.test(lesson) || !object(stats)
        || !count(stats.answered) || !count(stats.correct) || stats.correct > stats.answered
        || !count(stats.xp) || !count(stats.rounds) || !Array.isArray(stats.kanjiIds)
        || stats.kanjiIds.length > 16 || !stats.kanjiIds.every(id => typeof id === "string")
        || new Set(stats.kanjiIds).size !== stats.kanjiIds.length) return emptyProgress();
    }
    if (!Object.entries(value.days).every(([day, answers]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && count(answers))) return emptyProgress();
    return value as KanjiProgress;
  } catch { return emptyProgress(); }
}
