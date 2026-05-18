"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createFlashcard,
  deleteFlashcard,
  deleteFlashcards,
  listFlashcardsInSet,
  reorderFlashcardsInSet,
  updateFlashcard,
} from "@/lib/flashcards-repo";
import {
  convertJapaneseFieldsToHiragana,
  rowsHaveJapaneseForHiragana,
  rowsNeedKanjiReadingForHiragana,
} from "@/lib/flashcard-hiragana";
import type { FlashcardDraft, FlashcardRow } from "@/lib/types";

const DRAFT_PREFIX = "draft:";

function isDraftId(id: string): boolean {
  return id.startsWith(DRAFT_PREFIX);
}

/** Place the bulk-edited block (in `selectedOrderedIds` order) at the first original slot of any selected card. */
function mergeSelectedSubsetOrderIntoFullOrder(full: FlashcardRow[], selectedOrderedIds: string[]): string[] {
  const sel = new Set(selectedOrderedIds);
  const byId = new Map(full.map((c) => [c.id, c]));
  const sorted = [...full].sort((a, b) => a.position - b.position);
  const minIdx = sorted.findIndex((c) => sel.has(c.id));
  if (minIdx === -1) {
    return sorted.map((c) => c.id);
  }
  const before = sorted.slice(0, minIdx).filter((c) => !sel.has(c.id));
  const after = sorted.slice(minIdx).filter((c) => !sel.has(c.id));
  const orderedSel = selectedOrderedIds.map((id) => {
    const c = byId.get(id);
    if (!c) throw new Error(`Card ${id} is missing from the set. Close bulk edit and try again.`);
    return c;
  });
  return [...before, ...orderedSel, ...after].map((c) => c.id);
}

function reorderArray<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

type RowDraft = {
  id: string;
  phonetic_reading: string;
  category_label: string;
  kana: string;
  definition: string;
  context_note: string;
  example_sentence: string;
  example_translation: string;
  teacher_research: string;
};

type EnrichResultRow = {
  id: string;
  phonetic_reading: string | null;
  category_label: string | null;
  example_sentence: string | null;
  example_translation: string | null;
  teacher_research: string | null;
};

function rowsFromCards(cards: FlashcardRow[]): RowDraft[] {
  return cards.map((c) => ({
    id: c.id,
    phonetic_reading: c.phonetic_reading ?? "",
    category_label: c.category_label ?? "",
    kana: c.kana ?? "",
    definition: c.definition ?? "",
    context_note: c.context_note ?? "",
    example_sentence: c.example_sentence ?? "",
    example_translation: c.example_translation ?? "",
    teacher_research: c.teacher_research ?? "",
  }));
}

function newDraftRow(): RowDraft {
  return {
    id: `${DRAFT_PREFIX}${crypto.randomUUID()}`,
    phonetic_reading: "",
    category_label: "",
    kana: "",
    definition: "",
    context_note: "",
    example_sentence: "",
    example_translation: "",
    teacher_research: "",
  };
}

function rowDraftToFlashcardPatch(row: RowDraft): Omit<FlashcardDraft, "set_id" | "position"> {
  return {
    phonetic_reading: row.phonetic_reading.trim() || null,
    category_label: row.category_label.trim() || null,
    kana: row.kana.trim() || null,
    kanji: null,
    native_script: null,
    definition: row.definition.trim() || null,
    context_note: row.context_note.trim() || null,
    example_sentence: row.example_sentence.trim() || null,
    example_translation: row.example_translation.trim() || null,
    teacher_research: row.teacher_research.trim() || null,
  };
}

/** True when every editable cell is blank (trimmed). */
function rowIsEmpty(row: RowDraft): boolean {
  return !(
    row.phonetic_reading.trim() ||
    row.category_label.trim() ||
    row.kana.trim() ||
    row.definition.trim() ||
    row.context_note.trim() ||
    row.example_sentence.trim() ||
    row.example_translation.trim() ||
    row.teacher_research.trim()
  );
}

