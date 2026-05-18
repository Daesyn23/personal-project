import { toHiragana } from "wanakana";
import { hasKanji } from "@/lib/japanese-tokens";

export type FlashcardJapaneseField = "kana" | "example_sentence";

export type RowJapaneseFields = Record<FlashcardJapaneseField, string>;

const BATCH_CHUNK = 48;

const DEFAULT_FIELDS: FlashcardJapaneseField[] = ["kana", "example_sentence"];

function fieldKey(lineIndex: number, field: FlashcardJapaneseField): string {
  return `${lineIndex}:${field}`;
}

export function localJapaneseToHiragana(text: string): string {
  return toHiragana(text.trim());
}

export function rowHasJapaneseForHiragana(row: RowJapaneseFields): boolean {
  return Boolean(row.kana.trim() || row.example_sentence.trim());
}

export function rowsHaveJapaneseForHiragana(rows: RowJapaneseFields[]): boolean {
  return rows.some(rowHasJapaneseForHiragana);
}

export function rowNeedsKanjiReadingForHiragana(row: RowJapaneseFields): boolean {
  const k = row.kana.trim();
  const ex = row.example_sentence.trim();
  return Boolean((k && hasKanji(k)) || (ex && hasKanji(ex)));
}

export function rowsNeedKanjiReadingForHiragana(rows: RowJapaneseFields[]): boolean {
  return rows.some(rowNeedsKanjiReadingForHiragana);
}

type KanjiSlot = { lineIndex: number; field: FlashcardJapaneseField; text: string };

/**
 * Convert kana and example fields to hiragana (wanakana locally; batch-reading API for kanji).
 */
export async function convertJapaneseFieldsToHiragana<T extends RowJapaneseFields>(
  rows: T[],
  fields: FlashcardJapaneseField[] = DEFAULT_FIELDS
): Promise<T[]> {
  const localByKey = new Map<string, string>();
  const kanjiSlots: KanjiSlot[] = [];

  rows.forEach((row, lineIndex) => {
    for (const field of fields) {
      const raw = row[field].trim();
      if (!raw) continue;
      const key = fieldKey(lineIndex, field);
      if (hasKanji(raw)) {
        kanjiSlots.push({ lineIndex, field, text: raw });
      } else {
        localByKey.set(key, localJapaneseToHiragana(raw));
      }
    }
  });

  const aiByKey = new Map<string, string>();

  for (let start = 0; start < kanjiSlots.length; start += BATCH_CHUNK) {
    const chunk = kanjiSlots.slice(start, start + BATCH_CHUNK);
    const res = await fetch("/api/japanese/batch-reading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: chunk.map((s) => s.text) }),
    });
    const data = (await res.json()) as { readings?: string[]; error?: string };
    if (!res.ok) {
      throw new Error(data.error || "Hiragana conversion failed.");
    }
    const readings = data.readings;
    if (!Array.isArray(readings) || readings.length !== chunk.length) {
      throw new Error("Invalid hiragana response from server.");
    }
    chunk.forEach((slot, j) => {
      const reading = (readings[j] ?? "").trim();
      if (reading) aiByKey.set(fieldKey(slot.lineIndex, slot.field), reading);
    });
  }

  return rows.map((row, lineIndex) => {
    const next = { ...row };
    for (const field of fields) {
      const key = fieldKey(lineIndex, field);
      const fromAi = aiByKey.get(key);
      const fromLocal = localByKey.get(key);
      if (fromAi) next[field] = fromAi;
      else if (fromLocal) next[field] = fromLocal;
    }
    return next;
  });
}
