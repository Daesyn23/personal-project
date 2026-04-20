"use client";

import { useState } from "react";
import { updateFlashcard } from "@/lib/flashcards-repo";
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
  }));
}

type Props = {
  cards: FlashcardRow[];
  onClose: () => void;
  onSaved: () => void;
};

const cell =
  "w-full min-w-[6.5rem] rounded border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-900 shadow-sm outline-none focus:border-pink-400 focus:ring-1 focus:ring-pink-300";

/**
 * Spreadsheet-style bulk edit: one row per card, columns match the single-card editor fields.
 */
export function BulkEditFlashcardsModal({ cards, onClose, onSaved }: Props) {
  const [rows, setRows] = useState<RowDraft[]>(() => rowsFromCards(cards));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateCell = (index: number, field: keyof Omit<RowDraft, "id">, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[index], [field]: value };
      next[index] = row;
      return next;
    });
  };

  const save = async () => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const def = row.definition.trim();
      const ka = row.kana.trim();
      if (!def && !ka) {
        setError(`Row ${i + 1}: enter English gloss and/or kana.`);
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      await Promise.all(
        rows.map((row) => {
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
          });
        })
      );
      onSaved();
      onClose();
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
            Edit cells like a spreadsheet. Each row is one card. English gloss and/or kana is required on every row.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[56rem] border-collapse text-left text-xs">
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
                <th scope="col" className="min-w-[8rem] whitespace-nowrap px-2 py-2 pr-3 font-semibold text-neutral-600">
                  Ex. translation
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
                  <td className="px-1 py-1 pr-2 align-top">
                    <textarea
                      rows={2}
                      className={`${cell} resize-y bg-pink-50/40`}
                      value={row.example_translation}
                      onChange={(e) => updateCell(i, "example_translation", e.target.value)}
                    />
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
            disabled={busy}
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
