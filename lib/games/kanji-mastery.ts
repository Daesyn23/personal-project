import type { KanjiProgress } from './kanji-progress';

export type PracticeObservation = { id: string; correct: boolean; hinted: boolean; at: string };
export type MasteryStatus = 'New' | 'Practicing' | 'Remembered' | 'Review due';
const intervals = [1, 3, 7, 14, 30];
/** Only successful recall on a later day advances the spacing interval. */
export function kanjiMastery(progress: KanjiProgress, id: string, now = Date.now()): { status: MasteryStatus; dueAt: number | null; successes: number } {
  const observations = (progress.practice ?? []).filter(item => item.id === id).sort((a,b) => a.at.localeCompare(b.at));
  let successes = 0, dueAt: number | null = null, lastSuccessDay = '';
  for (const item of observations) {
    const time = Date.parse(item.at), day = item.at.slice(0, 10);
    if (!item.correct || item.hinted) { successes = 0; lastSuccessDay = ''; dueAt = time + 10 * 60_000; }
    else {
      if (day !== lastSuccessDay) { successes++; lastSuccessDay = day; }
      dueAt = time + intervals[Math.min(successes - 1, intervals.length - 1)] * 86_400_000;
    }
  }
  const legacy = Object.values(progress.lessons).some(lesson => lesson.kanjiIds.includes(id));
  return { status: dueAt !== null && dueAt <= now ? 'Review due' : successes >= 3 ? 'Remembered' : observations.length || legacy ? 'Practicing' : 'New', dueAt, successes };
}
