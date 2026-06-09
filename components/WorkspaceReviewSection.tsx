"use client";

import { useCallback, useEffect, useState } from "react";
import { HeadingWithInfo } from "@/components/InfoTip";
import { PresentReviewCards } from "@/components/PresentReviewCards";
import { BulkEditReviewItemsModal } from "@/components/BulkEditReviewItemsModal";
import { ImportReviewItems } from "@/components/ImportReviewItems";
import { ReviewFolderCard } from "@/components/ReviewFolderCard";
import { ReviewStarIcon } from "@/components/ReviewStarIcon";
import {
  createReviewFolder,
  createReviewItem,
  deleteReviewFolder,
  deleteReviewItems,
  listReviewFolders,
  listReviewItemsInFolder,
  reorderReviewItems,
  updateReviewFolderName,
  updateReviewItem,
  usingLocalStorage,
} from "@/lib/review-repo";
import { shuffleArray } from "@/lib/shuffle-array";
import { jpFontClass } from "@/lib/workspace-translation";
import type { ReviewFolderRow, ReviewItemRow } from "@/lib/types";

const inputClass =
  "mt-1 w-full rounded-xl border border-pink-100/90 bg-[#fffafc] px-3 py-2.5 text-sm text-neutral-800 shadow-inner shadow-pink-950/5 outline-none transition placeholder:text-neutral-400 focus:border-pink-300 focus:ring-2 focus:ring-pink-200/60";

const btnSecondary =
  "rounded-xl border border-pink-200/90 bg-white px-3.5 py-2 text-sm font-semibold text-pink-700 shadow-sm shadow-pink-100/30 transition hover:border-pink-300 hover:bg-pink-50/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 disabled:opacity-50";

const btnPrimaryReview =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-pink-300/40 ring-1 ring-pink-400/20 transition hover:from-pink-600 hover:to-rose-600 hover:shadow-lg hover:shadow-pink-300/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 disabled:opacity-50";

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

