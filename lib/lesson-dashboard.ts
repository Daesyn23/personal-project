import { listWorkspaceFiles, listWorkspaceFolders } from "@/lib/documents-repo";
import { listCardSets, listFlashcardsInSet } from "@/lib/flashcards-repo";
import {
  lessonFolderName,
  lessonVocabularySetName,
  matchesLessonNumber,
  parseLessonNumber,
} from "@/lib/lesson-number";
import type { CardSetRow, FlashcardRow, WorkspaceFileRow, WorkspaceFolderRow } from "@/lib/types";
import { listAllLessonNotes, type LessonNoteRecord } from "@/lib/youtube-lesson-notes-repo";
import {
  JLPT_YOUTUBE_PLAYLISTS,
  type JlptPlaylistKey,
} from "@/lib/youtube-jlpt-playlists";
import type { YoutubePlaylistVideo } from "@/lib/parse-youtube-playlist-rss";

export type FlashcardNoteItem = {
  id: string;
  headline: string;
  phoneticReading: string | null;
  categoryLabel: string | null;
  teacherResearch: string;
};

export type LessonDashboardData = {
  lessonNumber: number;
  jlptLevel: JlptPlaylistKey;
  levelFolder: WorkspaceFolderRow | null;
  lessonFolder: WorkspaceFolderRow | null;
  documentsTrail: { id: string; name: string }[];
  documentFiles: WorkspaceFileRow[];
  flashcardSet: CardSetRow | null;
  flashcardNotes: FlashcardNoteItem[];
  youtubeVideos: YoutubePlaylistVideo[];
  lessonNotes: LessonNoteRecord[];
  compiledNotes: string | null;
};

function findLevelFolder(folders: WorkspaceFolderRow[], jlptLevel: JlptPlaylistKey): WorkspaceFolderRow | null {
  const key = jlptLevel.toUpperCase();
  return (
    folders.find((f) => f.name.trim().toUpperCase() === key) ??
    folders.find((f) => f.name.toUpperCase().includes(key)) ??
    null
  );
}

function findLessonFolder(folders: WorkspaceFolderRow[], lessonNumber: number): WorkspaceFolderRow | null {
  return folders.find((f) => matchesLessonNumber(f.name, lessonNumber)) ?? null;
}

function findFlashcardSet(sets: CardSetRow[], lessonNumber: number): CardSetRow | null {
  const exact = sets.find((s) => s.name.trim() === lessonVocabularySetName(lessonNumber));
  if (exact) return exact;
  return sets.find((s) => matchesLessonNumber(s.name, lessonNumber)) ?? null;
}

function filterYoutubeVideos(videos: YoutubePlaylistVideo[], lessonNumber: number): YoutubePlaylistVideo[] {
  return videos.filter((v) => matchesLessonNumber(v.title, lessonNumber));
}

function flashcardHeadline(c: FlashcardRow): string {
  const k = (c.kana ?? "").trim();
  const d = (c.definition ?? "").trim();
  if (k && d) return `${k} — ${d}`;
  return k || d || "Untitled";
}

function toFlashcardNoteItems(cards: FlashcardRow[]): FlashcardNoteItem[] {
  return cards
    .map((c) => {
      const teacherResearch = (c.teacher_research ?? "").trim();
      if (!teacherResearch) return null;
      return {
        id: c.id,
        headline: flashcardHeadline(c),
        phoneticReading: c.phonetic_reading?.trim() || null,
        categoryLabel: c.category_label?.trim() || null,
        teacherResearch,
      };
    })
    .filter((item): item is FlashcardNoteItem => item !== null);
}

export function compileFlashcardNotesMarkdown(
  lessonNumber: number,
  items: FlashcardNoteItem[]
): string | null {
  if (!items.length) return null;
  const parts = items.map((item) => {
    const meta = [item.phoneticReading, item.categoryLabel].filter(Boolean).join(" · ");
    const header = meta ? `## ${item.headline}\n\n*${meta}*` : `## ${item.headline}`;
    return `${header}\n\n${item.teacherResearch}`;
  });
  return [`# Lesson ${lessonNumber} — flashcard teacher notes`, "", ...parts].join("\n\n");
}

