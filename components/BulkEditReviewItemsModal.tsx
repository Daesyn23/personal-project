"use client";

import { useState } from "react";
import { HeadingWithInfo, InfoTip } from "@/components/InfoTip";
import {
  deleteReviewItems,
  updateReviewItem,
} from "@/lib/review-repo";
import { jpFontClass } from "@/lib/workspace-translation";
import type { ReviewItemRow } from "@/lib/types";

const BATCH_SIZE = 40;

type RowDraft = {
  id: string;
  kana: string;
  definition: string;
  kanji: string;
};

type Props = {
  items: ReviewItemRow[];
  onClose: () => void;
  onSaved: () => void;
};

const cellClass =
  "w-full min-w-[7rem] rounded border border-pink-100 bg-[#fffafc] px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-pink-300 focus:ring-1 focus:ring-pink-200";

const jpCellClass = `${cellClass} text-base leading-snug ${jpFontClass}`;

function rowsFromItems(items: ReviewItemRow[]): RowDraft[] {
  return items.map((item) => ({
    id: item.id,
    kana: item.kana,
    definition: item.definition,
    kanji: item.kanji,
  }));
}

function IconTrash() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
    </svg>
  );
}

export function BulkEditReviewItemsModal({ items, onClose, onSaved }: Props) {
  const [rows, setRows] = useState<RowDraft[]>(() => rowsFromItems(items));
  const [busy, setBusy] = useState(false);
  const [generatingEnglish, setGeneratingEnglish] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const originalIds = new Set(items.map((i) => i.id));

  const updateRow = (id: string, field: keyof Omit<RowDraft, "id">, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const generateEnglish = async () => {
    const targets = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !row.definition.trim());

    if (targets.length === 0) {
      setError("Every row already has English.");
      return;
    }

    setGeneratingEnglish(true);
    setError(null);
    try {
      const updated = [...rows];
      for (let start = 0; start < targets.length; start += BATCH_SIZE) {
        const batch = targets.slice(start, start + BATCH_SIZE);
        const res = await fetch("/api/review/generate-english", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: batch.map(({ row }) => ({ kanji: row.kanji, kana: row.kana })),
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          definitions?: string[];
        } | null;
        if (!res.ok) {
          throw new Error(data?.error ?? `English generation failed (${res.status})`);
        }
        const defs = data?.definitions ?? [];
        batch.forEach(({ index }, i) => {
          const gloss = defs[i]?.trim() ?? "";
          if (gloss) {
            updated[index] = { ...updated[index], definition: gloss };
          }
        });
      }
      setRows(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "English generation failed");
    } finally {
      setGeneratingEnglish(false);
    }
  };

  const save = async () => {
    const valid = rows.filter(
      (r) => r.kana.trim() && r.definition.trim() && r.kanji.trim()
    );
    if (valid.length === 0) {
      setError("At least one complete row (hiragana, English, kanji) is required.");
      return;
    }

    const incomplete = rows.length - valid.length;
    if (incomplete > 0 && !window.confirm(`${incomplete} incomplete row(s) will be removed on save. Continue?`)) {
      return;
    }

    const keptIds = new Set(valid.map((r) => r.id));
    const toDelete = [...originalIds].filter((id) => !keptIds.has(id));

    setBusy(true);
    setError(null);
    try {
      await Promise.all(
        valid.map((row) =>
          updateReviewItem(row.id, {
            kana: row.kana.trim(),
            definition: row.definition.trim(),
            kanji: row.kanji.trim(),
          })
        )
      );
      if (toDelete.length > 0) {
        await deleteReviewItems(toDelete);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes");
    } finally {
      setBusy(false);
    }
  };

  const emptyEnglishCount = rows.filter((r) => !r.definition.trim()).length;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-edit-review-title"
    >
      <div className="flex max-h-[90dvh] w-full min-w-0 max-w-5xl flex-col rounded-2xl bg-white shadow-xl ring-1 ring-pink-100">
        <div className="border-b border-pink-100 px-5 py-3 sm:py-4">
          <HeadingWithInfo
            align="center"
            infoLabel="Bulk edit review cards"
            heading={
              <h2 id="bulk-edit-review-title" className="text-lg font-semibold text-neutral-900">
                Bulk edit
              </h2>
            }
          >
            Edit every card in this folder. Remove a row to delete that card when you save.
          </HeadingWithInfo>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={generatingEnglish || rows.length === 0}
              onClick={() => void generateEnglish()}
              className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50"
            >
              {generatingEnglish ? "Generating…" : "Generate English"}
            </button>
            {emptyEnglishCount > 0 && (
              <span className="text-xs text-neutral-500">
                {emptyEnglishCount} row{emptyEnglishCount === 1 ? "" : "s"} without English
              </span>
            )}
            <InfoTip label="Generate English help">
              Fills empty English cells using AI (same keys as Translate).
            </InfoTip>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-pink-100 text-neutral-500">
                <th className="w-11 p-2 font-medium text-center">#</th>
                <th className="p-2 font-medium">Kanji (front)</th>
                <th className="p-2 font-medium">Hiragana (back)</th>
                <th className="p-2 font-medium">English (back)</th>
                <th className="w-10 p-2" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.id} className="border-b border-pink-50 align-top">
                  <td className="p-2 align-middle">
                    <span
                      className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-pink-50 text-xs font-bold tabular-nums text-pink-700 ring-1 ring-pink-100"
                      aria-label={`Row ${idx + 1}`}
                    >
                      {idx + 1}
                    </span>
                  </td>
                  <td className="p-2">
                    <textarea
                      lang="ja"
                      spellCheck={false}
                      className={jpCellClass}
                      rows={2}
                      value={row.kanji}
                      onChange={(e) => updateRow(row.id, "kanji", e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <textarea
                      lang="ja"
                      spellCheck={false}
                      className={jpCellClass}
                      rows={2}
                      value={row.kana}
                      onChange={(e) => updateRow(row.id, "kana", e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <textarea
                      className={cellClass}
                      rows={2}
                      value={row.definition}
                      onChange={(e) => updateRow(row.id, "definition", e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                      title="Remove row (deletes card on save)"
                      aria-label="Remove row"
                    >
                      <IconTrash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="py-8 text-center text-neutral-500">No rows left. Cancel or close without saving.</p>
          )}
        </div>

        {error && (
          <p className="px-5 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-pink-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || generatingEnglish || rows.length === 0}
            onClick={() => void save()}
            className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
