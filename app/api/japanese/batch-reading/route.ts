import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { generateTextGeminiThenGroq } from "@/lib/gemini-with-groq-fallback";
import { geminiModelAttemptOrder, resolveGeminiModelId } from "@/lib/gemini-model";
import { isGroqConfigured } from "@/lib/groq-openai";

export const runtime = "nodejs";

const MAX_LINES = 48;
const MAX_TOTAL_CHARS = 6_000;

const BATCH_READING_INSTRUCTION = `You convert Japanese lines into hiragana readings for learners.
Reply with ONE JSON object only. No markdown fences, no extra keys.

Schema:
{
  "readings": string[]
}

Rules:
- "readings" MUST have the same length and order as the numbered input lines.
- Each element is a hiragana-only reading for that line (include okurigana).
- Preserve punctuation and spacing roughly as in the source line.
- Do not include kanji or romaji in the readings.
- If a line is empty or whitespace-only, use "" for that slot.`;

function stripJsonFence(raw: string): string {
  let t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  if (fence) t = fence[1]!.trim();
  return t;
}

export async function POST(req: Request) {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiKey && !isGroqConfigured()) {
    return NextResponse.json(
      {
        error:
          "Hiragana readings need GEMINI_API_KEY and/or GROQ_API_KEY in .env.local (same as Translate / Grammar).",
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

  const linesRaw = (body as { lines?: unknown }).lines;
  if (!Array.isArray(linesRaw)) {
    return NextResponse.json({ error: 'Expected "lines" array.' }, { status: 400 });
  }

  const lines = linesRaw.map((x) => (typeof x === "string" ? x : "")).slice(0, MAX_LINES);
  let total = 0;
  for (const line of lines) {
    total += line.length;
    if (total > MAX_TOTAL_CHARS) {
      return NextResponse.json(
        { error: `Total text too long (max ${MAX_TOTAL_CHARS} characters).` },
        { status: 400 }
      );
    }
  }

  const userBlock = [
    "Convert each numbered Japanese line to a hiragana reading.",
    "",
    ...lines.map((line, i) => `${i + 1}. ${line}`),
  ].join("\n");

  const genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;
  const primaryModel = resolveGeminiModelId(process.env.GEMINI_MODEL);
  const modelAttempts = geminiModelAttemptOrder(primaryModel);

  try {
    const { text: rawText } = await generateTextGeminiThenGroq({
      logLabel: "japanese/batch-reading",
      geminiApiKey: geminiKey,
      modelAttempts,
      runGemini: async (modelName) => {
        if (!genAI) throw new Error("Gemini not configured");
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: BATCH_READING_INSTRUCTION,
        });
        const result = await model.generateContent(userBlock);
        return result.response.text();
      },
      groq: {
        messages: [
          { role: "system", content: BATCH_READING_INSTRUCTION },
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

    const readingsUnknown = (parsed as { readings?: unknown }).readings;
    if (!Array.isArray(readingsUnknown)) {
      throw new Error('Expected JSON with "readings" array.');
    }

    const readings = lines.map((_, i) =>
      typeof readingsUnknown[i] === "string" ? (readingsUnknown[i] as string).trim() : ""
    );

    return NextResponse.json({ readings });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Reading conversion failed.";
    console.error("[japanese/batch-reading]", e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
