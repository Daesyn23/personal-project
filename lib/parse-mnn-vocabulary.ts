import type { FlashcardDraft } from "@/lib/types";
import type { TableResult } from "pdf-parse";
import { hasKanji, isKanaOnly } from "@/lib/japanese-tokens";
import { lessonPdfLegacyFallback } from "@/lib/parse-lesson-pdf";

function empty(position: number): FlashcardDraft {
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

function isLatinDefinition(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/[\u3040-\u9FFF]/.test(t)) return false;
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  return letters >= 2 && letters / Math.max(t.length, 1) > 0.3;
}

function isHeaderCells(cells: string[]): boolean {
  const joined = cells.join(" ").toLowerCase();
  if (/english.*kana.*kanji|kana.*english.*kanji/.test(joined.replace(/\s+/g, " "))) {
    return true;
  }
  const set = new Set(cells.map((c) => c.replace(/[^a-z]/gi, "").toLowerCase()));
  const hits = ["english", "kana", "kanji"].filter((h) => set.has(h)).length;
  return hits >= 2;
}

function isHeaderLine(line: string): boolean {
  const compact = line.replace(/\s+/g, " ").trim().toLowerCase();
  if (/^english\s+kana\s+kanji|^kana\s+english\s+kanji/.test(compact)) return true;
  const parts = line.split(/\s+/).map((p) => p.replace(/[^a-z]/gi, "").toLowerCase());
  const headerHits = parts.filter((p) =>
    ["kana", "english", "kanji", "romaji", "meaning"].includes(p)
  ).length;
  return headerHits >= 2 && line.length < 120;
}

/**
 * Minna-style row: English | Kana | Kanji (kanji may be empty).
 */
export function rowCellsToDraft(cells: string[], position: number): FlashcardDraft | null {
  const raw = cells
    .map((c) => c.replace(/\u00ad/g, "").normalize("NFKC").trim())
    .filter((c) => c.length > 0);
  if (raw.length < 2) return null;

  let parts = raw;
  if (/^\d+$/.test(parts[0])) {
    parts = parts.slice(1);
  }
  if (parts.length < 2) return null;

  if (isLatinDefinition(parts[0])) {
    const d = empty(position);
    d.definition = parts[0];
    d.kana = parts[1] ?? null;
    d.kanji = parts.length >= 3 && parts[2]?.length ? parts[2] : null;
    return d;
  }

  const english = parts.find((p) => isLatinDefinition(p));
  const kana = parts.find((p) => isKanaOnly(p));
  const kanji = parts.find((p) => hasKanji(p) && !isKanaOnly(p));

  if (!english && !kana && !kanji) return null;

  const d = empty(position);
  d.definition = english ?? null;
  d.kana = kana ?? null;
  d.kanji = kanji ?? null;
  return d;
}

function renumber(drafts: FlashcardDraft[]): FlashcardDraft[] {
  return drafts.map((d, i) => ({ ...d, position: i }));
}

/** Junk glosses legacy/token parsers emit when Japanese never landed in kana/kanji columns */
function isJunkGloss(def: string | null | undefined): boolean {
  const t = (def ?? "").trim();
  if (t.length === 0) return false;
  if (t.length <= 2 && /^(to|a|an|the|in|on|at|is|be|or|of|it|as|by)$/i.test(t)) return true;
  if (t.length < 4 && /^[a-z]+$/i.test(t)) return true;
  return false;
}

function countKanaRichRows(rows: FlashcardDraft[]): number {
  return rows.filter((r) => r.kana && r.kana.length > 1).length;
}

export function scoreLessonVocabularyRows(rows: FlashcardDraft[]): number {
  let s = 0;
  for (const r of rows) {
    if (r.kana && r.kana.length > 1) s += 10;
    if (r.kanji && r.kanji.length > 0) s += 4;
    const def = r.definition?.trim() ?? "";
    if (isJunkGloss(def)) s -= 6;
    else if (def.length >= 12) s += 3;
    else if (def.length > 6) s += 2;
    else if (def.length > 3) s += 1;
  }
  return s;
}

function compareVocabularyCandidates(a: FlashcardDraft[], b: FlashcardDraft[]): number {
  const ka = countKanaRichRows(a);
  const kb = countKanaRichRows(b);
  if (ka !== kb) return ka - kb;
  return scoreLessonVocabularyRows(a) - scoreLessonVocabularyRows(b);
}

