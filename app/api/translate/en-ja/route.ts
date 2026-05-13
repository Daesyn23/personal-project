import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { generateTextGeminiThenGroq, isAnyTextLlmConfigured } from "@/lib/gemini-with-groq-fallback";
import { geminiModelAttemptOrder, resolveGeminiModelId } from "@/lib/gemini-model";

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
- "reading": If the user asks for readings, a full hiragana reading of the entire Japanese line (include okurigana). If not asked, null.
- "nuance": At most one short English sentence (≤220 chars) on register, nuance, or ambiguity; otherwise null.
- Do not add furigana brackets inside "japanese" unless the source explicitly asks for ruby-style glosses.
- If the input is empty or not translatable, set japanese to a brief polite Japanese apology and explain in nuance in English.`;

const READING_SYSTEM_INSTRUCTION = `You convert Japanese text into a full hiragana reading line.
You MUST reply with a single JSON object only. No markdown fences, no extra keys.

Schema:
{
  "reading": string
}

Rules:
- Output a hiragana-only reading for the ENTIRE input line.
- Preserve punctuation and spacing (including newlines) as-is.
- Do not include kanji. Do not include romaji.`;

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

  const genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;
  const primaryModel = resolveGeminiModelId(process.env.GEMINI_MODEL);
  const modelAttempts = geminiModelAttemptOrder(primaryModel);

  try {
    const { text: rawText, model: usedModel } = await generateTextGeminiThenGroq({
      logLabel: "translate/en-ja",
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

    const japanese =
      typeof (parsed as { japanese?: unknown }).japanese === "string"
        ? (parsed as { japanese: string }).japanese.trim()
        : "";
    if (!japanese) {
      throw new Error("Translation was empty.");
    }

    const readingVal = (parsed as { reading?: unknown }).reading;
    let reading = typeof readingVal === "string" && readingVal.trim().length > 0 ? readingVal.trim() : null;

    if (includeReading && !reading) {
      try {
        const readingPrompt = `Japanese:\n${japanese}`;
        const { text: readingRaw } = await generateTextGeminiThenGroq({
          logLabel: "translate/en-ja/reading",
          geminiApiKey: geminiKey,
          modelAttempts,
          runGemini: async (modelName) => {
            if (!genAI) throw new Error("Gemini not configured");
            const readingModel = genAI.getGenerativeModel({
              model: modelName,
              systemInstruction: READING_SYSTEM_INSTRUCTION,
            });
            const readingResult = await readingModel.generateContent(readingPrompt);
            return readingResult.response.text();
          },
          groq: {
            messages: [
              { role: "system", content: READING_SYSTEM_INSTRUCTION },
              { role: "user", content: readingPrompt },
            ],
            jsonMode: true,
          },
        });
        const readingParsed = JSON.parse(stripJsonFence(readingRaw)) as { reading?: unknown };
        const r = typeof readingParsed.reading === "string" ? readingParsed.reading.trim() : "";
        if (r) reading = r;
      } catch {
        // If reading fallback fails, keep it null (UI will just show kanji).
      }
    }

    const nuanceVal = (parsed as { nuance?: unknown }).nuance;
    const nuance =
      typeof nuanceVal === "string" && nuanceVal.trim().length > 0 ? nuanceVal.trim().slice(0, 280) : null;

    return NextResponse.json({
      japanese,
      reading: includeReading ? reading : null,
      nuance,
      model: usedModel,
    });
  } catch (e) {
    let msg = e instanceof Error ? e.message : "Translation request failed.";
    if (msg.includes("404") && msg.includes("not found")) {
      msg += ` Tried Gemini: ${modelAttempts.join(", ")}.`;
    }
    console.error("[translate/en-ja]", e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
