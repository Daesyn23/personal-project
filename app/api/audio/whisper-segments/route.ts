import { NextResponse } from "next/server";
import { postProcessLessonTimedSegments, type LessonTimedSegment } from "@/lib/dialogue-segment-merge";
import { groqTranscriptionVerboseBundle } from "@/lib/groq-whisper-transcription";
import { isGroqConfigured } from "@/lib/groq-openai";
import { splitLessonSegmentsByJlptWordCuts, type TranscribedWord } from "@/lib/jlpt-listening-number-split";
import {
  isOpenAiWhisperConfigured,
  openaiTranscriptionLessonSegments,
} from "@/lib/openai-whisper-transcription";

export const runtime = "nodejs";

/** Typical Whisper API file limit (OpenAI / Groq). */
const MAX_BYTES = 25 * 1024 * 1024;

function whisperBackendConfigured(): boolean {
  return isOpenAiWhisperConfigured() || isGroqConfigured();
}

/**
 * POST multipart/form-data: field `file` = audio (flac, mp3, m4a, wav, webm, …).
 * Optional field `language` (default ja).
 * Returns timed segments: Whisper + word timestamps are used to split JLPT-style prompts
 * (`第N課`, numbered `2 ` / `3 ` / … items), then smart-merge runs. Diarize path skips word split.
 *
 * Optional field `division`: `lesson` (default) = JLPT-style word cuts + smart-merge; `raw` = return Whisper’s
 * segment timestamps only (no extra divider pass — good for non-lesson audio).
 *
 * Uses OpenAI when `OPENAI_API_KEY` is set; otherwise Groq (`GROQ_API_KEY`).
 */
export async function POST(req: Request) {
  if (!whisperBackendConfigured()) {
    return NextResponse.json(
      {
        error:
          "Add OPENAI_API_KEY or GROQ_API_KEY to .env.local for phrase transcription. OpenAI is preferred when both are set. Restart the dev server after saving.",
      },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "Missing or empty file." }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large for Whisper route (max ${Math.round(MAX_BYTES / (1024 * 1024))} MB).` },
      { status: 400 }
    );
  }

  const langRaw = form.get("language");
  const language =
    typeof langRaw === "string" && /^[a-z]{2}(-[A-Z]{2})?$/.test(langRaw.trim()) ? langRaw.trim() : "ja";

  const divisionRaw = form.get("division");
  const useLessonDivision =
    typeof divisionRaw !== "string" || divisionRaw.trim().toLowerCase() !== "raw";

  const nameGuess = file instanceof File ? file.name : "audio.wav";

  try {
    let raw: LessonTimedSegment[];
    let fullText = "";
    let words: TranscribedWord[] | undefined;

    if (isOpenAiWhisperConfigured()) {
      const o = await openaiTranscriptionLessonSegments({
        file,
        filename: nameGuess,
        language,
      });
      raw = o.segments;
      fullText = o.fullText ?? raw.map((s) => s.text).join("");
      words = o.words;
    } else {
      const g = await groqTranscriptionVerboseBundle({
        file,
        filename: nameGuess,
        language,
      });
      raw = g.segments.map((s) => ({
        startSec: s.startSec,
        endSec: s.endSec,
        text: s.text,
      }));
      fullText = g.fullText || raw.map((s) => s.text).join("");
      words = g.words;
    }

    let merged: LessonTimedSegment[];
    if (useLessonDivision) {
      const jlptSplit =
        words && words.length >= 2 && fullText
          ? splitLessonSegmentsByJlptWordCuts({
              fullText,
              words,
              fallbackSegments: raw,
            })
          : null;
      const preMerged = jlptSplit && jlptSplit.length > 0 ? jlptSplit : raw;
      merged = postProcessLessonTimedSegments(preMerged);
    } else {
      merged = raw;
    }

    const filtered = merged.filter((s) => s.endSec > s.startSec && s.endSec - s.startSec >= 0.02);

    const segmentPayload = filtered.map((s) => ({
      startSec: s.startSec,
      endSec: s.endSec,
      text: s.text,
      ...(s.speaker ? { speaker: s.speaker } : {}),
    }));

    const wordPayload =
      words && words.length > 0
        ? words.map((w) => ({
            word: w.word,
            startSec: w.startSec,
            endSec: w.endSec,
          }))
        : undefined;

    return NextResponse.json({
      segments: segmentPayload,
      ...(wordPayload ? { words: wordPayload } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transcription failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
