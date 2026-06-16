import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const LOCAL_STORAGE_KEY = "video-lessons-notes-cache-v1";
const LEGACY_SESSION_KEY = LOCAL_STORAGE_KEY;

export type SavedLessonNotes = {
  notes: string;
  videoTitle: string;
  transcriptLanguage: string;
  generatedAt: string;
};

export function isYoutubeLessonNotesSynced(): boolean {
  return getSupabaseBrowserClient() !== null;
}

function isValidEntry(raw: unknown): raw is SavedLessonNotes {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    typeof o.notes === "string" &&
    o.notes.trim().length > 0 &&
    typeof o.videoTitle === "string" &&
    typeof o.transcriptLanguage === "string" &&
    typeof o.generatedAt === "string"
  );
}

function readAllLocal(): Record<string, SavedLessonNotes> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return migrateLegacySessionCache();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, SavedLessonNotes> = {};
    for (const [videoId, entry] of Object.entries(parsed)) {
      if (isValidEntry(entry)) out[videoId] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

function migrateLegacySessionCache(): Record<string, SavedLessonNotes> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(LEGACY_SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, SavedLessonNotes> = {};
    for (const [videoId, entry] of Object.entries(parsed)) {
      if (isValidEntry(entry)) out[videoId] = entry;
    }
    if (Object.keys(out).length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(out));
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
    }
    return out;
  } catch {
    return {};
  }
}

function writeAllLocal(cache: Record<string, SavedLessonNotes>) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cache));
}

function saveLocal(videoId: string, entry: SavedLessonNotes) {
  const cache = readAllLocal();
  cache[videoId] = entry;
  writeAllLocal(cache);
}

export function loadLocalLessonNotes(videoId: string): SavedLessonNotes | null {
  const id = videoId.trim();
  if (!id) return null;
  return readAllLocal()[id] ?? null;
}

type RemoteRow = {
  video_id: string;
  video_title: string;
  notes: string;
  transcript_language: string;
  generated_at: string;
  updated_at: string;
};

function rowToEntry(row: RemoteRow): SavedLessonNotes {
  return {
    notes: row.notes,
    videoTitle: row.video_title,
    transcriptLanguage: row.transcript_language,
    generatedAt: row.generated_at,
  };
}

function entryMs(entry: SavedLessonNotes): number {
  const ms = Date.parse(entry.generatedAt);
  return Number.isFinite(ms) ? ms : 0;
}

async function fetchRemoteLessonNotes(videoId: string): Promise<SavedLessonNotes | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("youtube_lesson_notes")
    .select("video_id, video_title, notes, transcript_language, generated_at, updated_at")
    .eq("video_id", videoId)
    .maybeSingle();
  if (error) {
    console.error("[youtube-lesson-notes] fetch", error);
    return null;
  }
  if (!data) return null;
  return rowToEntry(data as RemoteRow);
}

async function pushRemoteLessonNotes(videoId: string, entry: SavedLessonNotes): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;
  const now = new Date().toISOString();
  const { error } = await supabase.from("youtube_lesson_notes").upsert(
    {
      video_id: videoId,
      video_title: entry.videoTitle,
      notes: entry.notes,
      transcript_language: entry.transcriptLanguage,
      generated_at: entry.generatedAt,
      updated_at: now,
    },
    { onConflict: "video_id" }
  );
  if (error) {
    console.error("[youtube-lesson-notes] push", error);
    return false;
  }
  return true;
}

export type LoadLessonNotesResult = {
  entry: SavedLessonNotes;
  synced: boolean;
};

/** Loads saved notes, preferring the newest copy between Supabase and local cache. */
export async function loadSavedLessonNotes(videoId: string): Promise<LoadLessonNotesResult | null> {
  const id = videoId.trim();
  if (!id) return null;

  const local = loadLocalLessonNotes(id);
  const remote = await fetchRemoteLessonNotes(id);

  if (!remote && !local) return null;

  if (!remote && local) {
    const synced = await pushRemoteLessonNotes(id, local);
    return { entry: local, synced };
  }

  if (remote && !local) {
    saveLocal(id, remote);
    return { entry: remote, synced: true };
  }

  if (remote && local) {
    if (entryMs(remote) >= entryMs(local)) {
      saveLocal(id, remote);
      return { entry: remote, synced: true };
    }
    const synced = await pushRemoteLessonNotes(id, local);
    return { entry: local, synced };
  }

  return local ? { entry: local, synced: false } : null;
}

export async function saveLessonNotes(
  videoId: string,
  entry: SavedLessonNotes
): Promise<{ synced: boolean }> {
  const id = videoId.trim();
  if (!id || !entry.notes.trim()) return { synced: false };

  saveLocal(id, entry);
  const synced = await pushRemoteLessonNotes(id, entry);
  return { synced };
}