/** Row has kana + English and at least one autofill target field empty. */
function rowWantsEnrichment(row: RowDraft): boolean {
  const ka = row.kana.trim();
  const def = row.definition.trim();
  if (!ka || !def) return false;
  return (
    !row.phonetic_reading.trim() ||
    !row.category_label.trim() ||
    !row.example_sentence.trim() ||
    !row.example_translation.trim() ||
    !row.teacher_research.trim()
  );
}

function pickFill(existing: string, incoming: string | null | undefined): string {
  if (existing.trim()) return existing;
  const t = (incoming ?? "").trim();
  return t;
}

function mergeEnrichment(row: RowDraft, ai: EnrichResultRow): RowDraft {
  return {
    ...row,
    phonetic_reading: pickFill(row.phonetic_reading, ai.phonetic_reading),
    category_label: pickFill(row.category_label, ai.category_label),
    example_sentence: pickFill(row.example_sentence, ai.example_sentence),
    example_translation: pickFill(row.example_translation, ai.example_translation),
    teacher_research: pickFill(row.teacher_research, ai.teacher_research),
  };
}

function mergeRegeneratedContent(row: RowDraft, ai: EnrichResultRow): RowDraft {
  const use = (incoming: string | null | undefined, existing: string) => {
    const t = (incoming ?? "").trim();
    return t || existing;
  };
  return {
    ...row,
    example_sentence: use(ai.example_sentence, row.example_sentence),
    example_translation: use(ai.example_translation, row.example_translation),
    teacher_research: use(ai.teacher_research, row.teacher_research),
  };
}

/** Saved card with kana + English — eligible for per-row example/research regeneration. */
function rowCanRegenerate(row: RowDraft): boolean {
  return !isDraftId(row.id) && Boolean(row.kana.trim() && row.definition.trim());
}

function IconRegenerate() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

type Props = {
  setId: string;
  cards: FlashcardRow[];
  onClose: () => void;
  onSaved: () => void;
  /** After cards are deleted on the server (trash icon or save with fully empty rows). */
  onCardsRemoved?: (ids: string[]) => void;
};

const cell =
  "w-full min-w-[6.5rem] rounded border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-900 shadow-sm outline-none focus:border-pink-400 focus:ring-1 focus:ring-pink-300";

const iconDelete =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-200/90 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:pointer-events-none disabled:opacity-40";

const iconRegenerate =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-200/90 text-violet-700 transition hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:pointer-events-none disabled:opacity-40";

const btnSecondary =
  "inline-flex min-h-[36px] items-center justify-center rounded-lg border border-pink-200 bg-white px-3 py-1.5 text-xs font-semibold text-pink-800 shadow-sm transition hover:bg-pink-50 disabled:pointer-events-none disabled:opacity-45";

const gripHandle =
  "flex cursor-grab select-none flex-col items-center justify-center rounded-lg border border-pink-200/80 bg-pink-50/50 px-1.5 py-2 text-pink-400 shadow-sm hover:bg-pink-100/60 active:cursor-grabbing";

/**
 * Spreadsheet-style bulk edit: one row per card, columns match the single-card editor fields.
 */
