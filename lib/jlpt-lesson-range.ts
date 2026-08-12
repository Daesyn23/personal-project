import type { JlptPlaylistKey } from "@/lib/youtube-jlpt-playlists";

export type JlptLessonRange = {
  min: number;
  max: number;
};

const JLPT_LESSON_RANGES: Record<JlptPlaylistKey, JlptLessonRange> = {
  n5: { min: 1, max: 25 },
  n4: { min: 26, max: 50 },
  n3: { min: 1, max: 16 },
};

export function lessonRangeForLevel(level: JlptPlaylistKey): JlptLessonRange {
  return JLPT_LESSON_RANGES[level];
}

export function defaultLessonForLevel(level: JlptPlaylistKey): number {
  return lessonRangeForLevel(level).min;
}

export function isLessonAvailableForLevel(level: JlptPlaylistKey, lessonNumber: number): boolean {
  const range = lessonRangeForLevel(level);
  return Number.isInteger(lessonNumber) && lessonNumber >= range.min && lessonNumber <= range.max;
}

export function clampLessonToLevel(level: JlptPlaylistKey, lessonNumber: number): number {
  const range = lessonRangeForLevel(level);
  const whole = Number.isFinite(lessonNumber) ? Math.floor(lessonNumber) : range.min;
  return Math.min(range.max, Math.max(range.min, whole));
}
