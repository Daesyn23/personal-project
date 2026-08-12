"use client";

import { useEffect, useState } from "react";
import { HeadingWithInfo } from "@/components/InfoTip";
import { FLASHCARD_SET_LEVELS } from "@/lib/flashcard-set-level";
import { updateCardSetDetails } from "@/lib/flashcards-repo";
import type { CardSetRow, FlashcardSetLevel } from "@/lib/types";

type Props = {
  collection: CardSetRow | null;
  onClose: () => void;
  onSaved: () => void;
};

export function RenameCollectionModal({ collection, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [jlptLevel, setJlptLevel] = useState<FlashcardSetLevel | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (collection) {
      setName(collection.name);
      setJlptLevel(collection.jlpt_level ?? "");
      setError(null);
    }
  }, [collection]);

  if (!collection) return null;

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name.");
      return;
    }
    if (!jlptLevel) {
      setError("Select N5, N4, or N3 for this collection.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateCardSetDetails(collection.id, trimmed, jlptLevel);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-collection-title"
    >
      <div className="w-full min-w-0 max-w-md rounded-2xl bg-white shadow-xl ring-1 ring-pink-100">
        <div className="border-b border-pink-100 px-5 py-4">
          <HeadingWithInfo
            align="center"
            infoLabel="Edit collection"
            heading={
              <h2 id="rename-collection-title" className="text-lg font-semibold text-neutral-900">
                Edit collection
              </h2>
            }
          >
            The name appears in your list; the level tag keeps repeated lesson numbers distinct.
          </HeadingWithInfo>
        </div>
        <div className="p-5">
          <label className="block text-xs font-medium text-neutral-600">
            Collection name
            <input
              type="text"
              className="mt-1.5 w-full rounded-lg border border-pink-100 bg-[#fffafc] px-3 py-2.5 text-sm text-neutral-900"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
              }}
              autoFocus
              maxLength={200}
            />
          </label>
          <label className="mt-4 block text-xs font-medium text-neutral-600">
            JLPT level tag
            <select
              value={jlptLevel}
              onChange={(e) => setJlptLevel(e.target.value as FlashcardSetLevel | "")}
              className="mt-1.5 w-full rounded-lg border border-pink-100 bg-[#fffafc] px-3 py-2.5 text-sm text-neutral-900"
            >
              <option value="">Select a JLPT level</option>
              {FLASHCARD_SET_LEVELS.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">
            The selected level is saved with this collection in the database.
          </p>
          {error && (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
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
            disabled={busy || !jlptLevel}
            onClick={() => void save()}
            className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
