"use client";

import { useCallback, useEffect, useState } from "react";
import type { FlashcardRow } from "@/lib/types";
import { FlashcardSlide } from "@/components/FlashcardSlide";
import {
  hasDetailPhase,
  type PresentationPhase,
} from "@/components/presentation-phase";

type Props = {
  cards: FlashcardRow[];
  index: number;
  open: boolean;
  onClose: () => void;
  onIndexChange: (i: number) => void;
};

export function PresentFlashcards({
  cards,
  index,
  open,
  onClose,
  onIndexChange,
}: Props) {
  const card = cards[index];
  const [phase, setPhase] = useState<PresentationPhase>("word");

  useEffect(() => {
    if (open) setPhase("word");
  }, [open]);

  useEffect(() => {
    if (open && cards.length === 0) onClose();
  }, [open, cards.length, onClose]);

  const advance = useCallback(() => {
    const n = cards.length;
    if (n === 0 || !card) return;
    if (phase === "word" && hasDetailPhase(card)) {
      setPhase("detail");
      return;
    }
    onIndexChange((index + 1) % n);
    setPhase("word");
  }, [cards.length, card, index, onIndexChange, phase]);

  const back = useCallback(() => {
    const n = cards.length;
    if (n === 0 || !card) return;
    if (phase === "detail") {
      setPhase("word");
      return;
    }
    const pi = (index - 1 + n) % n;
    onIndexChange(pi);
    const prevCard = cards[pi];
    setPhase(hasDetailPhase(prevCard) ? "detail" : "word");
  }, [cards, card, index, onIndexChange, phase]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        advance();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, advance, back, onClose]);

  if (!open || !card) return null;

  const phaseLabel =
    phase === "word"
      ? "Kana · Romaji · context"
      : "Kana · Romaji · context · example";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#fffafc]/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Presentation"
    >
      <header className="flex items-center justify-between gap-3 border-b border-pink-100 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-pink-600 hover:bg-pink-50"
        >
          Close
        </button>
        <span className="text-center text-sm text-neutral-500">
          <span className="block">
            Card {index + 1} / {cards.length}
          </span>
          <span className="text-xs text-pink-600">{phaseLabel}</span>
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={back}
            className="rounded-lg border border-pink-200 bg-white px-3 py-1.5 text-sm text-pink-700 hover:bg-pink-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={advance}
            className="rounded-lg bg-pink-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-600"
          >
            {phase === "word" && hasDetailPhase(card) ? "Next slide" : "Next card"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        <div
          key={`${card.id}-${phase}`}
          className="flashcard-enter w-full max-w-3xl"
        >
          <FlashcardSlide card={card} phase={phase} />
        </div>
      </div>
    </div>
  );
}
