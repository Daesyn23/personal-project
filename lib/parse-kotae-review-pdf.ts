import { isKanaOnly } from "@/lib/japanese-tokens";

export type KotaeReviewDraft = {
  kana: string;
  kanji: string;
  definition: string;
};

/** Split a PDF line into cells (tabs or wide gaps). */
function splitCells(line: string): string[] {
  if (line.includes("\t")) {
    return line.split("\t").map((c) => c.trim()).filter(Boolean);
  }
  return line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
}

function isIndexToken(s: string): boolean {
  return /^\d{1,3}$/.test(s);
}

function looksLikeKanaReading(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  // Allow slash variants e.g. ひらきます/あきます
  const parts = t.split("/").map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 && parts.every((p) => isKanaOnly(p) || /^[\u3040-\u309Fー]+$/u.test(p));
}

function skipLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^KOTAE\b/i.test(t)) return true;
  if (/^こたえ/i.test(t)) return true;
  if (/^--\s*\d+\s+of\s+\d+/i.test(t)) return true;
  if (/^page\s+\d+/i.test(t)) return true;
  return false;
}

/** Split cells like `水泳教室 すいえい` into kanji + leading kana. */
function splitMergedKanjiKana(combined: string): { kanji: string; kanaPrefix: string } | null {
  const m = combined.match(
    /^([\u4E00-\u9FFF\u3000-\u303F・（）\[\]（）\sー]+)\s+([\u3040-\u309Fー]+)$/u
  );
  if (!m) return null;
  return { kanji: m[1].trim(), kanaPrefix: m[2].trim() };
}

/**
 * Repair common PDF extraction glitches in KOTAE answer sheets:
 * - kana readings split across lines (`…きょ` + `うしつ 158 …`)
 * - missing tab before the next index (`おきゃくさん 153`)
 */
export function normalizeKotaePdfText(text: string): string {
  const rawLines = text.replace(/\r/g, "\n").split("\n");
  const merged: string[] = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed || skipLine(trimmed)) continue;

    if (
      !/^\d{1,3}\s*\t/.test(trimmed) &&
      merged.length > 0 &&
      /^[\u3040-\u309Fー]/.test(trimmed) &&
      !/^こたえ/i.test(trimmed)
    ) {
      merged[merged.length - 1] += trimmed.replace(/^\s+/, "");
      continue;
    }

    merged.push(trimmed);
  }

  return merged
    .join("\n")
    .replace(/([\u3040-\u309Fー]+)[ \t]+(\d{1,3})(?=[ \t]*\t)/g, "$1\t$2");
}

/**
 * Parse KOTAE-style kanji test PDFs: repeating groups of index, kanji form, hiragana reading.
 * Example: `1 歩いて あるいて 31 技術 ぎじゅつ`
 */
export function parseKotaeReviewText(text: string): KotaeReviewDraft[] {
  const rows: Array<KotaeReviewDraft & { index: number }> = [];
  const seen = new Set<number>();
  const normalized = normalizeKotaePdfText(text);

  for (const rawLine of normalized.split(/\n/)) {
    if (skipLine(rawLine)) continue;
    const cells = splitCells(rawLine);
    if (cells.length < 3) continue;

    for (let i = 0; i + 2 < cells.length; i += 3) {
      const index = cells[i];
      if (!isIndexToken(index)) {
        break;
      }

      let kanji = cells[i + 1];
      let kana = cells[i + 2];
      if (!kanji || !kana) continue;

      const split = splitMergedKanjiKana(kanji);
      if (split) {
        kanji = split.kanji;
        kana = split.kanaPrefix + kana;
      }

      if (!looksLikeKanaReading(kana)) continue;

      const idx = parseInt(index, 10);
      if (seen.has(idx)) continue;
      seen.add(idx);

      rows.push({
        index: idx,
        kanji,
        kana,
        definition: "",
      });
    }
  }

  rows.sort((a, b) => a.index - b.index);
  return rows.map(({ index: _index, ...draft }) => draft);
}

/** Heuristic: enough KOTAE triplets in extracted PDF text. */
export function looksLikeKotaeReviewPdf(text: string): boolean {
  const drafts = parseKotaeReviewText(text);
  return drafts.length >= 5;
}

export function scoreKotaeReviewText(text: string): number {
  return parseKotaeReviewText(text).length;
}
