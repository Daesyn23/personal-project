import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import {
  appendGeminiFreeTierQuotaHint,
  geminiModelAttemptOrder,
  resolveGeminiModelId,
  withGemini429QuotaRetry,
} from "@/lib/gemini-model";
import { generateTextGeminiThenGroq, isAnyTextLlmConfigured } from "@/lib/gemini-with-groq-fallback";

export const runtime = "nodejs";
/** Allows one RetryInfo backoff on 429; needs a host with a long enough route timeout (e.g. local dev). */
export const maxDuration = 120;

const CHUNK_SIZE = 12;
const MAX_CARDS = 120;

const TEACHER_RESEARCH_TAGLISH_RULES = `**teacher_research (MANDATORY LANGUAGE — read carefully):**
- Write **Taglish only**: natural **code-mix of Filipino/Tagalog + English** (Philippine classroom / teacher lounge style).
- **FORBIDDEN**: paragraphs that are **English-only**. If the text could pass as a UK/US textbook footnote with zero Tagalog, it is **wrong**.
- In **every sentence**, include **at least one** clear Tagalog/Filipino word or phrase (e.g. *ito, kasi, tandaan, halimbawa, pwede, importante, para sa, kailangan, ganito, ibig sabihin, mag-ingat, paliwanag*). Mix freely with English and Japanese terms.
- **5–10 sentences** (substantive prep notes — not one-liners). For the teacher only — not for student slides.
- **Include rich factual content** where it fits the headword (do not pad with fluff):
  - **Cultural facts**: real-life usage in Japan, politeness/register, situations students confuse, contrast with Filipino habits or classroom pitfalls.
  - **Historical facts**: kanji origin, word history, period or etymology notes when relevant (brief and accurate).
  - **Teaching hooks**: mnemonics, common learner errors, comparisons to related words, what to demo in class.
- OK to keep Japanese headwords and English grammar labels (*ichidan*, *particle*) where useful; the **prose around them must stay Taglish**.
- If unsure about a fact, say so briefly **in Taglish** — do not invent history or culture.

**Good example (shape + density of Tagalog — adapt content to each vocab item):**
"Group II (ichidan) verb ito. Tandaan ang nuance: ang *wasuremasu* parang nakalimutan mo lang o naiwan — medyo absent-minded; ang *nakushimasu* mas parang nawala na talaga o 'di mo na mahanap. Halimbawa, naiwan mo ang wallet sa lamesa → *wasure*. Kung wala na sa mundo mo ang wallet → *nakushimasu* ang vibe. Sa kultura, mas natural sa daily convo ang *wasureta* kaysa formal textbook lines — i-demo mo yan. Historically, ang kanji 忘 ay 'forget' sa meaning cluster; hindi kailangan i-deep dive unless may time. I-emphasize sa class ang 'carelessly' sa English definition para lumabas yung light na oversight."

**Bad example (do NOT do this — English-only):**
"This is a Group II verb. The difference between wasuremasu and nakushimasu is key. Wasuremasu implies..."`;

const SYSTEM_INSTRUCTION_REGENERATE = `You help Japanese teachers in the Philippines prepare vocabulary cards.
You MUST reply with a single JSON object only. No markdown fences, no commentary outside JSON.

${TEACHER_RESEARCH_TAGLISH_RULES}

Schema:
{
  "results": [
    {
      "id": string,
      "example_sentence": string | null,
      "example_translation": string | null,
      "teacher_research": string | null
    }
  ]
}

Rules for EACH input item (matched by "id"):
- "example_sentence": **fresh** natural Japanese sentence using the vocabulary (です／ます or plain as fits); classroom-appropriate; avoid repeating the same scenario pattern across items in one batch when possible.
- "example_translation": English gloss of the example only.
- "teacher_research": follow the **teacher_research (MANDATORY LANGUAGE)** block exactly — Taglish, 5–10 sentences, cultural + historical facts when relevant.
- Output one object per input id, same order as the input list, same ids — no extras, no omissions.
- **Critical for "id"**: Copy each input **id** exactly (full UUID string). Do not renumber, shorten, or omit ids.`;

