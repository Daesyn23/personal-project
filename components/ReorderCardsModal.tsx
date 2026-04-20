"use client";

import { useEffect, useState } from "react";
import type { FlashcardRow } from "@/lib/types";

function tileLabel(card: FlashcardRow): string {
  return (
    card.kana?.trim() ||
    card.kanji?.trim() ||
    card.native_script?.trim() ||
    card.definition?.trim() ||
    card.phonetic_reading?.trim() ||
    "Untitled"
  );
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

type Props = {
  cards: FlashcardRow[];
  setTitle: string;
  onClose: () => void;
  onSaveOrder: (ordered: FlashcardRow[]) => Promise<void>;
};

/**
 * Modal: reorder by dragging rows or with ↑ ↓. Save persists positions.
 */
export function ReorderCardsModal({ cards, setTitle, onClose, onSaveOrder }: Props) {
  const [ordered, setOrdered] = useState<FlashcardRow[]>(() => [...cards]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const move = (index: number, delta: -1 | 1) => {
    const j = index + delta;
    if (j < 0 || j >= ordered.length) return;
    setOrdered((prev) => reorderArray(prev, index, j));
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSaveOrder(ordered);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save order.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reorder-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl ring-1 ring-pink-100">
        <div className="border-b border-pink-100 px-5 py-4">
          <h2 id="reorder-title" className="text-lg font-semibold text-neutral-900">
            Reorder cards
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Set: <span className="font-medium text-neutral-700">{setTitle}</span> — drag a row by the handle, or use the
            arrows. First in the list is first in the slideshow.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
          <ol className="space-y-2">
            {ordered.map((card, i) => (
              <li
                key={card.id}
                draggable={!busy}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", String(i));
                  e.dataTransfer.effectAllowed = "move";
                  setDraggingIndex(i);
                }}
                onDragEnd={() => {
                  setDraggingIndex(null);
                  setDragOverIndex(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverIndex(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const raw = e.dataTransfer.getData("text/plain");
                  const from = parseInt(raw, 10);
                  if (Number.isNaN(from) || from === i) {
                    setDragOverIndex(null);
                    return;
                  }
                  setOrdered((prev) => reorderArray(prev, from, i));
                  setDragOverIndex(null);
                  setDraggingIndex(null);
                }}
                className={`flex items-center gap-2 rounded-xl border bg-[#fffafc] px-2 py-2 shadow-sm transition ${
                  dragOverIndex === i && draggingIndex !== null && draggingIndex !== i
                    ? "border-pink-400 ring-2 ring-pink-200"
                    : "border-pink-100/90"
                } ${draggingIndex === i ? "opacity-60" : ""} ${busy ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"}`}
              >
                <span
                  className="flex shrink-0 cursor-grab select-none flex-col gap-0.5 px-1 text-pink-300 active:cursor-grabbing"
                  aria-hidden
                  title="Drag to reorder"
                >
                  <span className="block leading-none">⋮</span>
                  <span className="block leading-none">⋮</span>
                </span>
                <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-neutral-400">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">{tileLabel(card)}</p>
                  {(card.definition || card.phonetic_reading) && (
                    <p className="truncate text-xs text-neutral-500">{card.definition ?? card.phonetic_reading}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-0.5">
                  <button
                    type="button"
                    disabled={i === 0 || busy}
                    onClick={() => move(i, -1)}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-pink-100 bg-white text-sm font-semibold text-pink-700 hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-35"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={i === ordered.length - 1 || busy}
                    onClick={() => move(i, 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-pink-100 bg-white text-sm font-semibold text-pink-700 hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-35"
                    title="Move down"
                  >
                    ↓
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {error && (
          <p className="border-t border-pink-100 px-5 py-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-pink-100 px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save order"}
          </button>
        </div>
      </div>
    </div>
  );
}
