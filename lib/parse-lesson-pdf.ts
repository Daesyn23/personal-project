import type { FlashcardDraft } from "@/lib/types";
import {
  hasKanji,
  isKanaOnly,
  looksLikeEnglishGloss,
  looksLikeRomajiWord,
} from "@/lib/japanese-tokens";

const NOISE = /^(lesson|vocabulary|語彙|みんなの|ミンナ|minna|第[0-9]|ページ|page|answer|key|\d+\s*$|■|◎)/i;

function isVocabularyHeaderRow(line: string): boolean {
  const compact = line.replace(/\s+/g, " ").trim().toLowerCase();
  if (/^english\s+kana\s+kanji|^kana\s+english\s+kanji/.test(compact)) return true;
  if (/^kanji\s+kana\s+english/.test(compact)) return true;
  if (/^(no\.?|#)\s*(kana|english|kanji)/.test(compact)) return true;
  const parts = line.split(/\s+/).map((p) => p.replace(/[^a-z]/gi, "").toLowerCase());
  const headerHits = parts.filter((p) =>
    ["kana", "english", "kanji", "romaji", "meaning", "gloss"].includes(p)
  ).length;
  return headerHits >= 2 && line.length < 100;
}

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

function stripLeadNumber(line: string): string {
  return line
    .replace(/^\s*[\(（]?[\d]+[\)）]?\s*/, "")
    .replace(/^\s*[\d]+[\.．]\s*/, "")
    .replace(/^\s*[①-⑳⓵-⓿]\s*/, "")
    .trim();
}

function parseLineByTokens(line: string): Omit<FlashcardDraft, "position"> | null {
  const rawSegs = line.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  const segments = rawSegs.filter((s) => !/^\d+$/.test(s));
  if (segments.length === 0) return null;

  const kanaParts: string[] = [];
  const kanjiParts: string[] = [];
  const romajiParts: string[] = [];
  const englishParts: string[] = [];

  const englishParticle = /^(to|a|an|the|be|is|are|in|on|at|of|for)$/i;

  for (const seg of segments) {
    if (englishParticle.test(seg)) {
      englishParts.push(seg);
      continue;
    }
    if (isKanaOnly(seg)) {
      kanaParts.push(seg);
      continue;
    }
    if (hasKanji(seg)) {
      kanjiParts.push(seg);
      continue;
    }
    if (looksLikeRomajiWord(seg) && !looksLikeEnglishGloss(seg)) {
      romajiParts.push(seg);
      continue;
    }
    if (/^[A-Za-z]/.test(seg) || seg.includes("'")) {
      englishParts.push(seg);
      continue;
    }
    if (/[\u3040-\u9FFF]/.test(seg)) {
      kanjiParts.push(seg);
    }
  }

  const kana = kanaParts.length ? kanaParts.join(" ") : null;
  const kanji = kanjiParts.length ? kanjiParts.join(" ") : null;
  const romaji = romajiParts.length ? romajiParts.join(" ") : null;
  const english = englishParts.length ? englishParts.join(" ") : null;

  if (!kana && !kanji && !english && !romaji) return null;

  return {
    set_id: null,
    phonetic_reading: romaji,
    native_script: null,
    kana,
    kanji,
    category_label: null,
    definition: english,
    context_note: null,
    example_sentence: null,
    example_translation: null,
  };
}

function splitLessonLineStructured(line: string): Omit<FlashcardDraft, "position"> | null {
  const three = line.match(
    /^(.+?)\s+([a-zA-ZāēīōūĀĒĪŌŪ.]+(?:\s+[a-zA-ZāēīōūĀĒĪŌŪ.]+)*)\s+([A-Za-z].+)$/u
  );
  if (three) {
    const jp = three[1].trim();
    const mid = three[2].trim();
    const en = three[3].trim();
    const midIsRomaji =
      /^[a-zA-ZāēīōūĀĒĪŌŪ.\s\-]+$/u.test(mid) && !looksLikeEnglishGloss(mid);
    if (/[\u3040-\u30FF\u4E00-\u9FFF]/.test(jp) && midIsRomaji) {
      return {
        set_id: null,
        phonetic_reading: mid,
        native_script: null,
        kana: isKanaOnly(jp) ? jp : null,
        kanji: hasKanji(jp) && !isKanaOnly(jp) ? jp : null,
        category_label: null,
        definition: en,
        context_note: null,
        example_sentence: null,
        example_translation: null,
      };
    }
  }

  const two = line.match(
    /^([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3000-\u303F・（）\[\]〃\d\uFF10-\uFF19\sー〜]+?)\s+([A-Za-z].+)$/u
  );
  if (two) {
    const jp = two[1].trim();
    const en = two[2].trim();
    if (jp.length >= 1 && en.length >= 1) {
      return {
        set_id: null,
        phonetic_reading: null,
        native_script: null,
        kana: isKanaOnly(jp) ? jp : null,
        kanji: hasKanji(jp) && !isKanaOnly(jp) ? jp : null,
        category_label: null,
        definition: en,
        context_note: null,
        example_sentence: null,
        example_translation: null,
      };
    }
  }

  return null;
}

/** Last-resort parsing when table / TSV / regex strategies yield nothing */
export function lessonPdfLegacyFallback(text: string): FlashcardDraft[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const out: FlashcardDraft[] = [];
  let position = 0;

  for (const raw of lines) {
    if (raw.length < 2) continue;
    if (NOISE.test(raw) && raw.length < 80) continue;
    if (isVocabularyHeaderRow(raw)) continue;

    const line = stripLeadNumber(raw);
    if (!line) continue;

    const structured = splitLessonLineStructured(line);
    if (structured) {
      out.push({ ...emptyDraft(position++), ...structured });
      continue;
    }

    const tokens = parseLineByTokens(line);
    if (tokens && (tokens.kana || tokens.kanji || tokens.definition)) {
      out.push({ ...emptyDraft(position++), ...tokens });
      continue;
    }

    if (/[\u3040-\u30FF\u4E00-\u9FFF]/.test(line)) {
      const d = emptyDraft(position++);
      if (isKanaOnly(line)) d.kana = line;
      else if (hasKanji(line)) d.kanji = line;
      else d.kana = line;
      out.push(d);
    }
  }

  return out;
}