const SYSTEM_INSTRUCTION = `You help Japanese teachers in the Philippines prepare vocabulary cards.
You MUST reply with a single JSON object only. No markdown fences, no commentary outside JSON.

${TEACHER_RESEARCH_TAGLISH_RULES}

Schema:
{
  "results": [
    {
      "id": string,
      "phonetic_reading": string | null,
      "category_label": string | null,
      "example_sentence": string | null,
      "example_translation": string | null,
      "teacher_research": string | null
    }
  ]
}

Rules for EACH input item (matched by "id"):
- "phonetic_reading": **Minna-style spaced romaji** for the headword (Modified Hepburn, **lowercase ASCII only** — no macrons; write **ou** for long **o**, **ee** for long **e**, etc.).
  - **Never** output one glued token like "wasuremasu" or "nakushimasu".
  - **Insert ASCII spaces** between short romaji chunks so it matches *Minna no Nihongo* vocabulary columns: romanize **each hiragana mora** (or **ゃゅょ** with the previous character) as its own piece, **except** write the polite ending as **masu**, **mashita**, **masen**, **nai** as **single** trailing pieces (still preceded by a space from the stem).
  - Concrete targets: くれます → "ku re masu". なおします → "na o shi masu". わすれます → "wa su re masu". つれていきます → "tsu re te i ki masu". つれてきます → "tsu re te ki masu". おくります → "o ku ri masu". しょうかいします → "shou kai shi masu". なくします → "na ku shi masu". はらいます → "ha ra i masu".
  - Multi-word lines: keep **spaces between words** (particles like "o", "ni" as their own spaced tokens).
  - null only if impossible.
- "category_label": **Only** the single Roman numeral **I**, **II**, or **III** (Minna verb groups). **Forbidden**: "Ru-verb", "U-verb", "Ichidan", "Expression", "Noun", or any other text.
  - **I** = Group I (godan / 五段).
  - **II** = Group II (ichidan / 一段).
  - **III** = Group III: する, くる, and ～する compounds (e.g. しょうかいします).
  - If the headword is **not** a classified verb (e.g. bare noun with no group), set category_label to **null**.
- "example_sentence": natural Japanese sentence using the vocabulary (です／ます or plain as fits the item); keep it classroom-appropriate.
- "example_translation": English gloss of the example only.
- "teacher_research": follow the **teacher_research (MANDATORY LANGUAGE)** block at the top of this prompt exactly — Taglish with Tagalog in every sentence; never English-only prose.
- Output one object per input id, same order as the input list, same ids — no extras, no omissions.
- **Critical for "id"**: Copy each input **id** exactly (full UUID string, same characters and length). Do not renumber (1,2,3), shorten, "fix" casing, or drop the id field on any row.`;

/** If the whole reply is one markdown fence, unwrap it. */
function stripJsonFence(raw: string): string {
  let t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  if (fence) t = fence[1]!.trim();
  return t;
}

/** First ``` or ```json … ``` block whose inner text looks like JSON. */
function innerJsonFromMarkdownFences(raw: string): string[] {
  const out: string[] = [];
  const re = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const inner = m[1]?.trim() ?? "";
    if (inner.startsWith("{") || inner.startsWith("[")) out.push(inner);
  }
  return out;
}

/**
 * Gemini often wraps JSON in fences, adds a short preamble, or uses smart quotes in prose — but the JSON
 * itself is usually a balanced `{...}` or `[...]` slice. Extract that slice (double-quoted strings only).
 */
function extractBalancedJsonSlice(text: string): string | null {
  const scan = (startChar: "{" | "["): string | null => {
    const start = text.indexOf(startChar);
    if (start < 0) return null;
    const endChar = startChar === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i]!;
      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === "\\") {
          escape = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === startChar) depth++;
      else if (ch === endChar) {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  };
  return scan("{") ?? scan("[");
}

function parseModelJsonResponse(rawText: string): unknown {
  const text = rawText.trim();
  if (!text) throw new Error("Empty model response.");

  const candidates: string[] = [];
  const add = (s: string | null | undefined) => {
    const t = typeof s === "string" ? s.trim() : "";
    if (t && !candidates.includes(t)) candidates.push(t);
  };

  add(text);
  add(stripJsonFence(text));
  for (const inner of innerJsonFromMarkdownFences(text)) add(inner);
  add(extractBalancedJsonSlice(text));

  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* try next candidate */
    }
  }
  throw new Error("Model did not return valid JSON.");
}

