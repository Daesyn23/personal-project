import { NextResponse } from "next/server";
import {
  buildJapanesePracticeRealtimeInstruction,
  normalizePracticeSpeechRegister,
  type JlptPracticeLevel,
} from "@/lib/japanese-practice-prompt";

export const runtime = "nodejs";

const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const DEFAULT_REALTIME_MODEL = "gpt-realtime-2.1";
const DEFAULT_REALTIME_VOICE = "cedar";
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-live-transcribe";

function configured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function model() {
  return process.env.OPENAI_REALTIME_MODEL?.trim() || DEFAULT_REALTIME_MODEL;
}

function voice() {
  return process.env.OPENAI_REALTIME_VOICE?.trim() || DEFAULT_REALTIME_VOICE;
}

function level(raw: string | null): JlptPracticeLevel {
  return raw === "N4" ? "N4" : "N5";
}

function eagerness(raw: string | null): "low" | "medium" | "high" {
  if (raw === "low" || raw === "medium") return raw;
  return "high";
}

const FEEDBACK_TOOL = {
  type: "function",
  name: "report_japanese_feedback",
  description:
    "Report a private, concise assessment of the learner's latest spoken turn. Judge the audio itself, including intelligibility and pronunciation, not only a transcript.",
  parameters: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["correct", "almost", "needs_practice", "not_japanese"],
        description:
          "correct if the Japanese is natural and clearly pronounced; almost for one small issue; needs_practice only for a meaningful issue; not_japanese if the turn was not mainly Japanese.",
      },
      heard: {
        type: "string",
        description: "A short Japanese transcript of what was heard, or an empty string for non-Japanese.",
      },
      natural_japanese: {
        type: "string",
        description:
          "The most natural corrected Japanese, but only when status is almost or needs_practice. Otherwise an empty string.",
      },
      feedback: {
        type: "string",
        description:
          "One short, friendly English tip. Mention the single most useful grammar or pronunciation point. Empty for not_japanese.",
      },
      pronunciation_focus: {
        type: "string",
        description:
          "At most one short pronunciation target such as a long vowel, doubled consonant, mora timing, or pitch movement. Empty when no clear audio issue is present.",
      },
    },
    required: [
      "status",
      "heard",
      "natural_japanese",
      "feedback",
      "pronunciation_focus",
    ],
    additionalProperties: false,
  },
} as const;

export async function GET() {
  return NextResponse.json({
    configured: configured(),
    model: model(),
    voice: voice(),
    transport: "webrtc",
  });
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set." }, { status: 503 });
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/sdp") && !contentType.includes("text/plain")) {
    return NextResponse.json({ error: "Expected an SDP offer." }, { status: 415 });
  }

  const offer = await req.text();
  if (!offer.trim() || offer.length > 250_000) {
    return NextResponse.json({ error: "Invalid SDP offer." }, { status: 400 });
  }

  const url = new URL(req.url);
  const jlptLevel = level(url.searchParams.get("level"));
  const register = normalizePracticeSpeechRegister(url.searchParams.get("register"));
  const vadEagerness = eagerness(url.searchParams.get("eagerness"));

  const session = {
    type: "realtime",
    model: model(),
    output_modalities: ["audio"],
    instructions: buildJapanesePracticeRealtimeInstruction(jlptLevel, register),
    max_output_tokens: 240,
    reasoning: { effort: "low" },
    audio: {
      input: {
        transcription: {
          model: process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL?.trim() || DEFAULT_TRANSCRIPTION_MODEL,
          prompt:
            "A friendly Japanese practice conversation. Expect JLPT N5/N4 Japanese, English, and occasional Filipino or Tagalog. Preserve Japanese particles, verb endings, long vowels, and small っ accurately.",
          languages: ["ja", "en"],
          delay: "low",
        },
        turn_detection: {
          type: "semantic_vad",
          eagerness: vadEagerness,
          create_response: true,
          interrupt_response: true,
        },
      },
      output: {
        voice: voice(),
      },
    },
    tools: [FEEDBACK_TOOL],
    // Speak on the automatic VAD response immediately. The browser requests the
    // private feedback tool in a separate, non-audio response after speech is generated.
    tool_choice: "none",
  };

  const form = new FormData();
  form.set("sdp", offer);
  form.set("session", JSON.stringify(session));

  try {
    const response = await fetch(OPENAI_REALTIME_CALLS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const body = await response.text();
    if (!response.ok) {
      let message = body.slice(0, 500);
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        message = parsed.error?.message || message;
      } catch {
        // Keep the response excerpt.
      }
      return NextResponse.json(
        { error: `OpenAI Realtime error (${response.status}): ${message}` },
        { status: 502 }
      );
    }
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/sdp",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start Realtime voice.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
