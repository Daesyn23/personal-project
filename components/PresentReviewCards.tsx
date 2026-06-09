"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewItemRow } from "@/lib/types";
import { cancelSpeechSynthesis } from "@/lib/japanese-tts";
import { updateReviewItem } from "@/lib/review-repo";
import {
  ReviewCardSlide,
  type ReviewCardPhase,
  type ReviewCardSlideHandle,
} from "@/components/ReviewCardSlide";
import { ReviewStarIcon } from "@/components/ReviewStarIcon";

type Props = {
  items: ReviewItemRow[];
  index: number;
  open: boolean;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  onItemUpdate: (item: ReviewItemRow) => void;
  onScramble?: () => void;
};

type CardAnim =
  | "idle"
  | "exit-next"
  | "exit-prev"
  | "enter-next"
  | "enter-prev";

const EXIT_MS = 320;
const ENTER_MS = 400;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function BackArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l-4-4m0 0l4-4m-4 4h18" />
    </svg>
  );
}

function ForwardArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function ScrambleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h13M3 12h9M3 17h5M16 7l4 4-4 4M20 11H9" />
    </svg>
  );
}

function animClass(state: CardAnim): string {
  switch (state) {
    case "exit-next":
      return "review-card-exit-left";
    case "exit-prev":
      return "review-card-exit-right";
    case "enter-next":
      return "review-card-enter-right";
    case "enter-prev":
      return "review-card-enter-left";
    default:
      return "";
  }
}

export function PresentReviewCards({
  items,
  index,
  open,
  onClose,
  onIndexChange,
  onItemUpdate,
  onScramble,
}: Props) {
  const item = items[index];
  const slideRef = useRef<ReviewCardSlideHandle>(null);
  const [phase, setPhase] = useState<ReviewCardPhase>("front");
  const [cardAnim, setCardAnim] = useState<CardAnim>("idle");
  /** Locks flip to front while sliding between cards so the next kanji never flashes. */
  const [forceFront, setForceFront] = useState(false);
  const transitioningRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }, []);

  useEffect(() => {
    if (open) {
      setPhase("front");
      setForceFront(false);
      setCardAnim("idle");
    }
  }, [open]);

  useEffect(() => {
    if (open && items.length === 0) onClose();
  }, [open, items.length, onClose]);

  useEffect(() => {
    if (!open) cancelSpeechSynthesis();
  }, [open]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const goToCard = useCallback(
    (newIndex: number, direction: "next" | "prev") => {
      if (transitioningRef.current) return;
      if (newIndex < 0 || newIndex >= items.length) return;

      cancelSpeechSynthesis();

      if (prefersReducedMotion()) {
        setForceFront(true);
        setPhase("front");
        onIndexChange(newIndex);
        setCardAnim("idle");
        setForceFront(false);
        return;
      }

      transitioningRef.current = true;
      setForceFront(true);
      setPhase("front");
      setCardAnim(direction === "next" ? "exit-next" : "exit-prev");

      const exitTimer = window.setTimeout(() => {
        onIndexChange(newIndex);
        setCardAnim(direction === "next" ? "enter-next" : "enter-prev");

        const enterTimer = window.setTimeout(() => {
          setCardAnim("idle");
          setForceFront(false);
          transitioningRef.current = false;
        }, ENTER_MS);
        timersRef.current.push(enterTimer);
      }, EXIT_MS);
      timersRef.current.push(exitTimer);
    },
    [items.length, onIndexChange]
  );

  const canGoBack = phase === "back" || index > 0;
  const isTransitioning = cardAnim !== "idle";

  const advance = useCallback(() => {
    const n = items.length;
    if (n === 0 || !item || isTransitioning) return;
    if (phase === "front") {
      setPhase("back");
      return;
    }
    if (index + 1 < n) {
      goToCard(index + 1, "next");
    }
  }, [items.length, item, index, phase, goToCard, isTransitioning]);

  const back = useCallback(() => {
    const n = items.length;
    if (n === 0 || !item || isTransitioning) return;
    if (phase === "back") {
      setPhase("front");
      return;
    }
    if (index > 0) {
      goToCard(index - 1, "prev");
    }
  }, [items.length, item, index, phase, goToCard, isTransitioning]);

  const handleStarChange = useCallback(
    async (starred: boolean) => {
      if (!item) return;
      const updated = { ...item, starred };
      onItemUpdate(updated);
      try {
        await updateReviewItem(item.id, { starred });
      } catch {
        onItemUpdate(item);
      }
    },
    [item, onItemUpdate]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;

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

  if (!open || !item) return null;

  const starredCount = items.filter((i) => i.starred).length;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-100"
      role="dialog"
      aria-modal="true"
      aria-label="Review cards"
    >
      <header className="relative flex items-center justify-center px-4 py-4 sm:py-5">
        <button
          type="button"
          onClick={onClose}
          className="absolute left-4 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-700"
          aria-label="Close review"
        >
          <CloseIcon className="h-6 w-6" />
        </button>
        <span className="text-sm font-medium tabular-nums text-slate-600">
          {index + 1} / {items.length}
        </span>
        <span
          className={`absolute left-14 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full px-1.5 py-1 ${
            starredCount > 0 ? "text-amber-500" : "text-slate-400"
          }`}
          title="Starred cards in this folder"
        >
          <ReviewStarIcon className="h-5 w-5" filled={starredCount > 0} />
          <span className="text-xs font-bold tabular-nums">{starredCount}</span>
        </span>
        {onScramble && items.length > 1 && (
          <button
            type="button"
            onClick={onScramble}
            disabled={isTransitioning}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-700 disabled:opacity-40"
            aria-label="Scramble cards"
            title="Shuffle all cards and save the new order"
          >
            <ScrambleIcon className="h-6 w-6" />
          </button>
        )}
      </header>

      <div className="flex flex-1 items-center justify-center px-4 pb-4 sm:px-8">
        <div className={`w-full max-w-lg will-change-transform ${animClass(cardAnim)}`}>
          <ReviewCardSlide
            ref={slideRef}
            item={item}
            phase={phase}
            forceFront={forceFront}
            onStarChange={(starred) => void handleStarChange(starred)}
          />
        </div>
      </div>

      <footer className="flex items-center justify-between px-6 pb-8 pt-2 sm:px-10 sm:pb-10">
        <button
          type="button"
          onClick={back}
          disabled={!canGoBack || isTransitioning}
          className="rounded-full p-3 text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Previous"
        >
          <BackArrowIcon className="h-8 w-8" />
        </button>
        <button
          type="button"
          onClick={advance}
          disabled={isTransitioning || (phase === "back" && index >= items.length - 1)}
          className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-3 text-white shadow-md shadow-pink-300/40 transition hover:from-pink-600 hover:to-rose-600 disabled:opacity-30"
          aria-label={phase === "front" ? "Show kanji" : "Next card"}
        >
          <ForwardArrowIcon className="h-8 w-8" />
        </button>
      </footer>
    </div>
  );
}
