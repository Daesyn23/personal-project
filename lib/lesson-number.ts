/** Extract Minna / JLPT lesson number from folder names, video titles, set names, etc. */
export function parseLessonNumber(text: string): number | null {
  const t = text.trim();
  if (!t) return null;

  const lessonMatch = t.match(/lesson\s*#?\s*(\d+)/i);
  if (lessonMatch) {
    const n = parseInt(lessonMatch[1]!, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const numOnly = t.match(/^(\d+)$/);
  if (numOnly) {
    const n = parseInt(numOnly[1]!, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  return null;
}

export function matchesLessonNumber(text: string, lessonNumber: number): boolean {
  return parseLessonNumber(text) === lessonNumber;
}

export function lessonFolderName(lessonNumber: number): string {
  return `Lesson ${lessonNumber}`;
}

export function lessonVocabularySetName(lessonNumber: number): string {
  return `Lesson ${lessonNumber} Vocabulary`;
}
