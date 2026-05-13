/**
 * Audio lessons: Supabase + storage when configured; otherwise local IDB (same browser only).
 */

import {
  createLocalAudioLesson,
  deleteLocalAudioLesson,
  getLocalAudioLessonBlob,
  listLocalAudioLessons,
  updateLocalAudioLesson,
} from "@/lib/audio-lesson-store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AudioLessonRow, AudioLessonSegment } from "@/lib/types";

export type { AudioLessonSegment };

const BUCKET = "audio-lessons";

function describeClientErr(e: unknown): string {
  if (e instanceof Error) return e.message.trim() || e.name || "(Error)";
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
    if (typeof o.statusCode === "number") return `HTTP ${o.statusCode}`;
    if (typeof o.code === "string") return `code ${o.code}`;
  }
  try {
    const s = JSON.stringify(e);
    if (s && s !== "{}") return s;
  } catch {
    /* ignore */
  }
  return "(error object had no readable message — check Network tab)";
}

function logRepoError(context: string, e: unknown): void {
  console.error(`[audio-lesson-repo] ${context}:`, describeClientErr(e), e);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\- ()[\]]+/gu, "_").slice(0, 200) || "audio";
}

function parseSegments(raw: unknown): AudioLessonSegment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => ({
    startSec: Number((x as AudioLessonSegment).startSec),
    endSec: Number((x as AudioLessonSegment).endSec),
    text: typeof (x as AudioLessonSegment).text === "string" ? (x as AudioLessonSegment).text : undefined,
    speaker:
      typeof (x as AudioLessonSegment).speaker === "string" && (x as AudioLessonSegment).speaker!.trim()
        ? (x as AudioLessonSegment).speaker!.trim()
        : undefined,
  }));
}

function mapDbRow(r: Record<string, unknown>): AudioLessonRow {
  const pd = r.phrase_division;
  const phrase_division = pd === "lesson" || pd === "raw" ? pd : undefined;
  return {
    id: String(r.id),
    title: String(r.title),
    filename: String(r.filename),
    storage_path: String(r.storage_path),
    mime_type: r.mime_type != null ? String(r.mime_type) : null,
    byte_size: r.byte_size != null ? Number(r.byte_size) : null,
    duration_sec: Number(r.duration_sec),
    sample_rate: Number(r.sample_rate),
    number_of_channels: Number(r.number_of_channels),
    segments: parseSegments(r.segments),
    phrase_division,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

export async function getAudioLesson(id: string): Promise<AudioLessonRow | null> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data, error } = await supabase.from("audio_lessons").select("*").eq("id", id).maybeSingle();
    if (error) {
      logRepoError("getAudioLesson", error);
      return null;
    }
    if (!data) return null;
    return mapDbRow(data as Record<string, unknown>);
  }
  return listLocalAudioLessons().find((x) => x.id === id) ?? null;
}

export async function listAudioLessons(): Promise<AudioLessonRow[]> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("audio_lessons")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      logRepoError("listAudioLessons", error);
      return listLocalAudioLessons();
    }
    return (data ?? []).map((r) => mapDbRow(r as Record<string, unknown>));
  }
  return listLocalAudioLessons();
}

export async function createAudioLesson(options: {
  file: Blob;
  filename: string;
  title: string;
  durationSec: number;
  sampleRate: number;
  numberOfChannels: number;
  segments: AudioLessonSegment[];
  phrase_division?: "lesson" | "raw";
}): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const id = crypto.randomUUID();
  const safe = sanitizeFilename(options.filename);
  const path = `lessons/${id}/${safe}`;
  const now = new Date().toISOString();

  if (supabase) {
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, options.file, {
      cacheControl: "3600",
      upsert: false,
      contentType: options.file.type || "application/octet-stream",
    });
    if (upErr) {
      logRepoError("storage.upload", upErr);
      throw upErr;
    }
    const { error: insErr } = await supabase.from("audio_lessons").insert({
      id,
      title: options.title.trim() || options.filename,
      filename: options.filename,
      storage_path: path,
      mime_type: options.file.type || null,
      byte_size: options.file.size,
      duration_sec: options.durationSec,
      sample_rate: options.sampleRate,
      number_of_channels: options.numberOfChannels,
      segments: options.segments,
      ...(options.phrase_division ? { phrase_division: options.phrase_division } : {}),
      created_at: now,
      updated_at: now,
    });
    if (insErr) {
      logRepoError("audio_lessons.insert", insErr);
      await supabase.storage.from(BUCKET).remove([path]);
      throw insErr;
    }
    return id;
  }

  return createLocalAudioLesson(options.file, {
    title: options.title.trim() || options.filename,
    filename: options.filename,
    mime_type: options.file.type || null,
    byte_size: options.file.size,
    duration_sec: options.durationSec,
    sample_rate: options.sampleRate,
    number_of_channels: options.numberOfChannels,
    segments: options.segments,
    phrase_division: options.phrase_division,
    id,
  });
}

function normalizeDisplayFilename(name: string): string {
  const base = name.trim().replace(/^.*[/\\]/, "").slice(0, 255);
  return base || "audio";
}

export async function updateAudioLesson(
  id: string,
  patch: Partial<Pick<AudioLessonRow, "title" | "segments" | "filename" | "phrase_division">>
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const now = new Date().toISOString();

  if (supabase) {
    const row: Record<string, unknown> = { updated_at: now };
    if (patch.title !== undefined) row.title = patch.title.trim();
    if (patch.filename !== undefined) row.filename = normalizeDisplayFilename(patch.filename);
    if (patch.segments !== undefined) row.segments = patch.segments;
    if (patch.phrase_division !== undefined) row.phrase_division = patch.phrase_division;
    const { error } = await supabase.from("audio_lessons").update(row).eq("id", id);
    if (error) {
      logRepoError("audio_lessons.update", error);
      throw error;
    }
    return;
  }

  await updateLocalAudioLesson(id, {
    ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
    ...(patch.filename !== undefined ? { filename: normalizeDisplayFilename(patch.filename) } : {}),
    ...(patch.segments !== undefined ? { segments: patch.segments } : {}),
    ...(patch.phrase_division !== undefined ? { phrase_division: patch.phrase_division } : {}),
  });
}

export async function deleteAudioLesson(row: AudioLessonRow): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { error: r1 } = await supabase.storage.from(BUCKET).remove([row.storage_path]);
    if (r1) logRepoError("storage.remove", r1);
    const { error: r2 } = await supabase.from("audio_lessons").delete().eq("id", row.id);
    if (r2) {
      logRepoError("audio_lessons.delete", r2);
      throw r2;
    }
    return;
  }
  await deleteLocalAudioLesson(row.id);
}

/** Download audio file for decoding in the browser. */
export async function fetchAudioLessonBlob(row: AudioLessonRow): Promise<Blob> {
  const supabase = getSupabaseBrowserClient();
  if (supabase && !row.storage_path.startsWith("idb:")) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 3600);
    if (error || !data?.signedUrl) {
      logRepoError("storage.createSignedUrl", error ?? "(no signedUrl)");
      throw new Error("Could not access audio file.");
    }
    const res = await fetch(data.signedUrl);
    if (!res.ok) throw new Error("Download failed.");
    return res.blob();
  }
  const blob = await getLocalAudioLessonBlob(row.id);
  if (!blob) throw new Error("Audio not found in browser storage.");
  return blob;
}
