"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { AddCardForm } from "@/components/AddCardForm";
import { BulkEditFlashcardsModal } from "@/components/BulkEditFlashcardsModal";
import { CollectionSetCard } from "@/components/CollectionSetCard";
import { EditFlashcardModal } from "@/components/EditFlashcardModal";
import { ImportFlashcards } from "@/components/ImportFlashcards";
import { NewCollectionButton } from "@/components/NewCollectionButton";
import { PresentFlashcards } from "@/components/PresentFlashcards";
import { RenameCollectionModal } from "@/components/RenameCollectionModal";
import { ReorderCardsModal } from "@/components/ReorderCardsModal";
import { WorkspaceDocumentsSection } from "@/components/WorkspaceDocumentsSection";
import {
  deleteFlashcards,
  listCardSets,
  listFlashcardsInSet,
  reorderFlashcardsInSet,
  usingLocalStorage,
} from "@/lib/flashcards-repo";
import type { CardSetRow, FlashcardRow } from "@/lib/types";

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

type WorkspaceArea = "documents" | "flashcards";

export default function HomePage() {
  const [workspaceArea, setWorkspaceArea] = useState<WorkspaceArea>("flashcards");
  const [sets, setSets] = useState<CardSetRow[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [cards, setCards] = useState<FlashcardRow[]>([]);
  const [presentIndex, setPresentIndex] = useState(0);
  const [presentOpen, setPresentOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<FlashcardRow | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [loaded, setLoaded] = useState(false);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [reorderModalOpen, setReorderModalOpen] = useState(false);
  const [renamingCollection, setRenamingCollection] = useState<CardSetRow | null>(null);

  const selectedCount = selectedIds.size;
  const allSelected = cards.length > 0 && selectedCount === cards.length;

  const refresh = useCallback(async () => {
    const list = await listCardSets();
    setSets(list);
    setLoaded(true);
  }, []);

  const reloadCardsForActiveSet = useCallback(async () => {
    if (!activeSetId) return;
    const data = await listFlashcardsInSet(activeSetId);
    setCards(data);
  }, [activeSetId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (workspaceArea === "documents") setPresentOpen(false);
  }, [workspaceArea]);

  useLayoutEffect(() => {
    if (!activeSetId) {
      setCards([]);
      setCardsLoading(false);
      return;
    }
    setCards([]);
  }, [activeSetId]);

  useEffect(() => {
    if (!activeSetId) return;
    let cancelled = false;
    setCardsLoading(true);
    listFlashcardsInSet(activeSetId)
      .then((data) => {
        if (!cancelled) {
          setCards(data);
          setCardsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCards([]);
          setCardsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeSetId]);

  useEffect(() => {
    if (!presentOpen) return;
    if (cards.length === 0) {
      setPresentOpen(false);
      return;
    }
    setPresentIndex((i) => (i >= cards.length ? cards.length - 1 : i));
  }, [cards.length, presentOpen]);

  useEffect(() => {
    setSelectedIds(new Set());
    setReorderModalOpen(false);
    setRenamingCollection(null);
  }, [activeSetId]);

  useEffect(() => {
    const valid = new Set(cards.map((c) => c.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
        else changed = true;
      });
      return changed || next.size !== prev.size ? next : prev;
    });
  }, [cards]);

  const openAt = (i: number) => {
    setPresentIndex(i);
    setPresentOpen(true);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(cards.map((c) => c.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const deleteSelected = async () => {
    if (selectedCount === 0) return;
    const msg = `Delete ${selectedCount} card${selectedCount === 1 ? "" : "s"}? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    try {
      await deleteFlashcards([...selectedIds]);
      setSelectedIds(new Set());
      void refresh();
      void reloadCardsForActiveSet();
      setEditingCard(null);
    } catch {
      window.alert("Could not delete selected cards.");
    }
  };

  const applyCardOrder = useCallback(
    async (nextOrder: FlashcardRow[]) => {
      if (!activeSetId || nextOrder.length === 0) return;
      const withPos = nextOrder.map((c, position) => ({ ...c, position }));
      const prev = cards;
      setCards(withPos);
      setReorderSaving(true);
      try {
        await reorderFlashcardsInSet(
          activeSetId,
          withPos.map((c) => c.id)
        );
        void refresh();
      } catch {
        setCards(prev);
        throw new Error("Could not save card order.");
      } finally {
        setReorderSaving(false);
      }
    },
    [activeSetId, cards]
  );

  const activeSetName = sets.find((s) => s.id === activeSetId)?.name;
  const canReorderCards = Boolean(activeSetId && cards.length > 0 && !cardsLoading && loaded);

  return (
    <div className="min-h-screen bg-transparent">
      <main className="mx-auto max-w-6xl px-4 py-8 pb-16 sm:px-6 sm:py-12 sm:pb-20">
        <header className="mb-8 space-y-5 sm:mb-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-pink-500/90">Study</p>
              <h1 className="mt-1 bg-gradient-to-r from-pink-600 to-rose-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
                My Workspace
              </h1>
              {usingLocalStorage() && loaded && (
                <p className="mt-3 text-xs text-amber-700">
                  Supabase env not set — data stays in this browser only. Add{" "}
                  <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                  <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to sync with the cloud.
                </p>
              )}
            </div>
            {workspaceArea === "flashcards" && (
              <div className="flex flex-wrap items-center gap-2.5">
                <NewCollectionButton
                  onCreated={(id) => {
                    void refresh();
                    setActiveSetId(id);
                  }}
                />
                <ImportFlashcards
                  onImported={(newSetId) => {
                    void refresh();
                    if (newSetId) setActiveSetId(newSetId);
                  }}
                />
              </div>
            )}
          </div>

          <nav className="flex gap-1 border-b border-pink-100/90" aria-label="Workspace areas">
            <button
              type="button"
              onClick={() => setWorkspaceArea("documents")}
              className={`relative -mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                workspaceArea === "documents"
                  ? "border-pink-600 text-pink-700"
                  : "border-transparent text-neutral-500 hover:text-pink-600"
              }`}
            >
              Documents
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceArea("flashcards")}
              className={`relative -mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                workspaceArea === "flashcards"
                  ? "border-pink-600 text-pink-700"
                  : "border-transparent text-neutral-500 hover:text-pink-600"
              }`}
            >
              Flashcards
            </button>
          </nav>
        </header>

        {workspaceArea === "documents" ? (
          <WorkspaceDocumentsSection />
        ) : (
          <>
        {activeSetId && (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <nav
                className="inline-flex max-w-full min-w-0 flex-1 flex-wrap items-center gap-2 rounded-full border border-pink-100/90 bg-white/90 px-1 py-1 text-sm shadow-sm shadow-pink-100/50 backdrop-blur-sm"
                aria-label="Breadcrumb"
              >
                <button
                  type="button"
                  onClick={() => setActiveSetId(null)}
                  className="rounded-full px-3 py-1.5 font-medium text-pink-700 transition hover:bg-pink-50"
                >
                  ← All sets
                </button>
                <span className="text-pink-200" aria-hidden>
                  /
                </span>
                <span className="min-w-0 truncate px-2 font-semibold text-neutral-900">{activeSetName}</span>
                <button
                  type="button"
                  onClick={() => {
                    const row = sets.find((x) => x.id === activeSetId);
                    if (row) setRenamingCollection(row);
                  }}
                  className="shrink-0 rounded-full p-1.5 text-pink-500 transition hover:bg-pink-50 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
                  title="Rename collection"
                  aria-label="Rename collection"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                    />
                  </svg>
                </button>
              </nav>
              <button
                type="button"
                disabled={!canReorderCards || reorderSaving}
                onClick={() => setReorderModalOpen(true)}
                title={
                  cards.length === 0
                    ? "Add at least one card to reorder"
                    : cardsLoading
                      ? "Loading cards…"
                      : "Drag or move cards to change slideshow order"
                }
                className="shrink-0 rounded-xl border border-pink-200/90 bg-white px-4 py-2.5 text-sm font-semibold text-pink-700 shadow-md shadow-pink-100/40 transition hover:border-pink-300 hover:bg-pink-50/90 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Reorder cards
              </button>
            </div>
            <div className="mb-8">
              {!cardsLoading && (
                <AddCardForm
                  key={activeSetId}
                  setId={activeSetId}
                  defaultExpanded={cards.length === 0}
                  onAdded={() => {
                    void refresh();
                    void reloadCardsForActiveSet();
                  }}
                />
              )}
              {cardsLoading && (
                <div className="flex items-center gap-2 rounded-2xl border border-pink-100/80 bg-white/90 px-4 py-4 text-sm text-neutral-500 shadow-sm">
                  <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-pink-200" aria-hidden />
                  Loading cards…
                </div>
              )}
            </div>
          </>
        )}

        {!loaded ? (
          <div className="flex items-center gap-2 text-neutral-500">
            <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-pink-200" aria-hidden />
            Loading sets…
          </div>
        ) : !activeSetId ? (
          sets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-pink-200/80 bg-white/90 px-6 py-14 text-center shadow-inner shadow-pink-100/30">
              <p className="text-neutral-600">
                No collections yet. Use <strong className="text-neutral-800">New collection</strong> for an empty set, or{" "}
                <strong className="text-neutral-800">Import to a set</strong> for CSV, JSON, or PDF.
              </p>
            </div>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {sets.map((s) => (
                <li key={s.id} className="min-h-[11rem] h-full">
                  <CollectionSetCard
                    collection={s}
                    onOpen={() => setActiveSetId(s.id)}
                    onRename={() => setRenamingCollection(s)}
                  />
                </li>
              ))}
            </ul>
          )
        ) : cardsLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-pink-100/80 bg-white/90 px-6 py-16 text-neutral-500 shadow-inner">
            <span className="inline-block h-5 w-5 animate-pulse rounded-full bg-pink-200" aria-hidden />
            <p className="text-sm">Loading this set…</p>
          </div>
        ) : cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-pink-200/80 bg-white/90 px-6 py-10 text-center shadow-inner">
            <p className="text-neutral-600">
              No cards in this set. Expand <strong className="text-neutral-800">Add a card</strong> above to create your
              first card.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {selectedCount > 0 && (
              <div className="flex flex-col gap-3 rounded-2xl border border-pink-100/90 bg-white/95 px-4 py-3 shadow-sm shadow-pink-100/40 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-neutral-700">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-pink-300 text-pink-600 focus:ring-pink-500"
                      aria-label="Select all cards in this set"
                    />
                    Select all
                  </label>
                  <span className="font-medium text-pink-700" aria-live="polite">
                    {selectedCount} selected
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setBulkEditOpen(true)}
                    className="rounded-lg border border-pink-200 bg-pink-50 px-3 py-1.5 text-xs font-semibold text-pink-800 transition hover:bg-pink-100"
                  >
                    Bulk edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteSelected()}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                  >
                    Delete selected
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
                  >
                    Clear selection
                  </button>
                </div>
              </div>
            )}

            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((card, i) => (
                <li
                  key={card.id}
                  className="group flex gap-3 rounded-2xl border border-pink-100/90 bg-white p-4 shadow-md shadow-pink-100/40 ring-1 ring-pink-50/50 transition hover:-translate-y-0.5 hover:border-pink-200 hover:shadow-lg sm:p-5"
                >
                  <div className="flex shrink-0 pt-0.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(card.id)}
                      onChange={() => toggleSelect(card.id)}
                      className="h-4 w-4 rounded border-pink-300 text-pink-600 focus:ring-pink-500"
                      aria-label={`Select ${tileLabel(card)}`}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <button
                      type="button"
                      onClick={() => openAt(i)}
                      className="flex w-full flex-1 flex-col text-left"
                    >
                      <span className="text-xl font-medium tracking-tight text-neutral-900 line-clamp-2">
                        {tileLabel(card)}
                      </span>
                      {(card.definition || card.phonetic_reading) && (
                        <span className="mt-2 line-clamp-2 text-sm leading-snug text-neutral-500">
                          {card.definition ?? card.phonetic_reading}
                        </span>
                      )}
                      <span className="mt-3 text-xs font-medium text-pink-500/80 opacity-0 transition group-hover:opacity-100">
                        Present →
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCard(card)}
                      className="mt-3 inline-flex self-start rounded-lg border border-pink-100 bg-pink-50/50 px-3 py-1.5 text-xs font-semibold text-pink-700 transition hover:bg-pink-100/80"
                    >
                      Edit
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
          </>
        )}
      </main>

      <PresentFlashcards
        cards={cards}
        index={presentIndex}
        open={presentOpen}
        onClose={() => setPresentOpen(false)}
        onIndexChange={setPresentIndex}
      />

      {editingCard && (
        <EditFlashcardModal
          card={editingCard}
          onClose={() => setEditingCard(null)}
          onSaved={() => {
            void refresh();
            void reloadCardsForActiveSet();
          }}
          onDeleted={() => {
            void refresh();
            void reloadCardsForActiveSet();
            setEditingCard(null);
          }}
        />
      )}

      {bulkEditOpen && selectedCount > 0 && (
        <BulkEditFlashcardsModal
          key={[...selectedIds].sort().join("|")}
          cards={cards.filter((c) => selectedIds.has(c.id))}
          onClose={() => setBulkEditOpen(false)}
          onSaved={() => {
            void refresh();
            void reloadCardsForActiveSet();
            setBulkEditOpen(false);
            setSelectedIds(new Set());
          }}
        />
      )}

      {reorderModalOpen && canReorderCards && (
        <ReorderCardsModal
          key={activeSetId ?? "reorder"}
          cards={cards}
          setTitle={activeSetName ?? "Set"}
          onClose={() => setReorderModalOpen(false)}
          onSaveOrder={applyCardOrder}
        />
      )}

      {renamingCollection && (
        <RenameCollectionModal
          collection={renamingCollection}
          onClose={() => setRenamingCollection(null)}
          onSaved={() => void refresh()}
        />
      )}
    </div>
  );
}
