"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteFlashcard, deleteFlashcards, updateFlashcard } from "@/lib/flashcards-repo";
import type { FlashcardRow } from "@/lib/types";

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

const btnSecondary =
  "inline-flex min-h-[36px] items-center justify-center rounded-lg border border-pink-200 bg-white px-3 py-1.5 text-xs font-semibold text-pink-800 shadow-sm transition hover:bg-pink-50 disabled:pointer-events-none disabled:opacity-45";

/**
 * Spreadsheet-style bulk edit: one row per card, columns match the single-card editor fields.
 */
export function BulkEditFlashcardsModal({ cards, onClose, onSaved, onCardsRemoved }: Props) {
  const [rows, setRows] = useState<RowDraft[]>(() => rowsFromCards(cards));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geminiReady, setGeminiReady] = useState<boolean | null>(null);

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
    () => rows.some(rowWantsEnrichment) && geminiReady === true,
    [rows, geminiReady]
  );

  const autofillDisabledReason = useMemo(() => {
    if (geminiReady === false)
      return "Add GEMINI_API_KEY and/or GROQ_API_KEY to .env.local to use AI autofill.";
    if (geminiReady === null) return "Checking AI configuration…";
    if (rows.length === 0) return "";
    if (!rows.some(rowWantsEnrichment)) {
      return "All target fields are already filled (romaji, group, example, translation, teacher research).";
    }
    return "";
  }, [rows, geminiReady]);

  const updateCell = (index: number, field: keyof Omit<RowDraft, "id">, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[index], [field]: value };
      next[index] = row;
      return next;
    });
  };

  const runAutofill = useCallback(async () => {
    const toSend = rows.filter(rowWantsEnrichment);
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
      setRows((prev) =>
        prev.map((row) => {
          const ai = byId.get(row.id);
          if (!ai) return row;
          return mergeEnrichment(row, ai);
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Autofill failed.");
    } finally {
      setBusy(false);
    }
  }, [rows, geminiReady]);

  const removeRowByIcon = async (index: number) => {
    const id = rows[index]?.id;
    if (!id) return;
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
      const emptyIds = emptyRows.map((r) => r.id);
      if (emptyIds.length) {
        await deleteFlashcards(emptyIds);
        onCardsRemoved?.(emptyIds);
      }
      if (nonempty.length) {
        await Promise.all(
          nonempty.map((row) => {
            const def = row.definition.trim();
            const ka = row.kana.trim();
            return updateFlashcard(row.id, {
              phonetic_reading: row.phonetic_reading.trim() || null,
              category_label: row.category_label.trim() || null,
              definition: def || null,
              context_note: row.context_note.trim() || null,
              kana: ka || null,
              kanji: null,
              example_sentence: row.example_sentence.trim() || null,
              example_translation: row.example_translation.trim() || null,
              teacher_research: row.teacher_research.trim() || null,
            });
          })
        );
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const n = rows.length;

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
            Bulk edit ({n} card{n === 1 ? "" : "s"})
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Each row is one card. English gloss and/or kana is required unless you clear the whole row (save will delete
            it) or use the trash icon to remove a card immediately.{" "}
            <strong className="font-semibold text-neutral-700">Teacher research</strong> is prep only and never appears
            on presentation slides.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={btnSecondary}
              disabled={busy || !canAutofill}
              title={!canAutofill ? autofillDisabledReason : undefined}
              onClick={() => void runAutofill()}
            >
              {busy ? "Working…" : "Autofill empty fields (AI)"}
            </button>
            {geminiReady === false && (
              <span className="text-xs text-amber-800">
                Add <code className="rounded bg-amber-100 px-1">GEMINI_API_KEY</code> or{" "}
                <code className="rounded bg-amber-100 px-1">GROQ_API_KEY</code> to{" "}
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
          <table className="w-full min-w-[76rem] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-20 border-b border-pink-100 bg-gradient-to-b from-white to-pink-50/80 shadow-sm">
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-30 whitespace-nowrap border-r border-pink-100 bg-gradient-to-b from-white to-pink-50/80 px-2 py-2 pl-3 font-semibold text-neutral-600"
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
                  Example
                </th>
                <th scope="col" className="min-w-[8rem] whitespace-nowrap px-2 py-2 font-semibold text-neutral-600">
                  Ex. translation
                </th>
                <th scope="col" className="min-w-[14rem] px-2 py-2 font-semibold text-neutral-600">
                  Teacher research <span className="font-normal text-neutral-400">(not on slides)</span>
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
                <tr key={row.id} className="border-b border-pink-50/90 even:bg-pink-50/20">
                  <td className="sticky left-0 z-10 whitespace-nowrap border-r border-pink-100/80 bg-white px-2 py-1.5 pl-3 text-neutral-500 tabular-nums even:bg-[#fffafc]">
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
                      rows={2}
                      spellCheck={false}
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
                  <td className="sticky right-0 z-10 w-12 border-l border-pink-100/80 bg-white px-1 py-1 align-middle even:bg-[#fffafc]">
                    <button
                      type="button"
                      className={iconDelete}
                      aria-label="Delete card"
                      title="Delete card"
                      disabled={busy}
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
            disabled={busy || n === 0}
            onClick={() => void save()}
            className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600 disabled:opacity-50"
          >
            {busy ? "Saving…" : `Save ${n} card${n === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
