export type KanjiVocabulary = { word: string; reading: string; meaning: string; page: number };
export type KanjiEntry = {
  id: string;
  character: string;
  meaning: string;
  lessonMeaning: string;
  kunyomi: string;
  onyomi: string;
  vocabulary: KanjiVocabulary[];
  strokeImage: string;
  pages: { number: number; image: string }[];
};
export type KanjiLesson = { number: number; pdf: string; sourceName: string; entries: KanjiEntry[] };
export type KanjiLibrary = { compiledPdf: string; lessons: KanjiLesson[] };

export function normalizeKanjiSearch(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[ァ-ヶ]/g, character => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

export function matchesKanji(entry: KanjiEntry, query: string): boolean {
  const terms = normalizeKanjiSearch(query).trim().split(/\s+/).filter(Boolean);
  const searchable = normalizeKanjiSearch([
    entry.character, entry.meaning, entry.lessonMeaning, entry.kunyomi, entry.onyomi,
    ...entry.vocabulary.flatMap(row => [row.word, row.reading, row.meaning]),
  ].join(" "));
  return terms.every(term => searchable.includes(term));
}
