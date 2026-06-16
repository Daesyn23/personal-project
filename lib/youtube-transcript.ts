import { YoutubeTranscript } from "youtube-transcript";

export type YoutubeTranscriptSegment = {
  text: string;
  offsetMs: number;
  durationMs: number;
  languageCode: string;
};

const LANG_PREFERENCE = ["en", "en-US", "en-GB", "ja", "ja-JP"] as const;

function normalizeSegmentText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function pickLanguage(
  available: Set<string>,
  preferred: readonly string[]
): string | null {
  for (const lang of preferred) {
    if (available.has(lang)) return lang;
  }
  const first = available.values().next().value;
  return typeof first === "string" ? first : null;
}

const LANG_ATTEMPTS: Array<{ lang?: string }> = [
  {},
  { lang: "ja" },
  { lang: "en" },
  { lang: "en-US" },
];

/**
 * Fetches the best available YouTube caption track for a video.
 * Tries default track, then Japanese, then English.
 */
export async function fetchYoutubeTranscript(
  videoId: string
): Promise<{ segments: YoutubeTranscriptSegment[]; languageCode: string }> {
  const id = videoId.trim();
  if (!id || !/^[\w-]{6,}$/.test(id)) {
    throw new Error("Invalid video id.");
  }

  let segments: Awaited<ReturnType<typeof YoutubeTranscript.fetchTranscript>> | null = null;
  let lastErr: unknown;

  for (const attempt of LANG_ATTEMPTS) {
    try {
      const batch = attempt.lang
        ? await YoutubeTranscript.fetchTranscript(id, { lang: attempt.lang })
        : await YoutubeTranscript.fetchTranscript(id);
      if (batch.length > 0) {
        segments = batch;
        break;
      }
    } catch (e) {
      lastErr = e;
    }
  }

  if (!segments?.length) {
    const msg = lastErr instanceof Error ? lastErr.message : "Could not load captions.";
    const noCaptions =
      /disabled|not available|No transcripts/i.test(msg) || msg.includes("Transcript");
    throw new Error(
      noCaptions
        ? "Could not load captions for this video. Use Add notes to paste your own write-up, or try again later."
        : `Could not load captions: ${msg}`
    );
  }

  const langs = new Set(
    segments.map((s) => s.lang).filter((lang): lang is string => Boolean(lang))
  );
  const languageCode = pickLanguage(langs, LANG_PREFERENCE) ?? segments[0]!.lang ?? "unknown";

  const filtered =
    languageCode === "unknown"
      ? segments
      : segments.filter((s) => s.lang === languageCode || !s.lang);

  const out: YoutubeTranscriptSegment[] = filtered.map((s) => ({
    text: normalizeSegmentText(s.text),
    offsetMs: Math.round(s.offset),
    durationMs: Math.round(s.duration),
    languageCode: s.lang || languageCode,
  }));

  const joined = out.map((s) => s.text).join(" ").trim();
  if (!joined) {
    throw new Error("Caption track was empty.");
  }

  return { segments: out, languageCode };
}

export function transcriptToPlainText(segments: YoutubeTranscriptSegment[]): string {
  return segments
    .map((s) => s.text)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keep prompt size reasonable for long grammar videos (~30–45 min). */
export function truncateTranscriptForPrompt(text: string, maxChars = 48_000): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  const head = t.slice(0, Math.floor(maxChars * 0.72));
  const tail = t.slice(-Math.floor(maxChars * 0.22));
  return `${head}\n\n[… middle of transcript omitted for length …]\n\n${tail}`;
}
