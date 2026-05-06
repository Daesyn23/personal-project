/**
 * Local-only fallback when Supabase is not configured (same browser only).
 */

import { idbDeleteBlob, idbGetBlob, idbPutBlob } from "@/lib/workspace-idb";
import type { AudioLessonRow } from "@/lib/types";

const LS_KEY = "audio-lesson-library:v2";

function readRows(): AudioLessonRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as AudioLessonRow[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeRows(rows: AudioLessonRow[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rows));
}

export function listLocalAudioLessons(): AudioLessonRow[] {
  return readRows().sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
}

export async function createLocalAudioLesson(
  audioBlob: Blob,
  row: Omit<AudioLessonRow, "created_at" | "updated_at" | "storage_path"> & { id?: string }
): Promise<string> {
  const id = row.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  await idbPutBlob(id, audioBlob);
  const full: AudioLessonRow = {
    ...row,
    id,
    storage_path: `idb:${id}`,
    created_at: now,
    updated_at: now,
  };
  const list = readRows().filter((x) => x.id !== id);
  list.push(full);
  writeRows(list);
  return id;
}

export async function updateLocalAudioLesson(
  id: string,
  patch: Partial<
    Pick<AudioLessonRow, "title" | "filename" | "segments" | "duration_sec" | "sample_rate" | "number_of_channels">
  >
): Promise<void> {
  const list = readRows();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  list[i] = {
    ...list[i]!,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  writeRows(list);
}

export async function deleteLocalAudioLesson(id: string): Promise<void> {
  await idbDeleteBlob(id);
  writeRows(readRows().filter((x) => x.id !== id));
}

export async function getLocalAudioLessonBlob(id: string): Promise<Blob | undefined> {
  return idbGetBlob(id);
}