function pickBestVocabularyCandidate(candidates: FlashcardDraft[][]): FlashcardDraft[] {
  if (candidates.length === 0) return [];
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (compareVocabularyCandidates(candidates[i], best) > 0) best = candidates[i];
  }
  return best;
}

/** NFKC (halfwidth katakana → fullwidth), soft hyphens, stable newlines — run before any strategy */
export function normalizeLessonPdfText(text: string): string {
  return text.replace(/\r/g, "\n").replace(/\u00ad/g, "").normalize("NFKC");
}

/**
 * When the PDF breaks a row so English ends a line and kana starts the next, join them.
 */
function mergeLatinLineWithFollowingKana(text: string): string {
  const raw = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    const trimmedEnd = line.trimEnd();
    const nextLine = raw[i + 1];
    if (nextLine === undefined) {
      out.push(line);
      continue;
    }
    const nxt = nextLine.trimStart();
    const curHasCjk = /[\u3040-\u9FFF]/.test(trimmedEnd);
    const nextStartsJp = /^[\u3040-\u309F\u30A0-\u30FF\uFF66-\uFF9F\u4E00-\u9FFF]/.test(nxt);
    const curNonEmpty = trimmedEnd.length > 0;
    const looksLikeGlossEnd = /[a-zA-Z0-9),.;'’\-]$/.test(trimmedEnd);
    if (curNonEmpty && !curHasCjk && nextStartsJp && looksLikeGlossEnd) {
      out.push(trimmedEnd + " " + nxt);
      i++;
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/**
 * Parse one line/chunk: English (Latin, no CJK) … first kana run … rest = Kanji (may be empty).
 * Matches Minna no Nihongo-style rows: English | Kana | Kanji
 */
function parseOneLessonRow(segment: string): FlashcardDraft | null {
  let s = segment.trim().replace(/\u00ad/g, "");
  if (s.length < 4) return null;
  if (isHeaderLine(s)) return null;

  s = s.replace(/^\d{1,3}[.)．]?\s+/, "").trim();

  const kanaRe =
    /([\u3040-\u309F\u30A0-\u30FF\uFF66-\uFF9Fー〜・]{2,})/u;
  const km = kanaRe.exec(s);
  if (!km || km.index === undefined) return null;

  const kana = km[1];
  let english = s.slice(0, km.index).trim();
  english = english.replace(/^\d{1,3}[.)．]?\s+/, "").trim();

  let after = s.slice(km.index + kana.length).trim();
  after = after.replace(/\s+\d{1,3}\s*$/u, "").trim();

  if (!english || /[\u3040-\u9FFF]/.test(english)) return null;

  const letters = (english.match(/[A-Za-z]/g) || []).length;
  if (letters < 2 && english.length < 3) return null;

  let kanji: string | null = after.length ? after : null;
  if (kanji && /^[A-Za-z]/.test(kanji) && !/[\u4E00-\u9FFF]/.test(kanji)) {
    kanji = null;
  }

  const d = empty(0);
  d.definition = english;
  d.kana = kana;
  d.kanji = kanji;
  return d;
}

/**
 * Find vocabulary rows by anchoring on kana runs (handles English phrases with spaces).
 */
