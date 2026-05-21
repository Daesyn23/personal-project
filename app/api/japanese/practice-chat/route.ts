import { NextResponse } from "next/server";
import {
  detectUtteranceLanguage,
  detectedLanguageLabel,
  type DetectedLanguage,
} from "@/lib/detect-utterance-language";
import {
  buildJapanesePracticeSystemInstruction,
  type JlptPracticeLevel,
} from "@/lib/japanese-practice-prompt";
import {
  isOpenAiChatConfigured,
  openaiChatCompletionText,
  type OpenAiChatMessage,
} from "@/lib/openai-chat";

export const runtime = "nodejs";

type ChatRole = "user" | "assistant" | "system";

type IncomingMessage = {
  role: ChatRole;
  content: string;
};

const MAX_MESSAGE_CHARS = 8_000;
const MAX_MESSAGES = 30;

function normalizeJlptLevel(raw: unknown): JlptPracticeLevel {
  return raw === "N4" ? "N4" : "N5";
}

function normalizeMessages(raw: unknown): IncomingMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const out: IncomingMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant" && role !== "system") return null;
    if (typeof content !== "string") return null;
    const trimmed = content.trim();
    if (role !== "system" && trimmed.length === 0) return null;
    if (trimmed.length > MAX_MESSAGE_CHARS) return null;
    out.push({ role, content: trimmed });
  }
  if (out.length === 0) return null;
  if (out.length > MAX_MESSAGES) return null;
  const last = out[out.length - 1];
  if (last?.role !== "user") return null;
  return out;
}

export async function GET() {
  const configured = isOpenAiChatConfigured();
  return NextResponse.json({ configured, provider: "openai" as const });
}

export async function POST(req: Request) {
  if (!isOpenAiChatConfigured()) {
    return NextResponse.json(
      {
        error:
          "Add OPENAI_API_KEY to .env.local for Japanese practice chat, then restart the dev server.",
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

  const jlptLevel = normalizeJlptLevel(
    body && typeof body === "object" ? (body as { jlptLevel?: unknown }).jlptLevel : undefined
  );
  const messages = normalizeMessages(
    body && typeof body === "object" ? (body as { messages?: unknown }).messages : undefined
  );
  if (!messages) {
    return NextResponse.json(
      { error: "messages must be a non-empty array ending with a user message (max 30 turns)." },
      { status: 400 }
    );
  }

  const systemInstruction = buildJapanesePracticeSystemInstruction(jlptLevel);
  const clientSystem = messages.filter((m) => m.role === "system").map((m) => m.content);
  const turns = messages.filter((m) => m.role !== "system");
  const lastUser = [...turns].reverse().find((m) => m.role === "user");
  const detected: DetectedLanguage = lastUser
    ? detectUtteranceLanguage(lastUser.content)
    : "unknown";
  const langHint =
    detected !== "unknown"
      ? `**This turn (auto-detected):** Learner is using **${detectedLanguageLabel(detected)}**. Match that language naturally.`
      : "";
  const mergedSystem = [systemInstruction, langHint, ...clientSystem].filter(Boolean).join("\n\n");

  const openAiMessages: OpenAiChatMessage[] = [
    { role: "system", content: mergedSystem },
    ...turns.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  try {
    const { text, model } = await openaiChatCompletionText({
      messages: openAiMessages,
      temperature: 0.65,
    });
    return NextResponse.json({
      text,
      model,
      provider: "openai" as const,
      detectedLanguage: detected !== "unknown" ? detected : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Practice chat failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
