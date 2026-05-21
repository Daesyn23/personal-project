import { NextResponse } from "next/server";
import { isOpenAiTtsConfigured, openaiTextToSpeechMp3 } from "@/lib/openai-tts";

export const runtime = "nodejs";

const MAX_SPEAK_CHARS = 4096;

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
  if (text.length > MAX_SPEAK_CHARS) {
    return NextResponse.json({ error: `text max ${MAX_SPEAK_CHARS} characters.` }, { status: 400 });
  }

  try {
    const { bytes, voice } = await openaiTextToSpeechMp3(text);
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
