/**
 * Groq OpenAI-compatible speech-to-text (Whisper) with phrase-level timestamps.
 * https://console.groq.com/docs/speech-to-text
 */

import { isGroqConfigured } from "@/lib/groq-openai";

const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

/** Default Whisper model on Groq (override with GROQ_WHISPER_MODEL). */
export const DEFAULT_GROQ_WHISPER_MODEL = "whisper-large-v3-turbo";

export type GroqWhisperPhraseSegment = {
  startSec: number;
  endSec: number;
  text: string;
};

export function isGroqWhisperConfigured(): boolean {
  return isGroqConfigured();
}

export function resolveGroqWhisperModelId(): string {
  const raw = process.env.GROQ_WHISPER_MODEL?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_GROQ_WHISPER_MODEL;
}

/**
 * Transcribe audio and return timed segments (good phrase boundaries for dialogue).
 * Does not perform speaker diarization — splits follow Whisper’s segmenter.
 */
export async function groqTranscriptionPhraseSegments(options: {
  file: Blob;
  filename: string;
  /** ISO-639-1 e.g. ja — improves Japanese accuracy */
  language?: string;
}): Promise<GroqWhisperPhraseSegment[]> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set.");
  }

  const model = resolveGroqWhisperModelId();

  const form = new FormData();
  form.append("file", options.file, options.filename);
  form.append("model", model);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  if (options.language) {
    form.append("language", options.language);
  }

  const res = await fetch(GROQ_TRANSCRIBE_URL, {
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
    throw new Error(`Groq transcription returned non-JSON (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    const errMsg =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error?: { message?: string } }).error?.message ?? raw.slice(0, 400))
        : raw.slice(0, 400);
    throw new Error(`Groq transcription (${res.status}): ${errMsg}`);
  }

  const segments = (data as { segments?: { start: number; end: number; text?: string }[] }).segments;
  if (!Array.isArray(segments)) {
    throw new Error("Groq response missing segments array.");
  }

  return segments.map((s) => ({
    startSec: Math.max(0, s.start),
    endSec: Math.max(s.start, s.end),
    text: typeof s.text === "string" ? s.text.trim() : "",
  }));
}
