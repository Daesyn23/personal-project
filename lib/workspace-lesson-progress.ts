import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { JlptPlaylistKey } from "@/lib/youtube-jlpt-playlists";

const LOCAL_KEY = "workspace-lesson-progress-v1";
const GLOBAL_ID = "global";

export type LessonProgress = {
  lessonNumber: number;
  jlptLevel: JlptPlaylistKey;
  updatedAt: string;
};

const DEFAULT_PROGRESS: LessonProgress = {
  lessonNumber: 1,
  jlptLevel: "n4",
  updatedAt: new Date(0).toISOString(),
};

function normalizeJlptLevel(raw: unknown): JlptPlaylistKey {
  if (raw === "n5" || raw === "n4" || raw === "n3") return raw;
  return "n4";
}

function readLocal(): LessonProgress {
  if (typeof window === "undefined") return DEFAULT_PROGRESS;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_PROGRESS;
    const o = JSON.parse(raw) as Record<string, unknown>;
    const lessonNumber = typeof o.lessonNumber === "number" ? o.lessonNumber : 1;
    return {
      lessonNumber: lessonNumber > 0 ? Math.floor(lessonNumber) : 1,
      jlptLevel: normalizeJlptLevel(o.jlptLevel),
      updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : DEFAULT_PROGRESS.updatedAt,
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

function writeLocal(progress: LessonProgress) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(progress));
}

function progressMs(p: LessonProgress): number {
  const ms = Date.parse(p.updatedAt);
  return Number.isFinite(ms) ? ms : 0;
}

export async function loadLessonProgress(): Promise<LessonProgress> {
  const local = readLocal();
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return local;

  const { data, error } = await supabase
    .from("workspace_lesson_progress")
    .select("lesson_number, jlpt_level, updated_at")
    .eq("id", GLOBAL_ID)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[workspace-lesson-progress] load", error);
    void saveLessonProgress(local);
    return local;
  }

  const remote: LessonProgress = {
    lessonNumber:
      typeof data.lesson_number === "number" && data.lesson_number > 0
        ? data.lesson_number
        : 1,
    jlptLevel: normalizeJlptLevel(data.jlpt_level),
    updatedAt:
      typeof data.updated_at === "string" ? data.updated_at : new Date().toISOString(),
  };

  if (progressMs(remote) >= progressMs(local)) {
    writeLocal(remote);
    return remote;
  }

  void saveLessonProgress(local);
  return local;
}

export async function saveLessonProgress(progress: LessonProgress): Promise<LessonProgress> {
  const next: LessonProgress = {
    lessonNumber: Math.max(1, Math.floor(progress.lessonNumber)),
    jlptLevel: normalizeJlptLevel(progress.jlptLevel),
    updatedAt: new Date().toISOString(),
  };
  writeLocal(next);

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { error } = await supabase.from("workspace_lesson_progress").upsert(
      {
        id: GLOBAL_ID,
        lesson_number: next.lessonNumber,
        jlpt_level: next.jlptLevel,
        updated_at: next.updatedAt,
      },
      { onConflict: "id" }
    );
    if (error) console.error("[workspace-lesson-progress] save", error);
  }

  return next;
}

export async function completeCurrentLesson(progress: LessonProgress): Promise<LessonProgress> {
  return saveLessonProgress({
    ...progress,
    lessonNumber: progress.lessonNumber + 1,
  });
}