type EnrichMode = "fill" | "regenerate";

type CardIn = { id: string; kana: string; definition: string };

type CardOut = {
  id: string;
  phonetic_reading: string | null;
  category_label: string | null;
  example_sentence: string | null;
  example_translation: string | null;
  teacher_research: string | null;
};

function parseCardIn(raw: unknown): CardIn | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const kana = typeof o.kana === "string" ? o.kana.trim() : "";
  const definition = typeof o.definition === "string" ? o.definition.trim() : "";
  if (!id || !kana || !definition) return null;
  return { id, kana, definition };
}

/**
 * Gemini sometimes returns a bare array, or wraps under `data` / one unknown key, instead of `{ results: [...] }`.
 */
function resultIdKey(raw: unknown): string {
  if (typeof raw === "string") return raw.trim().toLowerCase();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return "";
}

/** One enrichment row from model JSON; `id` may be empty when the model omitted it (index fallback may still apply). */
function parseResultItemToCardOut(item: unknown): CardOut | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const idRaw = o.id;
  const id =
    typeof idRaw === "string"
      ? idRaw.trim()
      : typeof idRaw === "number" && Number.isFinite(idRaw)
        ? String(idRaw)
        : "";
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const opt = (v: unknown) => {
    const s = str(v);
    return s.length ? s : null;
  };
  return {
    id,
    phonetic_reading: opt(o.phonetic_reading),
    category_label: opt(o.category_label),
    example_sentence: opt(o.example_sentence),
    example_translation: opt(o.example_translation),
    teacher_research: opt(o.teacher_research),
  };
}

/**
 * Maps model `results` to chunk order. Uses case-insensitive id match, then same-index fallback when
 * lengths match (model kept row order but mangled ids or left id blank).
 */
function orderEnrichmentForChunk(chunk: CardIn[], resultsRaw: unknown[]): CardOut[] {
  const byIdLower = new Map<string, CardOut>();
  for (const item of resultsRaw) {
    const row = parseResultItemToCardOut(item);
    if (!row) continue;
    const key = resultIdKey(row.id);
    if (key) byIdLower.set(key, row);
  }

  const lengthMatches = resultsRaw.length === chunk.length;

  const ordered: CardOut[] = [];
  for (let i = 0; i < chunk.length; i++) {
    const c = chunk[i]!;
    const wantKey = c.id.trim().toLowerCase();
    let row = wantKey ? byIdLower.get(wantKey) : undefined;
    if (!row && lengthMatches) {
      const fromIndex = parseResultItemToCardOut(resultsRaw[i]);
      if (fromIndex) row = fromIndex;
    }
    if (!row) {
      throw new Error(`Missing result for card id ${c.id}.`);
    }
    ordered.push({
      ...row,
      id: c.id,
    });
  }
  return ordered;
}

function extractResultsArray(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (Array.isArray(o.results)) return o.results;
  if (Array.isArray(o.data)) return o.data;
  if (Array.isArray(o.items)) return o.items;
  if (Array.isArray(o.cards)) return o.cards;
  const nested = o.output ?? o.response;
  if (nested && typeof nested === "object") {
    const n = nested as Record<string, unknown>;
    if (Array.isArray(n.results)) return n.results;
  }
  const keys = Object.keys(o);
  if (keys.length === 1) {
    const v = o[keys[0]!];
    if (Array.isArray(v)) return v;
  }
  return null;
}

