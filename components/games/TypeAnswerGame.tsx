"use client";

import { useCallback, useMemo, useState } from "react";
import { shuffleArray } from "@/lib/shuffle-array";
import { answersMatch } from "@/lib/games/answer-normalize";
import type { GameSessionResult, PlayableCard } from "@/lib/games/types";
import { GameShell } from "@/components/games/GameShell";
import { GameResults } from "@/components/games/GameResults";

type Props = {
  cards: PlayableCard[];
  setName: string;
  open: boolean;
  onClose: () => void;
};

export function TypeAnswerGame({ cards, setName, open, onClose }: Props) {
  const [session, setSession] = useState(0);
  const deck = useMemo(() => shuffleArray(cards), [cards, session]);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [feedback, setFeedback] = useState<"idle" | "correct" | "wrong">("idle");
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [result, setResult] = useState<GameSessionResult | null>(null);

  const card = deck[index] ?? null;

  const reset = useCallback(() => {
    setIndex(0);
    setValue("");
    setFeedback("idle");
    setCorrect(0);
    setWrong(0);
    setResult(null);
    setSession((s) => s + 1);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const goNext = (nextCorrect: number, nextWrong: number) => {
    if (index + 1 >= deck.length) {
      setResult({
        gameId: "typeAnswer",
        correct: nextCorrect,
        wrong: nextWrong,
        total: deck.length,
      });
      return;
    }
    setIndex((i) => i + 1);
    setValue("");
    setFeedback("idle");
  };

  const check = () => {
    if (!card || feedback !== "idle") return;
    const expected = card.reading || card.jp;
    const ok =
      answersMatch(value, expected) ||
      answersMatch(value, card.jp) ||
      (card.reading !== card.jp && answersMatch(value, card.reading));
    if (ok) {
      const nextCorrect = correct + 1;
      setCorrect(nextCorrect);
      setFeedback("correct");
      window.setTimeout(() => goNext(nextCorrect, wrong), 800);
    } else {
      const nextWrong = wrong + 1;
      setWrong(nextWrong);
      setFeedback("wrong");
    }
  };

  return (
    <GameShell
      open={open}
      onClose={handleClose}
      title="Type the answer"
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
      ) : card ? (
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-pink-500">
            Type the Japanese reading
          </p>
          <p className="mt-4 text-3xl font-bold text-neutral-900 sm:text-4xl">{card.en}</p>
          {card.jp !== card.reading ? (
            <p className="mt-2 text-sm text-neutral-400">(hint after a miss: kanji form exists)</p>
          ) : null}

          <form
            className="mt-10 w-full"
            onSubmit={(e) => {
              e.preventDefault();
              if (feedback === "wrong") {
                goNext(correct, wrong);
                return;
              }
              check();
            }}
          >
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={feedback === "correct"}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder="ひらがな / kana"
              className={`w-full rounded-2xl border bg-white px-5 py-4 text-center text-2xl outline-none ring-pink-300 transition focus:ring-2 [font-family:ui-sans-serif,'Hiragino_Sans','Hiragino_Kaku_Gothic_ProN','Yu_Gothic_UI','Yu_Gothic',Meiryo,sans-serif] ${
                feedback === "correct"
                  ? "border-emerald-400 bg-emerald-50"
                  : feedback === "wrong"
                    ? "border-rose-400 bg-rose-50"
                    : "border-pink-200"
              }`}
            />
            {feedback === "wrong" ? (
              <p className="mt-3 text-sm text-rose-700">
                Answer:{" "}
                <span className="font-semibold [font-family:ui-sans-serif,'Hiragino_Sans','Hiragino_Kaku_Gothic_ProN','Yu_Gothic_UI','Yu_Gothic',Meiryo,sans-serif]">
                  {card.reading}
                  {card.jp !== card.reading ? ` (${card.jp})` : ""}
                </span>
              </p>
            ) : feedback === "correct" ? (
              <p className="mt-3 text-sm font-semibold text-emerald-700">Correct!</p>
            ) : null}
            <button
              type="submit"
              className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-6 text-sm font-bold text-white shadow-md shadow-pink-300/35 transition hover:brightness-[1.05]"
            >
              {feedback === "wrong" ? "Next" : "Check"}
            </button>
          </form>
        </div>
      ) : null}
    </GameShell>
  );
}
