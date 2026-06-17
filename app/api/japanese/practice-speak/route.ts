import { NextResponse } from "next/server";
import {
  isOpenAiTtsConfigured,
  MAX_TUTOR_TTS_CHARS,
  openaiTextToSpeechMp3,
  type PracticeTtsRegister,
} from "@/lib/openai-tts";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ configured: isOpenAiTtsConfigured() });
}

export async function POST(req: Request) {
  if (!isOpenAiTtsConfigured()) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text =
    body && typeof body === "object" && typeof (body as { text?: unknown }).text === "string"
      ? (body as { text: string }).text.trim()
      : "";
  if (!text) {
    return NextResponse.json({ error: "text is required." }, { status: 400 });
  }
  if (text.length > MAX_TUTOR_TTS_CHARS) {
    return NextResponse.json({ error: `text max ${MAX_TUTOR_TTS_CHARS} characters.` }, { status: 400 });
  }

  const speechRegister: PracticeTtsRegister =
    body &&
    typeof body === "object" &&
    (body as { speechRegister?: unknown }).speechRegister === "casual"
      ? "casual"
      : "polite";

  try {
    const { bytes, voice } = await openaiTextToSpeechMp3(text, { register: speechRegister });
    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Tts-Voice": voice,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "TTS failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