function NewFolderButton({ onCreated }: { onCreated: (id: string) => void }) {
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
      setError("Enter a folder name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await createReviewFolder(trimmed);
      close();
      onCreated(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create folder");
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
        New folder
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-review-folder-title"
        >
          <div className="w-full min-w-0 max-w-md rounded-2xl bg-white p-5 shadow-xl ring-1 ring-pink-100 sm:p-6">
            <HeadingWithInfo
              align="center"
              infoLabel="New review folder"
              heading={
                <h2 id="new-review-folder-title" className="text-lg font-semibold text-neutral-900">
                  New folder
                </h2>
              }
            >
              Each folder is a deck. Add kanji, hiragana, and English inside it.
            </HeadingWithInfo>
            <label className="mt-4 block text-sm font-medium text-neutral-700" htmlFor="new-review-folder-name">
              Name
            </label>
            <input
              id="new-review-folder-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. N5 Lesson 3"
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
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={close}
                className="w-full rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !name.trim()}
                onClick={() => void submit()}
                className="w-full rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600 disabled:opacity-50 sm:w-auto"
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

function RenameFolderModal({
  folder,
  onClose,
  onSaved,
}: {
  folder: ReviewFolderRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (folder) {
      setName(folder.name);
      setError(null);
    }
  }, [folder]);

  if (!folder) return null;

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateReviewFolderName(folder.id, trimmed);
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
      aria-labelledby="rename-review-folder-title"
    >
      <div className="w-full min-w-0 max-w-md rounded-2xl bg-white shadow-xl ring-1 ring-pink-100">
        <div className="border-b border-pink-100 px-5 py-4">
          <h2 id="rename-review-folder-title" className="text-lg font-semibold text-neutral-900">
            Rename folder
          </h2>
        </div>
        <div className="p-5">
          <label className="block text-xs font-medium text-neutral-600">
            Folder name
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

function EditReviewItemModal({
  item,
  onClose,
  onSaved,
}: {
  item: ReviewItemRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kana, setKana] = useState("");
  const [definition, setDefinition] = useState("");
  const [kanji, setKanji] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setKana(item.kana);
      setDefinition(item.definition);
      setKanji(item.kanji);
      setError(null);
    }
  }, [item]);

  if (!item) return null;

  const save = async () => {
    const k = kana.trim();
    const d = definition.trim();
    const kj = kanji.trim();
    if (!k || !d || !kj) {
      setError("All fields are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateReviewItem(item.id, { kana: k, definition: d, kanji: kj });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-review-item-title"
    >
      <div className="w-full min-w-0 max-w-md rounded-2xl bg-white shadow-xl ring-1 ring-pink-100">
        <div className="border-b border-pink-100 px-5 py-4">
          <h2 id="edit-review-item-title" className="text-lg font-semibold text-neutral-900">
            Edit card
          </h2>
        </div>
        <div className="p-5 space-y-3">
          <label className="block text-xs font-medium text-neutral-600">
            Kanji
            <input
              type="text"
              className={`${inputClass} ${jpFontClass}`}
              value={kanji}
              onChange={(e) => setKanji(e.target.value)}
            />
          </label>
          <label className="block text-xs font-medium text-neutral-600">
            Hiragana
            <input
              type="text"
              className={`${inputClass} ${jpFontClass}`}
              value={kana}
              onChange={(e) => setKana(e.target.value)}
            />
          </label>
          <label className="block text-xs font-medium text-neutral-600">
            English meaning
            <input
              type="text"
              className={inputClass}
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
            />
          </label>
          {error && (
            <p className="text-sm text-red-600" role="alert">
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

export function WorkspaceReviewSection() {
  const [folders, setFolders] = useState<ReviewFolderRow[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [items, setItems] = useState<ReviewItemRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<ReviewFolderRow | null>(null);
  const [editingItem, setEditingItem] = useState<ReviewItemRow | null>(null);
  const [presentOpen, setPresentOpen] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);
  const [presentSessionKey, setPresentSessionKey] = useState(0);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  const [addKana, setAddKana] = useState("");
  const [addDefinition, setAddDefinition] = useState("");
  const [addKanji, setAddKanji] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [scrambleBusy, setScrambleBusy] = useState(false);
  const [addCardOpen, setAddCardOpen] = useState(false);

  const refreshFolders = useCallback(async () => {
    const list = await listReviewFolders();
    setFolders(list);
    setLoaded(true);
  }, []);

  const reloadItems = useCallback(async () => {
    if (!activeFolderId) return;
    const data = await listReviewItemsInFolder(activeFolderId);
    setItems(data);
  }, [activeFolderId]);

  useEffect(() => {
    void refreshFolders();
  }, [refreshFolders]);

  useEffect(() => {
    if (!activeFolderId) {
      setItems([]);
      setItemsLoading(false);
      return;
    }
    let cancelled = false;
    setItemsLoading(true);
    listReviewItemsInFolder(activeFolderId)
      .then((data) => {
        if (!cancelled) {
          setItems(data);
          setAddCardOpen(data.length === 0);
          setItemsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setItemsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeFolderId]);

  useEffect(() => {
    if (!presentOpen) return;
    if (items.length === 0) {
      setPresentOpen(false);
      return;
    }
    setPresentIndex((i) => (i >= items.length ? items.length - 1 : i));
  }, [items.length, presentOpen]);

  const activeFolderName = folders.find((f) => f.id === activeFolderId)?.name;

  const deleteFolder = async (folder: ReviewFolderRow) => {
    const count = folder.item_count ?? 0;
    const msg = `Delete "${folder.name}" and ${count} card${count === 1 ? "" : "s"}? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    try {
      await deleteReviewFolder(folder.id);
      void refreshFolders();
      if (activeFolderId === folder.id) {
        setActiveFolderId(null);
        setPresentOpen(false);
        setEditingItem(null);
      }
    } catch {
      window.alert("Could not delete the folder.");
    }
  };

  const deleteItem = async (item: ReviewItemRow) => {
    const msg = `Delete "${item.kana}"? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    try {
      await deleteReviewItems([item.id]);
      void refreshFolders();
      void reloadItems();
      setEditingItem((e) => (e?.id === item.id ? null : e));
    } catch {
      window.alert("Could not delete the card.");
    }
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFolderId) return;
    setAddBusy(true);
    setAddError(null);
    try {
      await createReviewItem(activeFolderId, {
        kana: addKana,
        definition: addDefinition,
        kanji: addKanji,
      });
      setAddKana("");
      setAddDefinition("");
      setAddKanji("");
      void refreshFolders();
      void reloadItems();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not add card");
    } finally {
      setAddBusy(false);
    }
  };

  const handleItemUpdate = (updated: ReviewItemRow) => {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  };

  const scrambleItems = useCallback(async () => {
    if (!activeFolderId || items.length < 2 || scrambleBusy) return;
    setScrambleBusy(true);
    try {
      const shuffled = shuffleArray(items);
      await reorderReviewItems(activeFolderId, shuffled.map((i) => i.id));
      setItems(shuffled.map((item, position) => ({ ...item, position })));
      setPresentIndex(0);
      setPresentSessionKey((k) => k + 1);
    } catch {
      window.alert("Could not scramble cards.");
    } finally {
      setScrambleBusy(false);
    }
  }, [activeFolderId, items, scrambleBusy]);

  return (
    <div className="min-w-0">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <HeadingWithInfo
          infoLabel="Review"
          heading={<h2 className="text-xl font-semibold text-neutral-900">Review</h2>}
        >
          Flip cards: kanji on the front, hiragana + English on the back. Organize decks in folders.
        </HeadingWithInfo>
        <div className="flex flex-wrap items-center gap-2">
          {!activeFolderId && (
            <NewFolderButton
              onCreated={(id) => {
                void refreshFolders();
                setActiveFolderId(id);
              }}
            />
          )}
          <ImportReviewItems
            folderId={activeFolderId}
            defaultFolderName={activeFolderName}
            onImported={(id) => {
              void refreshFolders();
              setActiveFolderId(id);
              void listReviewItemsInFolder(id).then(setItems);
            }}
          />
        </div>
      </div>

      {usingLocalStorage() && loaded && (
        <p className="mb-4 text-xs text-amber-700">
          Supabase env not set — review data stays in this browser only.
        </p>
      )}

      {activeFolderId && (
        <div className="mb-6 rounded-2xl border border-pink-100/90 bg-white/95 p-3 shadow-md shadow-pink-100/30 ring-1 ring-pink-50/80 sm:p-4">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <nav
              className="inline-flex max-w-full min-w-0 flex-nowrap items-center gap-1 overflow-x-auto text-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Breadcrumb"
            >
              <button
                type="button"
                onClick={() => {
                  setActiveFolderId(null);
                  setPresentOpen(false);
                  setEditingItem(null);
                }}
                className="shrink-0 rounded-lg px-2.5 py-1.5 font-medium text-pink-700 transition hover:bg-pink-50"
              >
                ← All folders
              </button>
              <span className="text-pink-200" aria-hidden>/</span>
              <span className="min-w-0 truncate px-1.5 font-semibold text-neutral-900">{activeFolderName}</span>
              <button
                type="button"
                onClick={() => {
                  const row = folders.find((f) => f.id === activeFolderId);
                  if (row) setRenamingFolder(row);
                }}
                className="shrink-0 rounded-lg p-1.5 text-pink-500 transition hover:bg-pink-50 hover:text-pink-700"
                title="Rename folder"
                aria-label="Rename folder"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  const row = folders.find((f) => f.id === activeFolderId);
                  if (row) void deleteFolder(row);
                }}
                className="shrink-0 rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-50 hover:text-rose-700"
                title="Delete folder"
                aria-label="Delete folder"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                </svg>
              </button>
            </nav>

            {!itemsLoading && items.length > 0 && (
              <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setBulkEditOpen(true)} className={btnSecondary}>
                    Bulk edit
                  </button>
                  {items.length > 1 && (
                    <button
                      type="button"
                      disabled={scrambleBusy}
                      onClick={() => void scrambleItems()}
                      className={btnSecondary}
                      title="Shuffle all cards and save the new order"
                    >
                      {scrambleBusy ? "Scrambling…" : "Scramble"}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPresentIndex(0);
                    setPresentOpen(true);
                  }}
                  className={`${btnPrimaryReview} w-full sm:w-auto`}
                >
                  <PlayIcon className="h-4 w-4 shrink-0 opacity-95" />
                  Start review
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold tabular-nums">
                    {items.length}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeFolderId ? (
        <>
          <section
            className="mb-6 overflow-hidden rounded-2xl border border-pink-100/90 bg-white shadow-md shadow-pink-100/40 ring-1 ring-pink-50"
            aria-label="Add a card"
          >
            <button
              type="button"
              aria-expanded={addCardOpen}
              onClick={() => setAddCardOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-pink-50/40 sm:px-5"
            >
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Add card</h3>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {addCardOpen ? "Hiragana, English, and kanji for a new flip card" : "Expand to add another card"}
                </p>
              </div>
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-50 text-pink-600 transition-transform duration-200 ${
                  addCardOpen ? "rotate-180" : ""
                }`}
                aria-hidden
              >
                <ChevronDownIcon className="h-5 w-5" />
              </span>
            </button>
            {addCardOpen && (
              <form
                onSubmit={(e) => void submitAdd(e)}
                className="border-t border-pink-100 px-4 pb-4 pt-3 sm:px-5 sm:pb-5"
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-xs font-medium text-neutral-600">
                    Kanji
                    <input
                      type="text"
                      className={`${inputClass} ${jpFontClass}`}
                      value={addKanji}
                      onChange={(e) => setAddKanji(e.target.value)}
                      placeholder="悪い"
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Hiragana
                    <input
                      type="text"
                      className={`${inputClass} ${jpFontClass}`}
                      value={addKana}
                      onChange={(e) => setAddKana(e.target.value)}
                      placeholder="わるい"
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    English meaning
                    <input
                      type="text"
                      className={inputClass}
                      value={addDefinition}
                      onChange={(e) => setAddDefinition(e.target.value)}
                      placeholder="bad, inferior"
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={addBusy || !addKana.trim() || !addDefinition.trim() || !addKanji.trim()}
                    className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-pink-600 disabled:opacity-50"
                  >
                    {addBusy ? "Adding…" : "Add card"}
                  </button>
                  {addError && (
                    <p className="text-sm text-red-600" role="alert">
                      {addError}
                    </p>
                  )}
                </div>
              </form>
            )}
          </section>

          {itemsLoading ? (
            <div className="flex items-center gap-2 text-neutral-500">
              <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-pink-200" aria-hidden />
              Loading cards…
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-pink-200/80 bg-white/90 px-6 py-14 text-center shadow-inner shadow-pink-100/30">
              <p className="text-neutral-600">No cards yet. Add kanji, hiragana, and English above.</p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-neutral-700">
                  {items.length} card{items.length === 1 ? "" : "s"}
                </p>
                <p className="text-xs text-neutral-500">Tap a card to edit · order matches review</p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {items.map((item, idx) => (
                  <li
                    key={item.id}
                    className="group flex items-center gap-3 rounded-xl border border-pink-100/90 bg-white p-3.5 shadow-sm shadow-pink-100/20 transition hover:border-pink-200 hover:shadow-md hover:shadow-pink-100/40 sm:p-4"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-xs font-bold tabular-nums text-pink-700 ring-1 ring-pink-100"
                      aria-hidden
                    >
                      {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingItem(item)}
                      className={`min-w-0 flex-1 text-left ${jpFontClass}`}
                    >
                      <p className={`text-lg font-medium leading-snug text-neutral-900 ${jpFontClass}`}>
                        {item.kanji}
                      </p>
                      <p className="mt-1 leading-snug text-neutral-600">
                        {item.kana}
                        <span className="text-neutral-500"> ({item.definition})</span>
                      </p>
                    </button>
                    {item.starred && (
                      <span className="text-amber-500" title="Starred" aria-label="Starred">
                        <ReviewStarIcon className="h-5 w-5" filled />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void deleteItem(item)}
                      className="shrink-0 rounded-lg p-2 text-rose-500 opacity-70 transition hover:bg-rose-50 hover:opacity-100 group-hover:opacity-100"
                      title="Delete"
                      aria-label={`Delete ${item.kanji}`}
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : !loaded ? (
        <div className="flex items-center gap-2 text-neutral-500">
          <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-pink-200" aria-hidden />
          Loading folders…
        </div>
      ) : folders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-pink-200/80 bg-white/90 px-6 py-14 text-center shadow-inner shadow-pink-100/30">
          <p className="text-neutral-600">
            No folders yet. Use <strong className="text-neutral-800">New folder</strong> to create a deck.
          </p>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((f) => (
            <li key={f.id} className="min-h-[11rem] h-full">
              <ReviewFolderCard
                folder={f}
                onOpen={() => setActiveFolderId(f.id)}
                onRename={() => setRenamingFolder(f)}
                onDelete={() => void deleteFolder(f)}
              />
            </li>
          ))}
        </ul>
      )}

      <RenameFolderModal
        folder={renamingFolder}
        onClose={() => setRenamingFolder(null)}
        onSaved={() => void refreshFolders()}
      />

      <EditReviewItemModal
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSaved={() => {
          void refreshFolders();
          void reloadItems();
        }}
      />

      {bulkEditOpen && activeFolderId && items.length > 0 && (
        <BulkEditReviewItemsModal
          items={items}
          onClose={() => setBulkEditOpen(false)}
          onSaved={() => {
            void refreshFolders();
            void reloadItems();
            setPresentOpen(false);
          }}
        />
      )}

      <PresentReviewCards
        key={presentSessionKey}
        items={items}
        index={presentIndex}
        open={presentOpen}
        onClose={() => setPresentOpen(false)}
        onIndexChange={setPresentIndex}
        onItemUpdate={handleItemUpdate}
        onScramble={items.length > 1 && !scrambleBusy ? () => void scrambleItems() : undefined}
      />
    </div>
  );
}
