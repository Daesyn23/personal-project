import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import {
  appendGeminiFreeTierQuotaHint,
  geminiModelAttemptOrder,
  resolveGeminiModelId,
  withGemini429QuotaRetry,
} from "@/lib/gemini-model";
import { generateTextGeminiThenGroq, isAnyTextLlmConfigured } from "@/lib/gemini-with-groq-fallback";
import {
  buildYoutubeLessonNotesUserPrompt,
  YOUTUBE_LESSON_NOTES_SYSTEM,
} from "@/lib/youtube-lesson-notes-prompt";
import {
  fetchYoutubeTranscript,
  transcriptToPlainText,
  truncateTranscriptForPrompt,
} from "@/lib/youtube-transcript";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!isAnyTextLlmConfigured(geminiKey)) {
    return NextResponse.json(
      {
        error:
          "Add GEMINI_API_KEY, GROQ_API_KEY, and/or OPENAI_API_KEY to .env.local (same as chat/translate) and restart the dev server.",
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected a JSON object." }, { status: 400 });
  }

  const videoId = (body as { videoId?: unknown }).videoId;
  const titleRaw = (body as { title?: unknown }).title;
  if (typeof videoId !== "string" || !videoId.trim()) {
    return NextResponse.json({ error: 'Expected "videoId" string.' }, { status: 400 });
  }
  const id = videoId.trim();
  if (!/^[\w-]{6,}$/.test(id)) {
    return NextResponse.json({ error: "Invalid video id." }, { status: 400 });
  }

  const videoTitle =
    typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : "YouTube lesson";

  let transcriptLanguage = "unknown";
  let transcriptForPrompt: string;
  try {
    const { segments, languageCode } = await fetchYoutubeTranscript(id);
    transcriptLanguage = languageCode;
    const plain = transcriptToPlainText(segments);
    transcriptForPrompt = truncateTranscriptForPrompt(plain);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load captions.";
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  const userBlock = buildYoutubeLessonNotesUserPrompt({
    videoTitle,
    videoId: id,
    transcript: transcriptForPrompt,
    transcriptLanguage,
  });

  const genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;
  const primaryModel = resolveGeminiModelId(process.env.GEMINI_MODEL);
  const modelAttempts = geminiModelAttemptOrder(primaryModel);

  try {
    const { text: rawText, provider, model } = await generateTextGeminiThenGroq({
      logLabel: "youtube/extract-lesson",
      geminiApiKey: geminiKey,
      modelAttempts,
      runGemini: async (modelName) => {
        if (!genAI) throw new Error("Gemini not configured");
        const geminiModel = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: YOUTUBE_LESSON_NOTES_SYSTEM,
        });
        const use429Retry =
          process.env.GEMINI_429_RETRY === "1" || process.env.GEMINI_429_RETRY === "true";
        const result = use429Retry
          ? await withGemini429QuotaRetry(
              () => geminiModel.generateContent(userBlock),
              { maxDelayMs: 70_000 }
            )
          : await geminiModel.generateContent(userBlock);
        return result.response.text();
      },
      groq: {
        messages: [
          { role: "system", content: YOUTUBE_LESSON_NOTES_SYSTEM },
          { role: "user", content: userBlock },
        ],
        temperature: 0.35,
      },
    });

    const notes = rawText.trim();
    if (!notes) {
      throw new Error("Model returned empty lesson notes.");
    }

    return NextResponse.json({
      videoId: id,
      videoTitle,
      notes,
      transcriptLanguage,
      provider,
      model,
    });
  } catch (e) {
    let msg = e instanceof Error ? e.message : "Lesson extraction failed.";
    if (msg.includes("404") && msg.includes("not found")) {
      msg += ` Tried Gemini: ${modelAttempts.join(", ")}.`;
    }
    if (/429|quota|too many requests|resource_exhausted/i.test(msg)) {
      msg = appendGeminiFreeTierQuotaHint(msg);
    }
    console.error("[youtube/extract-lesson]", e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