/** Short label for dashboard video note tabs (Vocabulary, Grammar, etc.). */
export function shortVideoTabLabel(title: string): string {
  const t = title.trim();
  if (!t) return "Video";

  const lower = t.toLowerCase();
  const hasVocab = /\bvocabulary\b/.test(lower);
  const hasGrammar = /\bgrammar\b/.test(lower);
  if (hasVocab && !hasGrammar) return "Vocabulary";
  if (hasGrammar && !hasVocab) return "Grammar";
  if (hasVocab && hasGrammar) return "Vocab & grammar";

  const afterLesson = t.match(/lesson\s*#?\s*\d+\s*[-–—:|]?\s*(.+)$/i);
  if (afterLesson?.[1]) {
    const tail = afterLesson[1].trim();
    if (tail.length <= 26) return tail;
    return `${tail.slice(0, 24)}…`;
  }

  if (t.length <= 28) return t;
  return `${t.slice(0, 26)}…`;
}

export function compileLessonNotesMarkdown(
  lessonNumber: number,
  notes: LessonNoteRecord[]
): string | null {
  const forLesson = notes.filter((n) => matchesLessonNumber(n.videoTitle, lessonNumber));
  if (!forLesson.length) return null;

  const parts = forLesson.map((n) => `## ${n.videoTitle}\n\n${n.notes.trim()}`);
  return [`# Lesson ${lessonNumber} — compiled teaching notes`, "", ...parts].join("\n\n");
}

async function fetchPlaylistVideos(jlptLevel: JlptPlaylistKey): Promise<YoutubePlaylistVideo[]> {
  const def = JLPT_YOUTUBE_PLAYLISTS.find((p) => p.key === jlptLevel);
  if (!def) return [];
  try {
    const res = await fetch(`/api/youtube/playlist?playlistId=${encodeURIComponent(def.playlistId)}`);
    const json = (await res.json()) as { videos?: YoutubePlaylistVideo[] };
    return Array.isArray(json.videos) ? json.videos : [];
  } catch {
    return [];
  }
}

export async function loadLessonDashboardData(
  lessonNumber: number,
  jlptLevel: JlptPlaylistKey
): Promise<LessonDashboardData> {
  const [rootFolders, sets, allNotes, playlistVideos] = await Promise.all([
    listWorkspaceFolders(null),
    listCardSets(),
    listAllLessonNotes(),
    fetchPlaylistVideos(jlptLevel),
  ]);

  const levelFolder = findLevelFolder(rootFolders, jlptLevel);
  const lessonFolders = levelFolder ? await listWorkspaceFolders(levelFolder.id) : [];
  const lessonFolder = findLessonFolder(lessonFolders, lessonNumber);

  const documentsTrail: { id: string; name: string }[] = [];
  if (levelFolder) documentsTrail.push({ id: levelFolder.id, name: levelFolder.name });
  if (lessonFolder) documentsTrail.push({ id: lessonFolder.id, name: lessonFolder.name });

  const documentFiles = lessonFolder ? await listWorkspaceFiles(lessonFolder.id) : [];
  const flashcardSet = findFlashcardSet(sets, lessonNumber);
  const flashcards = flashcardSet ? await listFlashcardsInSet(flashcardSet.id) : [];
  const flashcardNotes = toFlashcardNoteItems(flashcards);
  const youtubeVideos = filterYoutubeVideos(playlistVideos, lessonNumber);
  const lessonNotes = allNotes.filter((n) => matchesLessonNumber(n.videoTitle, lessonNumber));
  const compiledNotes = compileLessonNotesMarkdown(lessonNumber, allNotes);

  return {
    lessonNumber,
    jlptLevel,
    levelFolder,
    lessonFolder,
    documentsTrail,
    documentFiles,
    flashcardSet,
    flashcardNotes,
    youtubeVideos,
    lessonNotes,
    compiledNotes,
  };
}

export function suggestedLessonFolderName(lessonNumber: number): string {
  return lessonFolderName(lessonNumber);
}

export function suggestedFlashcardSetName(lessonNumber: number): string {
  return lessonVocabularySetName(lessonNumber);
}

export function jlptLevelLabel(key: JlptPlaylistKey): string {
  return JLPT_YOUTUBE_PLAYLISTS.find((p) => p.key === key)?.label ?? key.toUpperCase();
}

export { parseLessonNumber };
