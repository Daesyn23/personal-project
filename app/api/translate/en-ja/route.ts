import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import {
  geminiModelAttemptOrder,
  resolveGeminiModelId,
  shouldAttemptNextGeminiModel,
} from "@/lib/gemini-model";

export const runtime = "nodejs";

const MAX_SOURCE_CHARS = 4_000;
const MAX_CONTEXT_CHARS = 600;

const SYSTEM_INSTRUCTION = `You are an expert English-to-Japanese translator for learners.
You MUST reply with a single JSON object only. No markdown fences, no keys other than those listed, no trailing commentary.

Schema:
{
  "japanese": string,
  "reading": string | null,
  "nuance": string | null
}

Rules:
- "japanese": natural, idiomatic Japanese. Match the user's requested register exactly.
- "reading": If the user asks for readings, a full hiragana reading of the entire Japanese line (okuri optional). If not asked, null.
- "nuance": At most one short English sentence (≤220 chars) on register, nuance, or ambiguity; otherwise null.
- Do not add furigana brackets inside "japanese" unless the source explicitly asks for ruby-style glosses.
- If the input is empty or not translatable, set japanese to a brief polite Japanese apology and explain in nuance in English.`;

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
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      {
        error:
          "Translation uses the same key as chat. Add GEMINI_API_KEY to .env.local and restart the dev server.",
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
    return NextResponse.json({ error: "Enter some English to translate." }, { status: 400 });
  }
  if (text.length > MAX_SOURCE_CHARS) {
    return NextResponse.json(
      { error: `Text is too long. Maximum is ${MAX_SOURCE_CHARS} characters.` },
      { status: 400 }
    );
  }

  const style = parseStyle((body as { style?: unknown }).style);
  const includeReading = Boolean((body as { includeReading?: unknown }).includeReading);
  const contextRaw =
    typeof (body as { context?: unknown }).context === "string"
      ? (body as { context: string }).context.trim()
      : "";
  const context =
    contextRaw.length > MAX_CONTEXT_CHARS ? contextRaw.slice(0, MAX_CONTEXT_CHARS) : contextRaw;

  const styleLine =
    style === "polite"
      ? "Register: polite です／ます style throughout."
      : style === "casual"
        ? "Register: casual / plain style suitable for friends or informal UI (avoid stiff 書き言葉 unless the English is formal)."
        : "Register: neutral standard Japanese (natural, not slangy, not overly stiff).";

  const userBlock = [
    "Translation task:",
    styleLine,
    `Include a full hiragana reading line in JSON field "reading": ${includeReading ? "yes" : "no"}`,
    context ? `Extra context from the user (may disambiguate):\n${context}` : null,
    "",
    "English:",
    text,
  ]
    .filter(Boolean)
    .join("\n");

  const genAI = new GoogleGenerativeAI(key);
  const primaryModel = resolveGeminiModelId(process.env.GEMINI_MODEL);
  const modelAttempts = geminiModelAttemptOrder(primaryModel);

  for (let i = 0; i < modelAttempts.length; i++) {
    const modelName = modelAttempts[i]!;
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTION,
      });
      const result = await model.generateContent(userBlock);
      const rawText = result.response.text();
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

      const japanese =
        typeof (parsed as { japanese?: unknown }).japanese === "string"
          ? (parsed as { japanese: string }).japanese.trim()
          : "";
      if (!japanese) {
        throw new Error("Translation was empty.");
      }

      const readingVal = (parsed as { reading?: unknown }).reading;
      const reading =
        typeof readingVal === "string" && readingVal.trim().length > 0 ? readingVal.trim() : null;

      const nuanceVal = (parsed as { nuance?: unknown }).nuance;
      const nuance =
        typeof nuanceVal === "string" && nuanceVal.trim().length > 0 ? nuanceVal.trim().slice(0, 280) : null;

      return NextResponse.json({
        japanese,
        reading: includeReading ? reading : null,
        nuance,
        model: modelName,
      });
    } catch (e) {
      const canTryNext = i < modelAttempts.length - 1 && shouldAttemptNextGeminiModel(e);
      if (canTryNext) {
        console.warn(`[translate/en-ja] model ${modelName} failed, trying next:`, e);
        continue;
      }
      let msg = e instanceof Error ? e.message : "Translation request failed.";
      if (msg.includes("404") && msg.includes("not found")) {
        msg += ` Tried: ${modelAttempts.join(", ")}.`;
      }
      console.error("[translate/en-ja]", e);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "No Gemini model candidates." }, { status: 500 });
}
