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
  if (/^--\s*\d+\s+of\s+\d+/i.test(t)) return true;
  if (/^page\s+\d+/i.test(t)) return true;
  return false;
}

/**
 * Parse KOTAE-style kanji test PDFs: repeating groups of index, kanji form, hiragana reading.
 * Example: `1 歩いて あるいて 31 技術 ぎじゅつ`
 */
export function parseKotaeReviewText(text: string): KotaeReviewDraft[] {
  const out: KotaeReviewDraft[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\n/)) {
    if (skipLine(rawLine)) continue;
    const cells = splitCells(rawLine);
    if (cells.length < 3) continue;

    for (let i = 0; i + 2 < cells.length; i += 3) {
      const index = cells[i];
      const kanji = cells[i + 1];
      const kana = cells[i + 2];
      if (!isIndexToken(index)) {
        // Mis-aligned row — try to resync if next tokens look like a valid triple
        break;
      }
      if (!kanji || !kana) continue;
      if (!looksLikeKanaReading(kana)) continue;

      const key = `${kanji}\0${kana}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        kanji,
        kana,
        definition: "",
      });
    }
  }

  return out;
}

/** Heuristic: enough KOTAE triplets in extracted PDF text. */
export function looksLikeKotaeReviewPdf(text: string): boolean {
  const drafts = parseKotaeReviewText(text);
  return drafts.length >= 5;
}

export function scoreKotaeReviewText(text: string): number {
  return parseKotaeReviewText(text).length;
}
