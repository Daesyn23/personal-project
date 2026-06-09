import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { generateTextGeminiThenGroq, isAnyTextLlmConfigured } from "@/lib/gemini-with-groq-fallback";
import { geminiModelAttemptOrder, resolveGeminiModelId } from "@/lib/gemini-model";

export const runtime = "nodejs";

const MAX_ITEMS = 48;
const MAX_CHARS_PER_ITEM = 80;

const SYSTEM_INSTRUCTION = `You write short English vocabulary glosses for Japanese review flashcards.
Reply with ONE JSON object only. No markdown fences.

Schema:
{
  "definitions": string[]
}

Rules:
- "definitions" MUST have the same length and order as the numbered input items.
- Each gloss is a brief English meaning (e.g. "to walk", "kind", "east", "technology").
- Use lowercase unless a proper noun (Tokyo, Kyoto).
- For verbs include "to …" when natural.
- No Japanese, romaji, or extra commentary in the gloss.
- If unsure, give the most common learner meaning.
- If an item is empty, use "" for that slot.`;

function stripJsonFence(raw: string): string {
  let t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  if (fence) t = fence[1]!.trim();
  return t;
}

type InputItem = { kanji: string; kana: string };

export async function POST(req: Request) {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!isAnyTextLlmConfigured(geminiKey)) {
    return NextResponse.json(
      {
        error:
          "English generation needs GEMINI_API_KEY, GROQ_API_KEY, and/or OPENAI_API_KEY in .env.local.",
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

  const itemsRaw = (body as { items?: unknown }).items;
  if (!Array.isArray(itemsRaw)) {
    return NextResponse.json({ error: 'Expected "items" array.' }, { status: 400 });
  }

  const items: InputItem[] = itemsRaw.slice(0, MAX_ITEMS).map((x) => {
    if (!x || typeof x !== "object") return { kanji: "", kana: "" };
    const kanji = typeof (x as InputItem).kanji === "string" ? (x as InputItem).kanji.trim() : "";
    const kana = typeof (x as InputItem).kana === "string" ? (x as InputItem).kana.trim() : "";
    return {
      kanji: kanji.slice(0, MAX_CHARS_PER_ITEM),
      kana: kana.slice(0, MAX_CHARS_PER_ITEM),
    };
  });

  if (items.length === 0) {
    return NextResponse.json({ error: "No items to translate." }, { status: 400 });
  }

  const userBlock = [
    "Write a short English gloss for each Japanese vocabulary item.",
    "Format each line as: kanji (kana reading)",
    "",
    ...items.map((it, i) => `${i + 1}. ${it.kanji || it.kana} (${it.kana})`),
  ].join("\n");

  const genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;
  const primaryModel = resolveGeminiModelId(process.env.GEMINI_MODEL);
  const modelAttempts = geminiModelAttemptOrder(primaryModel);

  try {
    const { text: rawText } = await generateTextGeminiThenGroq({
      logLabel: "review/generate-english",
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
      },
    });

    const parsed = JSON.parse(stripJsonFence(rawText)) as { definitions?: unknown };
    const defsRaw = parsed.definitions;
    if (!Array.isArray(defsRaw)) {
      return NextResponse.json({ error: "Model response missing definitions array." }, { status: 502 });
    }

    const definitions = defsRaw
      .slice(0, items.length)
      .map((d) => (typeof d === "string" ? d.trim() : ""));

    while (definitions.length < items.length) {
      definitions.push("");
    }

    return NextResponse.json({ definitions });
  } catch (e) {
    console.error("[review/generate-english]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "English generation failed." },
      { status: 500 }
    );
  }
}
