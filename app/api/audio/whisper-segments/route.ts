import { NextResponse } from "next/server";
import { groqTranscriptionPhraseSegments } from "@/lib/groq-whisper-transcription";
import { isGroqConfigured } from "@/lib/groq-openai";

export const runtime = "nodejs";

/** Groq free tier file limit (see Groq speech-to-text docs). */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * POST multipart/form-data: field `file` = audio (flac, mp3, m4a, wav, webm, …).
 * Optional field `language` (default ja).
 * Returns phrase-level segments from Whisper — useful split points for dialogue.
 */
export async function POST(req: Request) {
  if (!isGroqConfigured()) {
    return NextResponse.json(
      {
        error:
          "Add GROQ_API_KEY to .env.local (Groq free tier includes Whisper). Restart the dev server after saving.",
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

  const nameGuess = file instanceof File ? file.name : "audio.wav";

  try {
    const segments = await groqTranscriptionPhraseSegments({
      file,
      filename: nameGuess,
      language,
    });

    const filtered = segments.filter((s) => s.endSec > s.startSec && s.endSec - s.startSec >= 0.02);

    return NextResponse.json({
      segments: filtered.map((s) => ({
        startSec: s.startSec,
        endSec: s.endSec,
        text: s.text,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transcription failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
