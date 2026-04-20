"use client";

import { useEffect, useState } from "react";
import { updateCardSetName } from "@/lib/flashcards-repo";
import type { CardSetRow } from "@/lib/types";

type Props = {
  collection: CardSetRow | null;
  onClose: () => void;
  onSaved: () => void;
};

export function RenameCollectionModal({ collection, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (collection) {
      setName(collection.name);
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
    setBusy(true);
    setError(null);
    try {
      await updateCardSetName(collection.id, trimmed);
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
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-collection-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl ring-1 ring-pink-100">
        <div className="border-b border-pink-100 px-5 py-4">
          <h2 id="rename-collection-title" className="text-lg font-semibold text-neutral-900">
            Rename collection
          </h2>
          <p className="mt-1 text-sm text-neutral-500">This name appears in your list and breadcrumb.</p>
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
            disabled={busy}
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
