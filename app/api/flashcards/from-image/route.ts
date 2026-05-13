import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { geminiModelAttemptOrder, resolveGeminiModelId } from "@/lib/gemini-model";
import type { FlashcardDraft } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 90;

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_CARDS = 80;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const SYSTEM = `You extract Japanese vocabulary / flashcard data from photos of textbook pages, worksheets, or handwritten lists.

Reply with a single JSON object only. No markdown fences, no text outside JSON.

Schema:
{
  "set_name_guess": string | null,
  "verification_note": string,
  "cards": [
    {
      "definition": string | null,
      "kana": string | null,
      "kanji": string | null,
      "phonetic_reading": string | null,
      "native_script": string | null,
      "category_label": string | null,
      "context_note": string | null,
      "example_sentence": string | null,
      "example_translation": string | null,
      "teacher_research": string | null
    }
  ]
}

Printed vs handwritten (critical):
- Only trust **typeset / printed** text from the publisher. Ignore **pencil or pen handwriting**: romaji scribbled above kanji, marginal study notes, underlines, circles, arrows, and any Latin letters that look handwritten or sit on top of printed lines.
- For typical 3-column layouts (kana column | kanji column | English column): take **kana from the kana column** and **English from the English column**. Do not merge handwritten romaji from the middle column into "kana" or "phonetic_reading".
- If printed kanji in the middle column is partly covered by handwriting, set "kanji" to null unless the printed kanji is still clearly readable. Never invent kanji from handwriting.

Field rules:
- "definition" = the **printed English** gloss in the vocabulary table (right column when present). Include parenthetical English that is clearly part of the printed gloss. Omit handwritten English.
- "kana" = the **printed** hiragana/katakana entry (left column when present), including printed in-line markers such as verb group "I" / "II" / "III", printed bracket Japanese like [パンが～], and printed な in [な] for adjectives—keep those on the kana side so the front of the card matches the book. If the page has no separate kana column but the headword is clearly printed in kana/kanji mix, put hiragana/katakana portions here.
- "kanji" = **printed** kanji headword when it appears as its own column or clearly separate from kana; otherwise null.
- "phonetic_reading" = latin romaji **only** when the list itself is printed in romaji or there is **no** printed kana and romaji is clearly **typeset**. For textbook photos with printed kana, leave "phonetic_reading" null even if students wrote romaji by hand.
- "native_script" = null unless there is a clear extra printed line worth preserving; do not stuff ignored handwriting here.
- Preserve lesson order top-to-bottom, left-to-right as in the image.
- Skip headers ("Lesson …", "I. Vocabulary"), page numbers, and decorative text — vocabulary rows only.
- "verification_note": 2–4 short sentences for the teacher: confidence, blur/ambiguity, mention if handwriting was ignored, and what to double-check. Be honest if a row was guessed.
- If no vocabulary is found, return "cards": [] and explain in "verification_note".
- At most ${MAX_CARDS} cards; if more, take the first contiguous vocabulary block and say so in "verification_note".`;

const USER_TASK_VISION =
  "Extract vocabulary rows into the JSON schema. Prefer printed kana (left column) + printed English (right column) on textbook pages; ignore handwritten romaji and notes.";

function optString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function rowToDraft(o: Record<string, unknown>, position: number): FlashcardDraft | null {
  const definition = optString(o.definition);
  const kana = optString(o.kana);
  const kanji = optString(o.kanji);
  const phonetic_reading = optString(o.phonetic_reading);
  const native_script = optString(o.native_script);
  if (!definition && !kana && !kanji && !phonetic_reading && !native_script) {
    return null;
  }
  return {
    set_id: null,
    phonetic_reading,
    native_script,
    kana,
    kanji,
    category_label: optString(o.category_label),
    definition,
    context_note: optString(o.context_note),
    example_sentence: optString(o.example_sentence),
    example_translation: optString(o.example_translation),
    teacher_research: optString(o.teacher_research),
    position,
  };
}

function parseResponseJson(text: string): {
  set_name_guess: string | null;
  verification_note: string;
  cards: FlashcardDraft[];
} {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Empty model response.");
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(trimmed);
    if (fence) {
      data = JSON.parse(fence[1]!.trim());
    } else {
      throw new Error("Model did not return valid JSON.");
    }
  }
  if (!data || typeof data !== "object") throw new Error("Invalid JSON shape.");
  const root = data as Record<string, unknown>;
  const rawCards = Array.isArray(root.cards) ? root.cards : [];
  const drafts: FlashcardDraft[] = [];
  let i = 0;
  for (const item of rawCards) {
    if (i >= MAX_CARDS) break;
    if (!item || typeof item !== "object") continue;
    const d = rowToDraft(item as Record<string, unknown>, i);
    if (d) {
      drafts.push(d);
      i++;
    }
  }
  return {
    set_name_guess: optString(root.set_name_guess),
    verification_note: optString(root.verification_note) ?? "Review each row before saving.",
    cards: drafts,
  };
}

