"use client";

import { useCallback, useMemo, useState } from "react";
import { shuffleArray } from "@/lib/shuffle-array";
import { buildTrueFalseQuestion, type TrueFalseQuestion } from "@/lib/games/flashcard-game-content";
import type { GameSessionResult, PlayableCard } from "@/lib/games/types";
import { GameShell } from "@/components/games/GameShell";
import { GameResults } from "@/components/games/GameResults";

type Props = {
  cards: PlayableCard[];
  setName: string;
  open: boolean;
  onClose: () => void;
};

export function TrueFalseGame({ cards, setName, open, onClose }: Props) {
  const [session, setSession] = useState(0);
  const deck = useMemo(() => shuffleArray(cards), [cards, session]);
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [feedback, setFeedback] = useState<"idle" | "correct" | "wrong">("idle");
  const [result, setResult] = useState<GameSessionResult | null>(null);

  const question: TrueFalseQuestion | null = useMemo(() => {
    const card = deck[index];
    if (!card) return null;
    return buildTrueFalseQuestion(card, cards);
  }, [deck, index, cards, session]);

  const reset = useCallback(() => {
    setIndex(0);
    setCorrect(0);
    setWrong(0);
    setFeedback("idle");
    setResult(null);
    setSession((s) => s + 1);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const advance = (nextCorrect: number, nextWrong: number) => {
    if (index + 1 >= deck.length) {
      setResult({
        gameId: "trueFalse",
        correct: nextCorrect,
        wrong: nextWrong,
        total: deck.length,
      });
      return;
    }
    setIndex((i) => i + 1);
    setFeedback("idle");
  };

  const answer = (saysTrue: boolean) => {
    if (!question || feedback !== "idle" || result) return;
    const ok = saysTrue === question.isTrue;
    const nextCorrect = correct + (ok ? 1 : 0);
    const nextWrong = wrong + (ok ? 0 : 1);
    setCorrect(nextCorrect);
    setWrong(nextWrong);
    setFeedback(ok ? "correct" : "wrong");
    window.setTimeout(() => advance(nextCorrect, nextWrong), 900);
  };

  return (
    <GameShell
      open={open}
      onClose={handleClose}
      title="True or false"
      subtitle={setName}
      status={
        result ? null : (
          <span>
            {index + 1} / {deck.length} · {correct}✓
          </span>
        )
      }
    >
      {result ? (
        <GameResults result={result} onReplay={reset} onExit={handleClose} />
      ) : question ? (
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-pink-500">
            Do these match?
          </p>
          <p className="mt-6 text-4xl font-bold text-neutral-900 [font-family:ui-sans-serif,'Hiragino_Sans','Hiragino_Kaku_Gothic_ProN','Yu_Gothic_UI','Yu_Gothic',Meiryo,sans-serif] sm:text-5xl">
            {question.card.jp}
          </p>
          <p className="mt-4 text-2xl font-semibold text-neutral-700 sm:text-3xl">
            {question.shownEn}
          </p>
          {feedback !== "idle" ? (
            <p
              className={`mt-6 text-sm font-semibold ${
                feedback === "correct" ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {feedback === "correct"
                ? "Correct!"
                : question.isTrue
                  ? "They do match."
                  : `Actually: ${question.card.en}`}
            </p>
          ) : null}
          <div className="mt-10 grid w-full max-w-md grid-cols-2 gap-4">
            <button
              type="button"
              disabled={feedback !== "idle"}
              onClick={() => answer(true)}
              className={`min-h-[4.5rem] rounded-2xl border text-xl font-bold shadow-sm transition sm:text-2xl ${
                feedback === "idle"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  : feedback === "correct" && question.isTrue
                    ? "border-emerald-400 bg-emerald-100 text-emerald-900"
                    : feedback === "wrong" && question.isTrue
                      ? "border-emerald-300 bg-emerald-50/80 text-emerald-800"
                      : "border-stone-200 bg-stone-50 text-stone-400"
              }`}
            >
              True
            </button>
            <button
              type="button"
              disabled={feedback !== "idle"}
              onClick={() => answer(false)}
              className={`min-h-[4.5rem] rounded-2xl border text-xl font-bold shadow-sm transition sm:text-2xl ${
                feedback === "idle"
                  ? "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                  : feedback === "correct" && !question.isTrue
                    ? "border-rose-400 bg-rose-100 text-rose-900"
                    : feedback === "wrong" && !question.isTrue
                      ? "border-rose-300 bg-rose-50/80 text-rose-800"
                      : "border-stone-200 bg-stone-50 text-stone-400"
              }`}
            >
              False
            </button>
          </div>
        </div>
      ) : null}
    </GameShell>
  );
}
