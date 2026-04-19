"use client";

import { useState } from "react";
import { createCardSet } from "@/lib/flashcards-repo";

type Props = {
  onCreated: (setId: string) => void;
};

export function NewCollectionButton({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setName("");
    setError(null);
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name for this collection.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await createCardSet(trimmed);
      close();
      onCreated(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create collection");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="rounded-xl border border-pink-200/90 bg-white px-4 py-2.5 text-sm font-semibold text-pink-700 shadow-md shadow-pink-100/40 transition hover:border-pink-300 hover:bg-pink-50/90 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
      >
        New collection
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-collection-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-pink-100">
            <h2 id="new-collection-title" className="text-lg font-semibold text-neutral-900">
              New collection
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Create an empty set, then add cards from the set page.
            </p>
            <label className="mt-4 block text-sm font-medium text-neutral-700" htmlFor="new-collection-name">
              Name
            </label>
            <input
              id="new-collection-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Week 3 vocabulary"
              className="mt-1 w-full rounded-lg border border-pink-200 bg-[#fffafc] px-3 py-2 text-sm outline-none ring-pink-300 focus:ring-2"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
            {error && (
              <p className="mt-2 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !name.trim()}
                onClick={() => void submit()}
                className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600 disabled:opacity-50"
              >
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
