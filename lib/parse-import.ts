import type { FlashcardDraft } from "@/lib/types";
import { extractLessonVocabularyFromPdfText } from "@/lib/parse-mnn-vocabulary";

type StringFieldKey =
  | "phonetic_reading"
  | "native_script"
  | "kana"
  | "kanji"
  | "category_label"
  | "definition"
  | "context_note"
  | "example_sentence"
  | "example_translation";

function setDraftString(draft: FlashcardDraft, key: StringFieldKey, value: string) {
  draft[key] = value;
}

const FIELD_ALIASES: Record<string, StringFieldKey> = {
  phonetic: "phonetic_reading",
  phonetic_reading: "phonetic_reading",
  romaji: "phonetic_reading",
  reading: "phonetic_reading",
  hiragana: "kana",
  katakana: "kana",
  kana: "kana",
  kanji: "kanji",
  kanji_characters: "kanji",
  native: "native_script",
  native_script: "native_script",
  word: "native_script",
  japanese: "native_script",
  category: "category_label",
  category_label: "category_label",
  group: "category_label",
  verb_group: "category_label",
  meaning: "definition",
  definition: "definition",
  english: "definition",
  gloss: "definition",
  context: "context_note",
  context_note: "context_note",
  note: "context_note",
  example: "example_sentence",
  example_sentence: "example_sentence",
  example_romaji: "example_sentence",
  sentence: "example_sentence",
  example_en: "example_translation",
  example_translation: "example_translation",
  translation: "example_translation",
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** Minimal CSV parser: supports quoted fields with commas */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
      rows.push(row);
    }
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      pushCell();
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    if (c === "\n") {
      pushCell();
      pushRow();
      i += 1;
      continue;
    }
    cell += c;
    i += 1;
  }
  pushCell();
  if (row.length) {
    pushRow();
  }
  return rows;
}

function rowToDraft(
  headers: string[],
  values: string[],
  position: number
): FlashcardDraft {
  const draft: FlashcardDraft = {
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

  headers.forEach((h, idx) => {
    const key = FIELD_ALIASES[normalizeHeader(h)];
    if (!key || idx >= values.length) return;
    const v = values[idx]?.trim();
    if (v) {
      setDraftString(draft, key, v);
    }
  });

  return draft;
}

function firstRowHasAliases(row: string[]): boolean {
  return row.some((cell) => FIELD_ALIASES[normalizeHeader(cell.trim())]);
}

/** Headerless: English, Kana, Kanji, Example sentence, Example translation [, Romaji, …] */
function rowByColumnOrder(cells: string[], position: number): FlashcardDraft {
  const v = (i: number) => cells[i]?.trim() || null;
  return {
    set_id: null,
    definition: v(0),
    kana: v(1),
    kanji: v(2),
    example_sentence: v(3),
    example_translation: v(4),
    phonetic_reading: v(5),
    native_script: v(6),
    category_label: v(7),
    context_note: v(8),
    position,
  };
}

/**
 * One line → one card: tabs, commas, or 2+ spaces split columns; single blob → native_script.
 */
function parsePlainLines(text: string): FlashcardDraft[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.map((line, i) => {
    let cells: string[] = [];
    if (line.includes("\t")) {
      cells = line.split("\t").map((c) => c.trim()).filter((c) => c.length > 0);
    } else if (line.includes(",")) {
      const r = parseCsv(`${line}\n`);
      cells = (r[0] ?? []).map((c) => c.trim()).filter((c) => c.length > 0);
    } else {
      const split = line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
      cells = split.length >= 2 ? split : [line];
    }
    if (cells.length <= 1) {
      const d = emptyDraft(i);
      const one = cells[0] ?? line;
      d.kana = /[\u3040-\u30FF]/.test(one) && !/[\u4E00-\u9FFF]/.test(one) ? one : null;
      d.kanji = /[\u4E00-\u9FFF]/.test(one) ? one : null;
      if (!d.kana && !d.kanji) d.definition = one;
      else d.native_script = one;
      return d;
    }
    return rowByColumnOrder(cells, i);
  });
}

/**
 * Tries: CSV with header row (aliases), fixed-width table without header, then line-by-line.
 */
export function parseDelimitedOrLines(text: string): FlashcardDraft[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const rows = parseCsv(trimmed);
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  if (firstRowHasAliases(headers) && rows.length >= 2) {
    return rows.slice(1).map((cells, i) => rowToDraft(headers, cells, i));
  }

  const width = rows[0]?.length ?? 0;
  if (
    width >= 2 &&
    rows.every((r) => r.length === width) &&
    !firstRowHasAliases(headers)
  ) {
    return rows.map((cells, i) => rowByColumnOrder(cells, i));
  }

  return parsePlainLines(trimmed);
}

export function parseImportFile(
  name: string,
  text: string
): FlashcardDraft[] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const lesson = extractLessonVocabularyFromPdfText(text);
    if (lesson.length > 0) {
      return lesson;
    }
    return parseDelimitedOrLines(text);
  }

  if (lower.endsWith(".json")) {
    const data = JSON.parse(text) as unknown;
    const arr = Array.isArray(data) ? data : [data];
    return arr.map((item, i) => {
      if (typeof item !== "object" || item === null) {
        return emptyDraft(i);
      }
      const o = item as Record<string, unknown>;
      const draft = emptyDraft(i);
      for (const [k, v] of Object.entries(o)) {
        const key = FIELD_ALIASES[normalizeHeader(k)];
        if (key && typeof v === "string" && v.trim()) {
          setDraftString(draft, key, v.trim());
        }
      }
      return draft;
    });
  }

  return parseDelimitedOrLines(text);
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
