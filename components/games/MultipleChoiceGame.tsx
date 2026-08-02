"use client";

import { useCallback, useMemo, useState } from "react";
import { shuffleArray } from "@/lib/shuffle-array";
import {
  buildMcQuestion,
  type McDirection,
  type McQuestion,
} from "@/lib/games/flashcard-game-content";
import type { GameSessionResult, PlayableCard } from "@/lib/games/types";
import { GameShell } from "@/components/games/GameShell";
import { GameResults } from "@/components/games/GameResults";

type Props = {
  cards: PlayableCard[];
  setName: string;
  open: boolean;
  onClose: () => void;
};

export function MultipleChoiceGame({ cards, setName, open, onClose }: Props) {
  const [session, setSession] = useState(0);
  const deck = useMemo(() => shuffleArray(cards), [cards, session]);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<McDirection>("jpToEn");
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<GameSessionResult | null>(null);

  const question: McQuestion | null = useMemo(() => {
    const card = deck[index];
    if (!card) return null;
    return buildMcQuestion(card, cards, direction);
  }, [deck, index, cards, direction]);

  const reset = useCallback(() => {
    setIndex(0);
    setCorrect(0);
    setWrong(0);
    setPicked(null);
    setResult(null);
    setSession((s) => s + 1);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const finish = (c: number, w: number) => {
    setResult({
      gameId: "multipleChoice",
      correct: c,
      wrong: w,
      total: deck.length,
    });
  };

  const advance = (nextCorrect: number, nextWrong: number) => {
    if (index + 1 >= deck.length) {
      finish(nextCorrect, nextWrong);
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
  };

  const onPick = (choiceIndex: number) => {
    if (!question || picked !== null || result) return;
    setPicked(choiceIndex);
    const ok = choiceIndex === question.correctIndex;
    const nextCorrect = correct + (ok ? 1 : 0);
    const nextWrong = wrong + (ok ? 0 : 1);
    setCorrect(nextCorrect);
    setWrong(nextWrong);
    window.setTimeout(() => advance(nextCorrect, nextWrong), 700);
  };

  return (
    <GameShell
      open={open}
      onClose={handleClose}
      title="Multiple choice"
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
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={() => {
                if (picked !== null) return;
                setDirection((d) => (d === "jpToEn" ? "enToJp" : "jpToEn"));
              }}
              className="rounded-full border border-pink-200 bg-white px-4 py-1.5 text-xs font-semibold text-pink-700 transition hover:bg-pink-50"
            >
              {direction === "jpToEn" ? "JP → EN" : "EN → JP"} · tap to switch
            </button>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-pink-500">
              {direction === "jpToEn" ? "What does this mean?" : "How do you say…"}
            </p>
            <p
              className={`mt-4 text-3xl font-bold text-neutral-900 sm:text-5xl ${
                direction === "jpToEn"
                  ? "[font-family:ui-sans-serif,'Hiragino_Sans','Hiragino_Kaku_Gothic_ProN','Yu_Gothic_UI','Yu_Gothic',Meiryo,sans-serif]"
                  : ""
              }`}
            >
              {question.prompt}
            </p>
            <div className="mt-10 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              {question.choices.map((choice, i) => {
                const show = picked !== null;
                const isCorrect = i === question.correctIndex;
                const isPicked = i === picked;
                let cls =
                  "border-pink-100 bg-white text-neutral-900 hover:border-pink-300 hover:bg-pink-50/70";
                if (show && isCorrect) {
                  cls = "border-emerald-400 bg-emerald-50 text-emerald-900";
                } else if (show && isPicked && !isCorrect) {
                  cls = "border-rose-400 bg-rose-50 text-rose-900";
                } else if (show) {
                  cls = "border-stone-200 bg-stone-50 text-stone-400";
                }
                return (
                  <button
                    key={`${question.card.id}-${i}-${choice}`}
                    type="button"
                    disabled={picked !== null}
                    onClick={() => onPick(i)}
                    className={`min-h-[3.5rem] rounded-xl border px-4 py-3 text-base font-semibold shadow-sm transition sm:text-lg ${cls} ${
                      direction === "enToJp"
                        ? "[font-family:ui-sans-serif,'Hiragino_Sans','Hiragino_Kaku_Gothic_ProN','Yu_Gothic_UI','Yu_Gothic',Meiryo,sans-serif]"
                        : ""
                    }`}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </GameShell>
  );
}
