/**
 * OpenAI speech-to-text: Whisper + smart phrase sectioning (default), or optional diarization.
 * https://platform.openai.com/docs/api-reference/audio/createTranscription
 */

import type { LessonTimedSegment } from "@/lib/dialogue-segment-merge";
import type { TranscribedWord } from "@/lib/jlpt-listening-number-split";

const OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";

export const DEFAULT_OPENAI_WHISPER_MODEL = "whisper-1";

/** Model id for speaker-aware dialogue sections (see OpenAI speech-to-text docs). */
export const OPENAI_DIARIZE_MODEL = "gpt-4o-transcribe-diarize";

/** When `OPENAI_AUDIO_SECTIONING=diarize`, use speaker-aware transcription first. Default: Whisper + smart merge. */
export function openAiUsesDiarizeForLessonSegmenting(): boolean {
  return process.env.OPENAI_AUDIO_SECTIONING?.trim().toLowerCase() === "diarize";
}

export type OpenAIWhisperPhraseSegment = {
  startSec: number;
  endSec: number;
  text: string;
};

export function isOpenAiWhisperConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function resolveOpenAiWhisperModelId(): string {
  const raw = process.env.OPENAI_WHISPER_MODEL?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_OPENAI_WHISPER_MODEL;
}

export type OpenAiLessonTranscription = {
  segments: LessonTimedSegment[];
  words?: TranscribedWord[];
  fullText?: string;
};

/**
 * Whisper verbose_json with segment + word timestamps (for JLPT-style re-sectioning).
 */
export async function openaiTranscriptionVerboseBundle(options: {
  file: Blob;
  filename: string;
  language?: string;
}): Promise<{
  fullText: string;
  segments: OpenAIWhisperPhraseSegment[];
  words: TranscribedWord[];
}> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const model = resolveOpenAiWhisperModelId();

  const form = new FormData();
  form.append("file", options.file, options.filename);
  form.append("model", model);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("timestamp_granularities[]", "word");
  if (options.language) {
    form.append("language", options.language);
  }

  const res = await fetch(OPENAI_TRANSCRIBE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const raw = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI transcription returned non-JSON (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    const errMsg =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error?: { message?: string } }).error?.message ?? raw.slice(0, 400))
        : raw.slice(0, 400);
    throw new Error(`OpenAI transcription (${res.status}): ${errMsg}`);
  }

  const segments = (data as { segments?: { start: number; end: number; text?: string }[] }).segments;
  if (!Array.isArray(segments)) {
    throw new Error("OpenAI response missing segments array.");
  }

  const wordsRaw = (data as { words?: { start: number; end: number; word?: string; text?: string }[] }).words;
  const words: TranscribedWord[] = Array.isArray(wordsRaw)
    ? wordsRaw.map((w) => ({
        word: typeof w.word === "string" ? w.word : typeof w.text === "string" ? w.text : "",
        startSec: Math.max(0, w.start),
        endSec: Math.max(w.start, w.end),
      }))
    : [];

  const fullText = typeof (data as { text?: string }).text === "string" ? (data as { text: string }).text : "";

  return {
    fullText,
    segments: segments.map((s) => ({
      startSec: Math.max(0, s.start),
      endSec: Math.max(s.start, s.end),
      text: typeof s.text === "string" ? s.text.trim() : "",
    })),
    words,
  };
}

export async function openaiTranscriptionPhraseSegments(options: {
  file: Blob;
  filename: string;
  /** ISO-639-1 e.g. ja */
  language?: string;
}): Promise<OpenAIWhisperPhraseSegment[]> {
  const b = await openaiTranscriptionVerboseBundle(options);
  return b.segments;
}

/**
 * Speaker-labeled segments (one row per turn when the model splits on speaker / VAD).
 * Requires `chunking_strategy` for long clips; we always send `auto`.
 */
export async function openaiTranscriptionDiarizedSegments(options: {
  file: Blob;
  filename: string;
  language?: string;
}): Promise<LessonTimedSegment[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const form = new FormData();
  form.append("file", options.file, options.filename);
  form.append("model", OPENAI_DIARIZE_MODEL);
  form.append("response_format", "diarized_json");
  form.append("chunking_strategy", "auto");
  if (options.language) {
    form.append("language", options.language);
  }

  const res = await fetch(OPENAI_TRANSCRIBE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const raw = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI diarized transcription returned non-JSON (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    const errMsg =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error?: { message?: string } }).error?.message ?? raw.slice(0, 400))
        : raw.slice(0, 400);
    throw new Error(`OpenAI diarized transcription (${res.status}): ${errMsg}`);
  }

  const segments = (
    data as {
      segments?: { start: number; end: number; text?: string; speaker?: string }[];
    }
  ).segments;
  if (!Array.isArray(segments)) {
    throw new Error("OpenAI diarized response missing segments array.");
  }

  return segments.map((s) => ({
    startSec: Math.max(0, s.start),
    endSec: Math.max(s.start, s.end),
    text: typeof s.text === "string" ? s.text.trim() : "",
    speaker: typeof s.speaker === "string" && s.speaker.trim() ? s.speaker.trim() : undefined,
  }));
}

/**
 * Whisper timestamps by default; when `OPENAI_AUDIO_SECTIONING=diarize`, use speaker-aware transcription
 * first, then fall back to Whisper on failure.
 */
export async function openaiTranscriptionLessonSegments(options: {
  file: Blob;
  filename: string;
  language?: string;
}): Promise<OpenAiLessonTranscription> {
  if (!openAiUsesDiarizeForLessonSegmenting()) {
    const b = await openaiTranscriptionVerboseBundle(options);
    return {
      segments: b.segments.map((s) => ({
        startSec: s.startSec,
        endSec: s.endSec,
        text: s.text,
      })),
      words: b.words,
      fullText: b.fullText,
    };
  }

  try {
    return { segments: await openaiTranscriptionDiarizedSegments(options) };
  } catch (e) {
    console.warn("[audio-lesson] OpenAI diarize failed; falling back to Whisper segments:", e);
    const b = await openaiTranscriptionVerboseBundle(options);
    return {
      segments: b.segments.map((s) => ({
        startSec: s.startSec,
        endSec: s.endSec,
        text: s.text,
      })),
      words: b.words,
      fullText: b.fullText,
    };
  }
}
