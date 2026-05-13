import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { generateTextGeminiThenGroq, isAnyTextLlmConfigured } from "@/lib/gemini-with-groq-fallback";
import { geminiModelAttemptOrder, resolveGeminiModelId } from "@/lib/gemini-model";

export const runtime = "nodejs";

const MAX_SOURCE_CHARS = 4_000;
const MAX_CONTEXT_CHARS = 600;

const SYSTEM_INSTRUCTION = `You are an expert Japanese-to-English translator for learners.
You MUST reply with a single JSON object only. No markdown fences, no keys other than those listed, no trailing commentary.

Schema:
{
  "english": string,
  "nuance": string | null
}

Rules:
- "english": natural, idiomatic English. Match the Japanese register implied by the user's style hint (polite / casual / neutral).
- "nuance": At most one short English sentence (≤220 chars) on word choice, ambiguity, cultural note, or literal vs natural rendering; otherwise null.
- Preserve meaning; do not add explanations inside "english" (put brief notes in "nuance" only).
- If the input is empty or not Japanese text, set english to a brief apology and explain in nuance.`;

function stripJsonFence(raw: string): string {
  let t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  if (fence) t = fence[1]!.trim();
  return t;
}

function parseStyle(raw: unknown): "neutral" | "polite" | "casual" {
  if (raw === "polite" || raw === "casual" || raw === "neutral") return raw;
  return "neutral";
}

export async function POST(req: Request) {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!isAnyTextLlmConfigured(geminiKey)) {
    return NextResponse.json(
      {
        error:
          "Translation needs an LLM key. Add GEMINI_API_KEY, GROQ_API_KEY, and/or OPENAI_API_KEY to .env.local and restart the dev server.",
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

  const text = typeof (body as { text?: unknown }).text === "string" ? (body as { text: string }).text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Enter some Japanese to translate." }, { status: 400 });
  }
  if (text.length > MAX_SOURCE_CHARS) {
    return NextResponse.json(
      { error: `Text is too long. Maximum is ${MAX_SOURCE_CHARS} characters.` },
      { status: 400 }
    );
  }

  const style = parseStyle((body as { style?: unknown }).style);
  const contextRaw =
    typeof (body as { context?: unknown }).context === "string"
      ? (body as { context: string }).context.trim()
      : "";
  const context =
    contextRaw.length > MAX_CONTEXT_CHARS ? contextRaw.slice(0, MAX_CONTEXT_CHARS) : contextRaw;

  const styleLine =
    style === "polite"
      ? "Source register: assume polite です／ます style unless the Japanese clearly uses casual forms; render as natural polite English."
      : style === "casual"
        ? "Source register: prefer casual / conversational English when the Japanese is plain or casual; avoid stiff written English unless the source is formal."
        : "Source register: neutral standard English (natural, clear, not slangy unless the Japanese is).";

  const userBlock = [
    "Translation task (Japanese → English):",
    styleLine,
    context ? `Extra context from the user (may disambiguate):\n${context}` : null,
    "",
    "Japanese:",
    text,
  ]
    .filter(Boolean)
    .join("\n");

  const genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;
  const primaryModel = resolveGeminiModelId(process.env.GEMINI_MODEL);
  const modelAttempts = geminiModelAttemptOrder(primaryModel);

  try {
    const { text: rawText, model: modelName } = await generateTextGeminiThenGroq({
      logLabel: "translate/ja-en",
      geminiApiKey: geminiKey,
      modelAttempts,
      runGemini: async (modelName) => {
        if (!genAI) throw new Error("Gemini not configured");
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: SYSTEM_INSTRUCTION,
        });
        const result = await model.generateContent(userBlock);
        return result.response.text();
      },
      groq: {
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: userBlock },
        ],
        jsonMode: true,
      },
    });

    if (!rawText?.trim()) {
      throw new Error("Empty model response.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFence(rawText));
    } catch {
      throw new Error("Model did not return valid JSON.");
    }

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid JSON shape from model.");
    }

    const english =
      typeof (parsed as { english?: unknown }).english === "string"
        ? (parsed as { english: string }).english.trim()
        : "";
    if (!english) {
      throw new Error("Translation was empty.");
    }

    const nuanceVal = (parsed as { nuance?: unknown }).nuance;
    const nuance =
      typeof nuanceVal === "string" && nuanceVal.trim().length > 0 ? nuanceVal.trim().slice(0, 280) : null;

    return NextResponse.json({
      english,
      nuance,
      model: modelName,
    });
  } catch (e) {
    let msg = e instanceof Error ? e.message : "Translation request failed.";
    if (msg.includes("404") && msg.includes("not found")) {
      msg += ` Tried Gemini: ${modelAttempts.join(", ")}.`;
    }
    console.error("[translate/ja-en]", e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
