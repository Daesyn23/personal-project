import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import {
  geminiModelAttemptOrder,
  resolveGeminiModelId,
  shouldAttemptNextGeminiModel,
} from "@/lib/gemini-model";

export const runtime = "nodejs";

const MAX_TEXT_CHARS = 2_500;
const MAX_CONTEXT_CHARS = 500;

const SYSTEM_INSTRUCTION = `You are an expert Japanese teacher checking grammar, particles, conjugation, counters, and naturalness for learners.
Reply with ONE JSON object only. No markdown fences, no extra keys, no commentary after the JSON.

Required shape:
{
  "acceptable": boolean,
  "severity": "ok" | "minor" | "incorrect",
  "explanation": string,
  "correctedJapanese": string,
  "issues": [
    { "problem": string, "whyWrong": string, "fix": string }
  ]
}

Rules:
- "acceptable": true only if the sentence is grammatically sound and natural for the implied register (infer neutral/polite/casual from the text). Stylistic preference alone is not a grammar error — mention style in explanation but keep acceptable true if grammar is fine.
- "severity": "ok" if acceptable; "minor" for small particle/word-choice slips; "incorrect" for clear grammar errors or incomprehensible phrasing.
- "explanation": 2–6 sentences in English: overall verdict, what is wrong or what to watch, and register notes if relevant.
- "correctedJapanese": the full best version of the user's sentence in Japanese (same intent). If already perfect, repeat the input unchanged.
- "issues": 0–5 items. Each "problem" is a short English label (e.g. "Particle は vs が"). "whyWrong" explains in plain English. "fix" is the Japanese fragment or short phrase that should replace the wrong part, OR the full corrected sentence if easier — be consistent within the array.
- If input is not Japanese or is empty, set acceptable false, severity "incorrect", explain in English, correctedJapanese a brief polite Japanese note, issues empty array.
- Keep strings concise; explanation under 900 characters.`;

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

function parseSeverity(raw: unknown): "ok" | "minor" | "incorrect" {
  if (raw === "ok" || raw === "minor" || raw === "incorrect") return raw;
  return "minor";
}

function normalizeIssues(raw: unknown): { problem: string; whyWrong: string; fix: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { problem: string; whyWrong: string; fix: string }[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const problem = typeof (row as { problem?: unknown }).problem === "string" ? (row as { problem: string }).problem.trim() : "";
    const whyWrong =
      typeof (row as { whyWrong?: unknown }).whyWrong === "string" ? (row as { whyWrong: string }).whyWrong.trim() : "";
    const fix = typeof (row as { fix?: unknown }).fix === "string" ? (row as { fix: string }).fix.trim() : "";
    if (!problem && !whyWrong && !fix) continue;
    out.push({
      problem: problem || "Issue",
      whyWrong: whyWrong || "See explanation above.",
      fix: fix || "—",
    });
    if (out.length >= 6) break;
  }
  return out;
}

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      {
        error: "Add GEMINI_API_KEY to .env.local and restart the dev server.",
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

  const text =
    typeof (body as { text?: unknown }).text === "string" ? (body as { text: string }).text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Enter a Japanese phrase or sentence to check." }, { status: 400 });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json(
      { error: `Text is too long. Maximum is ${MAX_TEXT_CHARS} characters.` },
      { status: 400 }
    );
  }

  const contextRaw =
    typeof (body as { context?: unknown }).context === "string"
      ? (body as { context: string }).context.trim()
      : "";
  const context =
    contextRaw.length > MAX_CONTEXT_CHARS ? contextRaw.slice(0, MAX_CONTEXT_CHARS) : contextRaw;

  const includeReading = Boolean((body as { includeReading?: unknown }).includeReading);

  const userBlock = [
    "Check this Japanese for grammar and naturalness.",
    context ? `Context (may affect particles/register):\n${context}` : null,
    "",
    "Japanese to check:",
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

      const o = parsed as Record<string, unknown>;
      const acceptable = Boolean(o.acceptable);
      const severity = parseSeverity(o.severity);
      const explanation =
        typeof o.explanation === "string" ? o.explanation.trim().slice(0, 1200) : "No explanation returned.";
      const correctedJapanese =
        typeof o.correctedJapanese === "string" ? o.correctedJapanese.trim() : "";
      if (!correctedJapanese) {
        throw new Error("Missing corrected Japanese.");
      }

      const issues = normalizeIssues(o.issues);

      let reading: string | null = null;
      if (includeReading) {
        try {
          const readingModel = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: READING_SYSTEM_INSTRUCTION,
          });
          const readingPrompt = `Japanese:\n${correctedJapanese}`;
          const readingResult = await readingModel.generateContent(readingPrompt);
          const readingRaw = readingResult.response.text();
          const readingParsed = JSON.parse(stripJsonFence(readingRaw)) as { reading?: unknown };
          const r = typeof readingParsed.reading === "string" ? readingParsed.reading.trim() : "";
          reading = r || null;
        } catch {
          reading = null;
        }
      }

      return NextResponse.json({
        acceptable,
        severity,
        explanation,
        correctedJapanese,
        reading,
        issues,
        model: modelName,
      });
    } catch (e) {
      const canTryNext = i < modelAttempts.length - 1 && shouldAttemptNextGeminiModel(e);
      if (canTryNext) {
        console.warn(`[japanese/grammar-check] model ${modelName} failed, trying next:`, e);
        continue;
      }
      let msg = e instanceof Error ? e.message : "Grammar check failed.";
      if (msg.includes("404") && msg.includes("not found")) {
        msg += ` Tried: ${modelAttempts.join(", ")}.`;
      }
      console.error("[japanese/grammar-check]", e);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "No Gemini model candidates." }, { status: 500 });
}