export async function POST(req: Request) {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!isAnyTextLlmConfigured(geminiKey)) {
    return NextResponse.json(
      {
        error:
          "Add GEMINI_API_KEY, GROQ_API_KEY, and/or OPENAI_API_KEY to .env.local (same as chat/translate) and restart the dev server.",
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

  const rawCards = (body as { cards?: unknown }).cards;
  if (!Array.isArray(rawCards)) {
    return NextResponse.json({ error: 'Expected "cards" array.' }, { status: 400 });
  }

  const cards: CardIn[] = [];
  for (const r of rawCards) {
    const c = parseCardIn(r);
    if (c) cards.push(c);
  }

  if (cards.length === 0) {
    return NextResponse.json(
      { error: "Send at least one card with id, kana, and definition." },
      { status: 400 }
    );
  }
  if (cards.length > MAX_CARDS) {
    return NextResponse.json(
      { error: `Too many cards at once (max ${MAX_CARDS}). Split into smaller bulk edits.` },
      { status: 400 }
    );
  }

  const rawMode = (body as { mode?: unknown }).mode;
  const enrichMode: EnrichMode = rawMode === "regenerate" ? "regenerate" : "fill";
  const systemInstruction =
    enrichMode === "regenerate" ? SYSTEM_INSTRUCTION_REGENERATE : SYSTEM_INSTRUCTION;

  const genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;
  const primaryModel = resolveGeminiModelId(process.env.GEMINI_MODEL);
  const modelAttempts = geminiModelAttemptOrder(primaryModel);

  const allResults: CardOut[] = [];

  for (let start = 0; start < cards.length; start += CHUNK_SIZE) {
    const chunk = cards.slice(start, start + CHUNK_SIZE);
    const userBlock =
      enrichMode === "regenerate"
        ? [
            "Regenerate example_sentence, example_translation, and teacher_research for each vocabulary item below. Return JSON only.",
            "Each output object must use the same id string as the matching input line (copy the UUID exactly).",
            "Write a new example scenario when possible — do not copy generic textbook filler.",
            "",
            "REMINDER — teacher_research: TAGLISH ONLY; 5–10 sentences; include cultural and historical facts where relevant.",
            "",
            JSON.stringify(
              chunk.map((c) => ({ id: c.id, kana: c.kana, english: c.definition })),
              null,
              0
            ),
          ].join("\n")
        : [
            "Generate fields for each vocabulary item below. Return JSON only.",
            "Each output object must use the same id string as the matching input line (copy the UUID exactly).",
            "",
            "REMINDER — teacher_research: TAGLISH ONLY (Filipino/Tagalog mixed with English). Each sentence must contain Tagalog words. English-only teacher_research is invalid. Include cultural and historical facts; 5–10 sentences.",
            "",
            JSON.stringify(
              chunk.map((c) => ({ id: c.id, kana: c.kana, english: c.definition })),
              null,
              0
            ),
          ].join("\n");

    try {
      const { text: rawText } = await generateTextGeminiThenGroq({
        logLabel: "enrich-lesson",
        geminiApiKey: geminiKey,
        modelAttempts,
        runGemini: async (modelName) => {
          if (!genAI) throw new Error("Gemini not configured");
          const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction,
            generationConfig: {
              responseMimeType: "application/json",
            },
          });
          const use429Retry = process.env.GEMINI_429_RETRY === "1" || process.env.GEMINI_429_RETRY === "true";
          const result = use429Retry
            ? await withGemini429QuotaRetry(() => model.generateContent(userBlock), { maxDelayMs: 70_000 })
            : await model.generateContent(userBlock);
          return result.response.text();
        },
        groq: {
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userBlock },
          ],
          jsonMode: true,
        },
      });

      const parsed = parseModelJsonResponse(rawText);

      const resultsRaw = extractResultsArray(parsed);
      if (!resultsRaw) {
        const hint =
          parsed && typeof parsed === "object"
            ? ` Got object with keys: ${Object.keys(parsed as object).join(", ") || "(none)"}.`
            : "";
        throw new Error(
          `Could not find a results array in the model response (expected { "results": [...] } or a JSON array).${hint}`
        );
      }

      const ordered = orderEnrichmentForChunk(chunk, resultsRaw);
      allResults.push(...ordered);
    } catch (e) {
      let msg = e instanceof Error ? e.message : "Enrichment failed.";
      if (msg.includes("404") && msg.includes("not found")) {
        msg += ` Tried Gemini: ${modelAttempts.join(", ")}.`;
      }
      if (/429|quota|too many requests|resource_exhausted/i.test(msg)) {
        msg = appendGeminiFreeTierQuotaHint(msg);
      }
      console.error("[enrich-lesson]", e);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  return NextResponse.json({ results: allResults });
}
