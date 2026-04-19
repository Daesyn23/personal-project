"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { AddCardForm } from "@/components/AddCardForm";
import { EditFlashcardModal } from "@/components/EditFlashcardModal";
import { ImportFlashcards } from "@/components/ImportFlashcards";
import { NewCollectionButton } from "@/components/NewCollectionButton";
import { PresentFlashcards } from "@/components/PresentFlashcards";
import {
  listCardSets,
  listFlashcardsInSet,
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

export default function HomePage() {
  const [sets, setSets] = useState<CardSetRow[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [cards, setCards] = useState<FlashcardRow[]>([]);
  const [presentIndex, setPresentIndex] = useState(0);
  const [presentOpen, setPresentOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<FlashcardRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [cardsLoading, setCardsLoading] = useState(false);

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

  const openAt = (i: number) => {
    setPresentIndex(i);
    setPresentOpen(true);
  };

  const activeSetName = sets.find((s) => s.id === activeSetId)?.name;

  return (
    <div className="min-h-screen bg-transparent">
      <main className="mx-auto max-w-6xl px-4 py-8 pb-16 sm:px-6 sm:py-12 sm:pb-20">
        <header className="mb-8 flex flex-col gap-6 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-pink-500/90">Study</p>
            <h1 className="mt-1 bg-gradient-to-r from-pink-600 to-rose-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
              Flashcard Presentation
            </h1>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-neutral-600">
              Organize cards into <strong className="font-semibold text-neutral-800">sets</strong>. Open a set, then tap a
              card to present full screen.
            </p>
            {usingLocalStorage() && loaded && (
              <p className="mt-2 text-xs text-amber-700">
                Supabase env not set — data stays in this browser only. Add{" "}
                <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to sync with the cloud.
              </p>
            )}
          </div>
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
        </header>

        {activeSetId && (
          <>
            <nav
              className="mb-6 inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-pink-100/90 bg-white/90 px-1 py-1 text-sm shadow-sm shadow-pink-100/50 backdrop-blur-sm"
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
              <span className="truncate px-2 font-semibold text-neutral-900">{activeSetName}</span>
            </nav>
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
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sets.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setActiveSetId(s.id)}
                    className="group flex h-full w-full flex-col rounded-2xl border border-pink-100/90 bg-white p-5 text-left shadow-md shadow-pink-100/40 ring-1 ring-pink-50/50 transition hover:-translate-y-0.5 hover:border-pink-200 hover:shadow-lg hover:shadow-pink-200/30"
                  >
                    <span className="text-lg font-semibold tracking-tight text-neutral-900 line-clamp-2 group-hover:text-pink-700">
                      {s.name}
                    </span>
                    <span className="mt-3 text-sm text-neutral-500">
                      {s.card_count ?? 0} card{(s.card_count ?? 0) === 1 ? "" : "s"}
                    </span>
                  </button>
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
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card, i) => (
              <li
                key={card.id}
                className="group flex flex-col rounded-2xl border border-pink-100/90 bg-white p-5 shadow-md shadow-pink-100/40 ring-1 ring-pink-50/50 transition hover:-translate-y-0.5 hover:border-pink-200 hover:shadow-lg"
              >
                <button
                  type="button"
                  onClick={() => openAt(i)}
                  className="flex w-full flex-1 flex-col text-left"
                >
                  <span className="text-xl font-medium tracking-tight text-neutral-900 line-clamp-2">{tileLabel(card)}</span>
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
              </li>
            ))}
          </ul>
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
    </div>
  );
}
