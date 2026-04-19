import { hasKanji, isKanaOnly } from "@/lib/japanese-tokens";
import type { FlashcardDraft } from "@/lib/types";

function emptyDraft(position: number): FlashcardDraft {
  return {
    set_id: null,
    phonetic_reading: null,
    native_script: null,
    kana: null,
    kanji: null,
    category_label: null,
    definition: null,
    context_note: null,
    example_sentence: null,
    example_translation: null,
    position,
  };
}

/**
 * One line: `{n} {English} {Japanese…}` — English is Latin until the first CJK character.
 * Japanese zone is split on spaces; the reading column is usually kana-only, then an optional
 * kanji-dominant form. We keep the reading and drop the kanji column.
 */
export function parseOneNumberedLessonLine(line: string): { definition: string; kana: string } | null {
  const trimmed = line.trim();
  if (!/^\d+\s/.test(trimmed)) return null;

  const afterNum = trimmed.replace(/^\d+\s+/, "").trim();
  if (!afterNum) return null;

  const jpStart = afterNum.search(/[\u3040-\u309F\u30A0-\u30FF\uFF66-\uFF9F\u4E00-\u9FFF]/);
  if (jpStart < 0) return null;

  const english = afterNum.slice(0, jpStart).trim();
  const japanese = afterNum.slice(jpStart).trim();

  if (!english || !japanese) return null;

  const parts = japanese.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  if (parts.length === 1) {
    return { definition: english, kana: parts[0] };
  }

  const allKanaTokens = parts.every((p) => isKanaOnly(p));
  if (allKanaTokens) {
    return { definition: english, kana: parts.join(" ") };
  }

  const first = parts[0];
  const rest = parts.slice(1);

  if (isKanaOnly(first) && rest.some((p) => hasKanji(p))) {
    return { definition: english, kana: first };
  }

  if (isKanaOnly(first) && rest.every((p) => isKanaOnly(p))) {
    return { definition: english, kana: parts.join(" ") };
  }

  const kanaIdx = parts.findIndex((p) => isKanaOnly(p));
  if (kanaIdx >= 0) {
    return { definition: english, kana: parts[kanaIdx] };
  }

  return { definition: english, kana: first };
}

/** Minna-style numbered list pasted from PDF/text; kanji column is discarded. */
export function parseLessonLinesPaste(raw: string): FlashcardDraft[] {
  const text = raw.replace(/\r/g, "\n").replace(/\u00ad/g, "").normalize("NFKC");
  const lines = text.split("\n");
  const out: FlashcardDraft[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const parsed = parseOneNumberedLessonLine(line);
    if (!parsed) continue;

    const d = emptyDraft(out.length);
    d.definition = parsed.definition;
    d.kana = parsed.kana;
    d.kanji = null;
    out.push(d);
  }

  return out;
}

/** True if text looks like `1 word… 2 word…` lesson lines (for auto-paste in import UI). */
export function looksLikeNumberedLessonPaste(text: string): boolean {
  const t = text.replace(/\r/g, "\n").trim();
  if (t.length < 12) return false;
  const lines = t.split("\n").filter((l) => /^\d+\s/.test(l.trim()));
  return lines.length >= 2;
}
