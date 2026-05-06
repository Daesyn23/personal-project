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

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\- ()[\]]+/gu, "_").slice(0, 200) || "audio";
}

function parseSegments(raw: unknown): AudioLessonSegment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => ({
    startSec: Number((x as AudioLessonSegment).startSec),
    endSec: Number((x as AudioLessonSegment).endSec),
    text: typeof (x as AudioLessonSegment).text === "string" ? (x as AudioLessonSegment).text : undefined,
  }));
}

function mapDbRow(r: Record<string, unknown>): AudioLessonRow {
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
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

export async function getAudioLesson(id: string): Promise<AudioLessonRow | null> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data, error } = await supabase.from("audio_lessons").select("*").eq("id", id).maybeSingle();
    if (error) {
      console.error(error);
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
      console.error(error);
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
      console.error(upErr);
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
      created_at: now,
      updated_at: now,
    });
    if (insErr) {
      console.error(insErr);
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
    id,
  });
}

function normalizeDisplayFilename(name: string): string {
  const base = name.trim().replace(/^.*[/\\]/, "").slice(0, 255);
  return base || "audio";
}

export async function updateAudioLesson(
  id: string,
  patch: Partial<Pick<AudioLessonRow, "title" | "segments" | "filename">>
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const now = new Date().toISOString();

  if (supabase) {
    const row: Record<string, unknown> = { updated_at: now };
    if (patch.title !== undefined) row.title = patch.title.trim();
    if (patch.filename !== undefined) row.filename = normalizeDisplayFilename(patch.filename);
    if (patch.segments !== undefined) row.segments = patch.segments;
    const { error } = await supabase.from("audio_lessons").update(row).eq("id", id);
    if (error) {
      console.error(error);
      throw error;
    }
    return;
  }

  await updateLocalAudioLesson(id, {
    ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
    ...(patch.filename !== undefined ? { filename: normalizeDisplayFilename(patch.filename) } : {}),
    ...(patch.segments !== undefined ? { segments: patch.segments } : {}),
  });
}

export async function deleteAudioLesson(row: AudioLessonRow): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { error: r1 } = await supabase.storage.from(BUCKET).remove([row.storage_path]);
    if (r1) console.error(r1);
    const { error: r2 } = await supabase.from("audio_lessons").delete().eq("id", row.id);
    if (r2) {
      console.error(r2);
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
      console.error(error);
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