async function extractJsonWithGeminiVision(
  geminiKey: string,
  buf: Buffer,
  mime: string
): Promise<{ text: string; model: string }> {
  const genAI = new GoogleGenerativeAI(geminiKey);
  const attempts = geminiModelAttemptOrder(resolveGeminiModelId(process.env.GEMINI_MODEL));
  let lastErr: unknown;
  const userTask = USER_TASK_VISION;
  for (const modelName of attempts) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
        systemInstruction: SYSTEM,
      });
      const r = await model.generateContent([
        { text: userTask },
        { inlineData: { mimeType: mime, data: buf.toString("base64") } },
      ]);
      const text = r.response.text()?.trim();
      if (!text) throw new Error("Empty Gemini response.");
      return { text, model: modelName };
    } catch (e) {
      lastErr = e;
      console.warn(`[from-image] Gemini model ${modelName} failed:`, e);
    }
  }
  if (lastErr instanceof Error) throw lastErr;
  throw new Error(String(lastErr ?? "Gemini vision failed."));
}

async function extractJsonWithOpenAiVision(
  apiKey: string,
  dataUrl: string,
  model: string
): Promise<{ text: string; model: string }> {
  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: USER_TASK_VISION,
            },
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: "high" },
            },
          ],
        },
      ],
    }),
  });

  const raw = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error?: { message?: string } }).error?.message ?? raw.slice(0, 400))
        : raw.slice(0, 400);
    throw new Error(`OpenAI error (${res.status}): ${msg}`);
  }

  const text = (data as { choices?: { message?: { content?: string | null } }[] })?.choices?.[0]
    ?.message?.content;
  const content = typeof text === "string" ? text.trim() : "";
  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }
  return { text: content, model };
}

export async function POST(req: Request) {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!geminiKey && !openaiKey) {
    return NextResponse.json(
      {
        error:
          "Add GEMINI_API_KEY and/or OPENAI_API_KEY to .env.local for image import. Gemini is tried first when both are set; OpenAI is the backup.",
      },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing image file (form field: image)." }, { status: 400 });
  }

  const mime = (file.type || "").toLowerCase().split(";")[0]!.trim();
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: `Unsupported image type "${mime}". Use JPEG, PNG, WebP, or GIF.` },
      { status: 400 }
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: `Image too large (max ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB).` },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const b64 = buf.toString("base64");
  const dataUrl = `data:${mime};base64,${b64}`;
  const openaiModel = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini";

  let content = "";
  let modelUsed = "";

  if (geminiKey) {
    try {
      const g = await extractJsonWithGeminiVision(geminiKey, buf, mime);
      content = g.text;
      modelUsed = `gemini:${g.model}`;
    } catch (e) {
      console.warn("[from-image] Gemini vision failed:", e);
    }
  }

  const tryParse = () => {
    try {
      return parseResponseJson(content);
    } catch {
      return null;
    }
  };

  let parsed = content ? tryParse() : null;
  if (content && !parsed && openaiKey) {
    console.warn("[from-image] Gemini output was not valid JSON for this schema; trying OpenAI.");
    try {
      const o = await extractJsonWithOpenAiVision(openaiKey, dataUrl, openaiModel);
      content = o.text;
      modelUsed = `openai:${o.model}`;
      parsed = tryParse();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "OpenAI vision failed.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  if (!parsed && !content && openaiKey) {
    try {
      const o = await extractJsonWithOpenAiVision(openaiKey, dataUrl, openaiModel);
      content = o.text;
      modelUsed = `openai:${o.model}`;
      parsed = tryParse();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "OpenAI vision failed.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  if (!parsed) {
    if (!content) {
      return NextResponse.json(
        { error: "Image extraction failed on all configured providers." },
        { status: 502 }
      );
    }
    const message = "Model did not return valid JSON for this schema.";
    return NextResponse.json({ error: message, raw_preview: content.slice(0, 500) }, { status: 502 });
  }

  return NextResponse.json({
    model: modelUsed,
    set_name_guess: parsed.set_name_guess,
    verification_note: parsed.verification_note,
    cards: parsed.cards,
  });
}