export function flashcardsFromKanaAnchors(text: string): FlashcardDraft[] {
  const n = text.replace(/\r/g, "\n").replace(/\u00ad/g, "");
  const seen = new Set<string>();
  const out: FlashcardDraft[] = [];

  const tryAdd = (draft: FlashcardDraft | null) => {
    if (!draft?.kana || !draft.definition) return;
    const key = `${draft.kana}\t${draft.definition.slice(0, 48)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...draft, position: out.length });
  };

  const newlineCount = (n.match(/\n/g) || []).length;
  if (newlineCount < 12) {
    const merged = n.split(/\s+(?=\d{1,2}\s+[A-Za-z("])/u);
    for (const chunk of merged) {
      const t = chunk.trim();
      if (t.length < 6) continue;
      tryAdd(parseOneLessonRow(t));
    }
  }

  for (const rawLine of n.split(/\n+/)) {
    const line = rawLine.trim();
    if (line.length < 6) continue;
    tryAdd(parseOneLessonRow(line));
  }

  if (out.length < 4 && newlineCount >= 12) {
    const merged = n.split(/\s+(?=\d{1,2}\s+[A-Za-z("])/u);
    for (const chunk of merged) {
      const t = chunk.trim();
      if (t.length < 6) continue;
      tryAdd(parseOneLessonRow(t));
    }
  }

  return renumber(out);
}

/** pdf-parse getTable() → flashcards */
export function flashcardsFromPdfTables(tableResult: TableResult): FlashcardDraft[] {
  const out: FlashcardDraft[] = [];
  const tables: string[][][] = [];

  if (tableResult.mergedTables?.length) {
    tables.push(...tableResult.mergedTables);
  } else {
    for (const page of tableResult.pages ?? []) {
      for (const t of page.tables ?? []) {
        tables.push(t);
      }
    }
  }

  for (const table of tables) {
    if (!table?.length) continue;
    let start = 0;
    if (table[0] && isHeaderCells(table[0].map(String))) {
      start = 1;
    }
    for (let i = start; i < table.length; i++) {
      const row = table[i].map((c) => String(c));
      const draft = rowCellsToDraft(row, out.length);
      if (draft) out.push(draft);
    }
  }

  return out;
}

/** Lines with tab separators (getText with cellSeparator: '\\t') */
export function flashcardsFromTabSeparatedText(text: string): FlashcardDraft[] {
  const out: FlashcardDraft[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.includes("\t")) continue;
    if (line.length < 3) continue;
    if (isHeaderLine(line)) continue;

    const cells = line.split("\t").map((c) => c.trim());
    const draft = rowCellsToDraft(cells, out.length);
    if (draft) out.push(draft);
  }
  return out;
}

/** 3+ columns separated by 2+ spaces */
export function flashcardsFromWideSpaceColumns(text: string): FlashcardDraft[] {
  const out: FlashcardDraft[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!/\s{2,}/.test(line)) continue;
    if (isHeaderLine(line)) continue;

    const cells = line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;

    const draft = rowCellsToDraft(cells, out.length);
    if (draft && (draft.definition || draft.kana)) {
      out.push(draft);
    }
  }
  return out;
}

/**
 * Repeating triplets: English (long Latin) + kana run + kanji run (Lesson 18 PDF stream).
 */
export function flashcardsFromSequentialPattern(text: string): FlashcardDraft[] {
  const normalized = text.replace(/\r/g, "\n");
  const out: FlashcardDraft[] = [];

  const blockRe =
    /(?:^|[\n\s])(?:\d{1,2}\s+)?([A-Za-z][A-Za-z0-9\s\-;,'’~()./]{3,}?)\s+([\u3040-\u309F\u30A0-\u30FF\uFF66-\uFF9Fー〜・]{2,})\s+([\u4E00-\u9FFF][\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FFー〜]*)(?=[\s\n]|$)/gu;

  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(normalized)) !== null) {
    const definition = m[1].trim();
    const kana = m[2].trim();
    const kanji = m[3].trim();
    if (!definition || !kana) continue;
    if (/^(kana|english|kanji)$/i.test(definition)) continue;

    const d = empty(out.length);
    d.definition = definition;
    d.kana = kana;
    d.kanji = kanji || null;
    out.push(d);
  }

  return out;
}

/**
 * Full pipeline for lesson PDF text (and optional vector table result from getTable).
 */
export function extractLessonVocabularyFromPdfText(
  text: string,
  tableResult?: TableResult | null
): FlashcardDraft[] {
  const normalized = mergeLatinLineWithFollowingKana(normalizeLessonPdfText(text));

  const candidates: FlashcardDraft[][] = [];

  if (tableResult) {
    const fromTables = flashcardsFromPdfTables(tableResult);
    if (fromTables.length > 0) candidates.push(fromTables);
  }

  const fromAnchor = flashcardsFromKanaAnchors(normalized);
  if (fromAnchor.length > 0) candidates.push(fromAnchor);

  const fromTabs = flashcardsFromTabSeparatedText(normalized);
  if (fromTabs.length > 0) candidates.push(fromTabs);

  const fromWide = flashcardsFromWideSpaceColumns(normalized);
  if (fromWide.length > 0) candidates.push(fromWide);

  const fromSeq = flashcardsFromSequentialPattern(normalized);
  if (fromSeq.length > 0) candidates.push(fromSeq);

  const legacy = lessonPdfLegacyFallback(normalized);
  if (legacy.length > 0) candidates.push(legacy);

  if (candidates.length === 0) {
    return [];
  }

  return renumber(pickBestVocabularyCandidate(candidates));
}