export function BulkEditFlashcardsModal({ setId, cards, onClose, onSaved, onCardsRemoved }: Props) {
  const [rows, setRows] = useState<RowDraft[]>(() => rowsFromCards(cards));
  const [busy, setBusy] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [convertingHiragana, setConvertingHiragana] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geminiReady, setGeminiReady] = useState<boolean | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/gemini/status");
        const data = (await res.json()) as { configured?: boolean };
        if (!cancelled) setGeminiReady(Boolean(data.configured));
      } catch {
        if (!cancelled) setGeminiReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canAutofill = useMemo(
    () => rows.some((r) => !isDraftId(r.id) && rowWantsEnrichment(r)) && geminiReady === true,
    [rows, geminiReady]
  );

  const autofillDisabledReason = useMemo(() => {
    if (geminiReady === false)
      return "Add GEMINI_API_KEY, GROQ_API_KEY, and/or OPENAI_API_KEY to .env.local to use AI autofill.";
    if (geminiReady === null) return "Checking AI configuration…";
    if (rows.length === 0) return "";
    if (!rows.some((r) => !isDraftId(r.id) && rowWantsEnrichment(r))) {
      return "All target fields are already filled (romaji, group, example, translation, teacher research), or new rows need a saved card id for autofill.";
    }
    return "";
  }, [rows, geminiReady]);

  const needsAiForHiragana = useMemo(() => rowsNeedKanjiReadingForHiragana(rows), [rows]);

  const canConvertToHiragana = useMemo(() => {
    if (!rowsHaveJapaneseForHiragana(rows)) return false;
    if (needsAiForHiragana && geminiReady !== true) return false;
    return true;
  }, [rows, needsAiForHiragana, geminiReady]);

  const hiraganaDisabledReason = useMemo(() => {
    if (!rowsHaveJapaneseForHiragana(rows)) return "No kana or example text in any row.";
    if (needsAiForHiragana && geminiReady === false) {
      return "Kanji in kana or example needs AI keys (GEMINI, GROQ, or OPENAI) in .env.local.";
    }
    if (needsAiForHiragana && geminiReady === null) return "Checking AI configuration…";
    return "";
  }, [rows, needsAiForHiragana, geminiReady]);

  const runRegenerateRow = useCallback(
    async (index: number) => {
      const row = rows[index];
      if (!row || !rowCanRegenerate(row) || geminiReady !== true) return;

      setRegeneratingId(row.id);
      setError(null);
      try {
        const res = await fetch("/api/flashcards/enrich-lesson", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "regenerate",
            cards: [
              {
                id: row.id,
                kana: row.kana.trim(),
                definition: row.definition.trim(),
              },
            ],
          }),
        });
        const data = (await res.json()) as { results?: EnrichResultRow[]; error?: string };
        if (!res.ok) {
          throw new Error(data.error || "Regeneration failed.");
        }
        const list = data.results;
        if (!Array.isArray(list) || list.length === 0) {
          throw new Error("Invalid response from server.");
        }
        const ai = list.find((r) => r.id === row.id) ?? list[0];
        if (!ai) {
          throw new Error("No regenerated content returned.");
        }
        const merged = rows.map((r, ri) => (ri === index ? mergeRegeneratedContent(r, ai) : r));
        const converted = await convertJapaneseFieldsToHiragana(merged);
        setRows(converted);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Regeneration failed.");
      } finally {
        setRegeneratingId(null);
      }
    },
    [rows, geminiReady]
  );

  const runJapaneseToHiragana = useCallback(async () => {
    if (!rowsHaveJapaneseForHiragana(rows)) return;
    if (rowsNeedKanjiReadingForHiragana(rows) && geminiReady !== true) return;

    setConvertingHiragana(true);
    setError(null);
    try {
      setRows(await convertJapaneseFieldsToHiragana(rows));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hiragana conversion failed.");
    } finally {
      setConvertingHiragana(false);
    }
  }, [rows, geminiReady]);

  const hasPendingChanges = useMemo(() => {
    if (rows.some((r) => !rowIsEmpty(r))) return true;
    if (rows.some((r) => rowIsEmpty(r) && !isDraftId(r.id))) return true;
    return false;
  }, [rows]);

  const updateCell = (index: number, field: keyof Omit<RowDraft, "id">, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[index], [field]: value };
      next[index] = row;
      return next;
    });
  };

  const addRow = (afterIndex: number | null) => {
    setRows((prev) => {
      const row = newDraftRow();
      if (afterIndex === null || afterIndex >= prev.length) {
        return [...prev, row];
      }
      const next = [...prev];
      next.splice(afterIndex + 1, 0, row);
      return next;
    });
  };

  const runAutofill = useCallback(async () => {
    const toSend = rows.filter((r) => !isDraftId(r.id) && rowWantsEnrichment(r));
    if (toSend.length === 0 || geminiReady !== true) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/flashcards/enrich-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: toSend.map((r) => ({
            id: r.id,
            kana: r.kana.trim(),
            definition: r.definition.trim(),
          })),
        }),
      });
      const data = (await res.json()) as { results?: EnrichResultRow[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Autofill failed.");
      }
      const list = data.results;
      if (!Array.isArray(list)) {
        throw new Error("Invalid response from server.");
      }
      const byId = new Map(list.map((r) => [r.id, r] as const));
      const merged = rows.map((row) => {
        const ai = byId.get(row.id);
        if (!ai) return row;
        return mergeEnrichment(row, ai);
      });
      setRows(await convertJapaneseFieldsToHiragana(merged));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Autofill failed.");
    } finally {
      setBusy(false);
    }
  }, [rows, geminiReady]);

  const removeRowByIcon = async (index: number) => {
    const id = rows[index]?.id;
    if (!id) return;
    if (isDraftId(id)) {
      setRows((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteFlashcard(id);
      setRows((prev) => prev.filter((_, i) => i !== index));
      onCardsRemoved?.([id]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete card");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!setId.trim()) {
      setError("No collection is active.");
      return;
    }

    const emptyRows = rows.filter(rowIsEmpty);
    const nonempty = rows.filter((r) => !rowIsEmpty(r));

    for (let i = 0; i < nonempty.length; i++) {
      const row = nonempty[i];
      const def = row.definition.trim();
      const ka = row.kana.trim();
      if (!def && !ka) {
        const displayIndex = rows.indexOf(row) + 1;
        setError(
          `Row ${displayIndex}: enter English gloss and/or kana, clear other fields to delete the card, or use the trash icon.`
        );
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      let rowsToSave = nonempty;
      if (rowsHaveJapaneseForHiragana(nonempty)) {
        if (rowsNeedKanjiReadingForHiragana(nonempty) && geminiReady !== true) {
          setError(
            geminiReady === false
              ? "Example or kana still has kanji. Add AI keys in .env.local or use Kana & example → hiragana first."
              : "Checking AI configuration for hiragana conversion…"
          );
          setBusy(false);
          return;
        }
        rowsToSave = await convertJapaneseFieldsToHiragana(nonempty);
        setRows((prev) => {
          const byId = new Map(rowsToSave.map((r) => [r.id, r]));
          return prev.map((r) => byId.get(r.id) ?? r);
        });
      }

      const emptyRealIds = emptyRows.map((r) => r.id).filter((id) => !isDraftId(id));
      if (emptyRealIds.length) {
        await deleteFlashcards(emptyRealIds);
        onCardsRemoved?.(emptyRealIds);
      }

      const idMap = new Map<string, string>();
      for (const row of rowsToSave) {
        if (isDraftId(row.id)) {
          const newId = await createFlashcard(setId, rowDraftToFlashcardPatch(row), 0);
          idMap.set(row.id, newId);
        }
      }

      const resolvedIds = rowsToSave.map((r) => idMap.get(r.id) ?? r.id);

      for (const row of rowsToSave) {
        if (isDraftId(row.id)) continue;
        const id = row.id;
        const patch = rowDraftToFlashcardPatch(row);
        await updateFlashcard(id, patch);
      }

      const full = await listFlashcardsInSet(setId);
      if (resolvedIds.length > 0) {
        const mergedIds = mergeSelectedSubsetOrderIntoFullOrder(full, resolvedIds);
        if (mergedIds.length !== full.length) {
          throw new Error("Could not save order: deck changed while editing. Close and try again.");
        }
        await reorderFlashcardsInSet(setId, mergedIds);
      }

      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const n = rows.length;
  const nonemptyCount = rows.filter((r) => !rowIsEmpty(r)).length;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-edit-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-[min(96rem,calc(100vw-1.5rem))] flex-col rounded-2xl bg-white shadow-xl ring-1 ring-pink-100">
        <div className="shrink-0 border-b border-pink-100 px-4 py-3 sm:px-5 sm:py-4">
          <h2 id="bulk-edit-title" className="text-lg font-semibold text-neutral-900">
            Bulk edit ({n} row{n === 1 ? "" : "s"}, {nonemptyCount} with content)
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Each row is one card. Use <strong className="font-semibold text-neutral-700">Add row</strong> for new cards
            and <strong className="font-semibold text-neutral-700">drag the handle</strong> in the first column to change
            order (saved with the deck). English gloss and/or kana is required unless you clear the whole row (save will
            delete it) or use the trash icon.{" "}
            <strong className="font-semibold text-neutral-700">Teacher research</strong> is prep only and never appears
            on presentation slides. AI fills it in <strong className="font-semibold text-neutral-700">Taglish</strong>{" "}
            (cultural and historical notes, 5–10 sentences). Use the per-row{" "}
            <strong className="font-semibold text-neutral-700">regenerate</strong> button to refresh example, translation,
            and teacher research.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={btnSecondary}
              disabled={busy}
              onClick={() => addRow(null)}
              title="Append a new blank row at the end"
            >
              Add row
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={busy || regeneratingId !== null || convertingHiragana || !canAutofill}
              title={!canAutofill ? autofillDisabledReason : undefined}
              onClick={() => void runAutofill()}
            >
              {busy ? "Working…" : "Autofill empty fields (AI)"}
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={busy || regeneratingId !== null || convertingHiragana || !canConvertToHiragana}
              title={!canConvertToHiragana ? hiraganaDisabledReason : undefined}
              onClick={() => void runJapaneseToHiragana()}
            >
              {convertingHiragana ? "Converting…" : "Kana & example → hiragana"}
            </button>
            {geminiReady === false && (
              <span className="text-xs text-amber-800">
                Add <code className="rounded bg-amber-100 px-1">GEMINI_API_KEY</code>,{" "}
                <code className="rounded bg-amber-100 px-1">GROQ_API_KEY</code>, or{" "}
                <code className="rounded bg-amber-100 px-1">OPENAI_API_KEY</code> to{" "}
                <code className="rounded bg-amber-100 px-1">.env.local</code> for AI.
              </span>
            )}
            {!busy && canAutofill && (
              <span className="text-xs text-neutral-500">
                Fills only empty romaji, group, example, translation, and teacher research. AI may be inaccurate —
                verify before class.
              </span>
            )}
            {!busy && !canAutofill && autofillDisabledReason && geminiReady !== false && (
              <span className="text-xs text-neutral-500">{autofillDisabledReason}</span>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[78rem] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-20 border-b border-pink-100 bg-gradient-to-b from-white to-pink-50/80 shadow-sm">
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-30 w-[4.5rem] whitespace-nowrap border-r border-pink-100 bg-gradient-to-b from-white to-pink-50/80 px-1 py-2 pl-2 font-semibold text-neutral-600"
                >
                  <span className="sr-only">Drag to reorder</span>
                  <span aria-hidden className="text-[0.65rem] font-normal text-neutral-400">
                    drag
                  </span>
                </th>
                <th
                  scope="col"
                  className="sticky left-[4.5rem] z-30 w-8 whitespace-nowrap border-r border-pink-100 bg-gradient-to-b from-white to-pink-50/80 px-1 py-2 font-semibold text-neutral-600"
                >
                  #
                </th>
                <th scope="col" className="whitespace-nowrap px-2 py-2 font-semibold text-neutral-600">
                  Romaji
                </th>
                <th scope="col" className="whitespace-nowrap px-2 py-2 font-semibold text-neutral-600">
                  Group
                </th>
                <th scope="col" className="min-w-[8rem] whitespace-nowrap px-2 py-2 font-semibold text-neutral-600">
                  Kana
                </th>
                <th scope="col" className="min-w-[9rem] whitespace-nowrap px-2 py-2 font-semibold text-neutral-600">
                  English
                </th>
                <th scope="col" className="min-w-[7rem] whitespace-nowrap px-2 py-2 font-semibold text-neutral-600">
                  Context
                </th>
                <th scope="col" className="min-w-[8rem] whitespace-nowrap px-2 py-2 font-semibold text-neutral-600">
                  Example <span className="font-normal text-neutral-400">(hiragana)</span>
                </th>
                <th scope="col" className="min-w-[8rem] whitespace-nowrap px-2 py-2 font-semibold text-neutral-600">
                  Ex. translation
                </th>
                <th scope="col" className="min-w-[14rem] px-2 py-2 font-semibold text-neutral-600">
                  Teacher research <span className="font-normal text-neutral-400">(not on slides)</span>
                </th>
                <th
                  scope="col"
                  className="sticky right-[3rem] z-30 w-12 border-l border-pink-100 bg-gradient-to-b from-white to-pink-50/80 px-1 py-2 text-center font-semibold text-neutral-600"
                >
                  <span className="sr-only">Regenerate AI fields</span>
                  <span aria-hidden title="Regenerate example, translation, teacher research">
                    ↻
                  </span>
                </th>
                <th
                  scope="col"
                  className="sticky right-0 z-30 w-12 border-l border-pink-100 bg-gradient-to-b from-white to-pink-50/80 px-1 py-2 pr-3 text-center font-semibold text-neutral-600"
                >
                  <span className="sr-only">Delete</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.id}
                  onDragOver={(e) => {
                    if (busy || regeneratingId !== null || convertingHiragana) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverIndex(i);
                  }}
                  onDrop={(e) => {
                    if (busy || regeneratingId !== null || convertingHiragana) return;
                    e.preventDefault();
                    const raw = e.dataTransfer.getData("text/plain");
                    const from = parseInt(raw, 10);
                    if (Number.isNaN(from) || from === i) {
                      setDragOverIndex(null);
                      return;
                    }
                    setRows((prev) => reorderArray(prev, from, i));
                    setDragOverIndex(null);
                    setDraggingIndex(null);
                  }}
                  className={`border-b border-pink-50/90 even:bg-pink-50/20 transition ${
                    dragOverIndex === i && draggingIndex !== null && draggingIndex !== i
                      ? "bg-pink-100/50 ring-2 ring-inset ring-pink-300"
                      : ""
                  } ${draggingIndex === i ? "opacity-55" : ""}`}
                >
                  <td className="sticky left-0 z-10 border-r border-pink-100/80 bg-white px-1 py-1 align-middle even:bg-[#fffafc]">
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className={`${gripHandle} ${busy || regeneratingId !== null || convertingHiragana ? "pointer-events-none opacity-40" : ""}`}
                        draggable={!busy && regeneratingId === null && !convertingHiragana}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", String(i));
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingIndex(i);
                        }}
                        onDragEnd={() => {
                          setDraggingIndex(null);
                          setDragOverIndex(null);
                        }}
                        aria-label={`Drag to reorder row ${i + 1}`}
                        title="Drag to reorder"
                      >
                        <span className="flex flex-col gap-0.5 leading-none" aria-hidden>
                          <span>⋮</span>
                          <span>⋮</span>
                        </span>
                      </div>
                      <button
                        type="button"
                        className="text-[0.65rem] font-medium text-pink-700 underline decoration-pink-300 underline-offset-2 hover:text-pink-900 disabled:opacity-40"
                        disabled={busy}
                        title="Insert a blank row below this one"
                        onClick={() => addRow(i)}
                      >
                        + row
                      </button>
                    </div>
                  </td>
                  <td className="sticky left-[4.5rem] z-10 w-8 whitespace-nowrap border-r border-pink-100/80 bg-white px-1 py-1.5 text-center text-neutral-500 tabular-nums even:bg-[#fffafc]">
                    {i + 1}
                  </td>
                  <td className="px-1 py-1 align-top">
                    <input
                      type="text"
                      className={cell}
                      value={row.phonetic_reading}
                      onChange={(e) => updateCell(i, "phonetic_reading", e.target.value)}
                      spellCheck={false}
                    />
                  </td>
                  <td className="px-1 py-1 align-top">
                    <input
                      type="text"
                      className={cell}
                      value={row.category_label}
                      onChange={(e) => updateCell(i, "category_label", e.target.value)}
                    />
                  </td>
                  <td className="px-1 py-1 align-top">
                    <textarea
                      lang="ja"
                      rows={2}
                      spellCheck={false}
                      autoComplete="off"
                      className={`${cell} resize-y`}
                      value={row.kana}
                      onChange={(e) => updateCell(i, "kana", e.target.value)}
                    />
                  </td>
                  <td className="px-1 py-1 align-top">
                    <textarea
                      rows={2}
                      className={`${cell} resize-y`}
                      value={row.definition}
                      onChange={(e) => updateCell(i, "definition", e.target.value)}
                    />
                  </td>
                  <td className="px-1 py-1 align-top">
                    <input
                      type="text"
                      className={cell}
                      value={row.context_note}
                      onChange={(e) => updateCell(i, "context_note", e.target.value)}
                    />
                  </td>
                  <td className="px-1 py-1 align-top">
                    <textarea
                      lang="ja"
                      rows={2}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder="ひらがなで例文"
                      className={`${cell} resize-y bg-pink-50/40`}
                      value={row.example_sentence}
                      onChange={(e) => updateCell(i, "example_sentence", e.target.value)}
                    />
                  </td>
                  <td className="px-1 py-1 align-top">
                    <textarea
                      rows={2}
                      className={`${cell} resize-y bg-pink-50/40`}
                      value={row.example_translation}
                      onChange={(e) => updateCell(i, "example_translation", e.target.value)}
                    />
                  </td>
                  <td className="min-w-[14rem] px-1 py-1 align-top">
                    <textarea
                      rows={3}
                      spellCheck={true}
                      placeholder="Cultural notes, stories, teaching hooks — not shown to students"
                      className={`${cell} min-h-[4.5rem] resize-y border-violet-100 bg-violet-50/30`}
                      value={row.teacher_research}
                      onChange={(e) => updateCell(i, "teacher_research", e.target.value)}
                    />
                  </td>
                  <td className="sticky right-[3rem] z-10 w-12 border-l border-pink-100/80 bg-white px-1 py-1 align-middle even:bg-[#fffafc]">
                    <button
                      type="button"
                      className={iconRegenerate}
                      aria-label="Regenerate example, translation, and teacher research"
                      title={
                        !rowCanRegenerate(row)
                          ? "Save the card first and enter kana + English to regenerate"
                          : geminiReady !== true
                            ? autofillDisabledReason || "AI not configured"
                            : "Regenerate example, translation, and teacher research (AI)"
                      }
                      disabled={
                        busy ||
                        regeneratingId !== null ||
                        convertingHiragana ||
                        !rowCanRegenerate(row) ||
                        geminiReady !== true
                      }
                      onClick={() => void runRegenerateRow(i)}
                    >
                      {regeneratingId === row.id ? (
                        <span className="text-[0.65rem] font-semibold" aria-hidden>
                          …
                        </span>
                      ) : (
                        <IconRegenerate />
                      )}
                    </button>
                  </td>
                  <td className="sticky right-0 z-10 w-12 border-l border-pink-100/80 bg-white px-1 py-1 align-middle even:bg-[#fffafc]">
                    <button
                      type="button"
                      className={iconDelete}
                      aria-label="Delete card"
                      title="Delete card"
                      disabled={busy || regeneratingId !== null || convertingHiragana}
                      onClick={() => void removeRowByIcon(i)}
                    >
                      <IconTrash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="shrink-0 border-t border-pink-100 px-4 py-2">
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          </div>
        )}

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-pink-100 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || regeneratingId !== null || convertingHiragana || !hasPendingChanges}
            onClick={() => void save()}
            className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600 disabled:opacity-50"
          >
            {busy ? "Saving…" : `Save (${nonemptyCount} card${nonemptyCount === 1 ? "" : "s"})`}
          </button>
        </div>
      </div>
    </div>
  );
}
