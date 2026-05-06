"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cancelSpeechSynthesis } from "@/lib/japanese-tts";
import type { FlashcardRow } from "@/lib/types";
import { FlashcardSlide, type FlashcardSlideHandle } from "@/components/FlashcardSlide";
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
  const slideRef = useRef<FlashcardSlideHandle>(null);
  const [phase, setPhase] = useState<PresentationPhase>("word");

  useEffect(() => {
    if (open) setPhase("word");
  }, [open]);

  useEffect(() => {
    if (open && cards.length === 0) onClose();
  }, [open, cards.length, onClose]);

  useEffect(() => {
    if (!open) cancelSpeechSynthesis();
  }, [open]);

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
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;

      // Toggle speech with Ctrl or Shift (same as speaker button)
      if (!e.repeat && (e.key === "Control" || e.key === "Shift")) {
        e.preventDefault();
        slideRef.current?.toggleSpeak();
        return;
      }

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
      ? "Romaji · Kana · context"
      : "Romaji · Kana · context · example";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#fffafc]/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Presentation"
    >
      <header className="grid gap-3 border-b border-pink-100 px-3 py-3 [grid-template-columns:minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-4">
        <button
          type="button"
          onClick={onClose}
          className="col-start-1 row-start-1 justify-self-start rounded-lg px-3 py-1.5 text-sm font-medium text-pink-600 hover:bg-pink-50"
        >
          Close
        </button>
        <div className="col-start-2 row-start-1 flex shrink-0 justify-end gap-2 sm:col-start-3 sm:justify-self-end">
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
        <span className="col-span-full row-start-2 min-w-0 text-center text-sm text-neutral-500 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:px-2">
          <span className="block">
            Card {index + 1} / {cards.length}
          </span>
          <span className="block text-xs text-pink-600">{phaseLabel}</span>
          <span className="mt-1 block text-[11px] text-neutral-400">
            Ctrl or Shift — listen · Space / → next · ← back · Esc close
          </span>
        </span>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-auto p-4 sm:p-6">
        <div
          key={card.id}
          className="flashcard-enter w-full max-w-3xl"
        >
          <FlashcardSlide ref={slideRef} card={card} phase={phase} />
        </div>
      </div>
    </div>
  );
}
