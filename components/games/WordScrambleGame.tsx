"use client";

import { useCallback, useMemo, useState } from "react";
import { shuffleArray } from "@/lib/shuffle-array";
import { answersMatch } from "@/lib/games/answer-normalize";
import { scrambleChars, splitJpChars } from "@/lib/games/flashcard-game-content";
import type { GameSessionResult, PlayableCard } from "@/lib/games/types";
import { GameShell } from "@/components/games/GameShell";
import { GameResults } from "@/components/games/GameResults";

type Tile = { id: string; char: string };

type Props = {
  cards: PlayableCard[];
  setName: string;
  open: boolean;
  onClose: () => void;
};

function buildTiles(word: string, salt: number): Tile[] {
  const chars = scrambleChars(splitJpChars(word));
  return chars.map((char, i) => ({ id: `${salt}-${i}-${char}`, char }));
}

export function WordScrambleGame({ cards, setName, open, onClose }: Props) {
  const [session, setSession] = useState(0);
  const deck = useMemo(() => {
    // Prefer words with 2+ characters so scramble is meaningful
    const multi = cards.filter((c) => splitJpChars(c.reading || c.jp).length >= 2);
    return shuffleArray(multi.length > 0 ? multi : cards);
  }, [cards, session]);
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [feedback, setFeedback] = useState<"idle" | "correct" | "wrong">("idle");
  const [result, setResult] = useState<GameSessionResult | null>(null);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [tileSalt, setTileSalt] = useState(0);

  const card = deck[index] ?? null;
  const target = card ? card.reading || card.jp : "";
  const tiles = useMemo(
    () => (target ? buildTiles(target, tileSalt + session * 100 + index) : []),
    [target, tileSalt, session, index]
  );

  const built = pickedIds
    .map((id) => tiles.find((t) => t.id === id)?.char ?? "")
    .join("");

  const resetRoundTiles = () => {
    setPickedIds([]);
    setTileSalt((s) => s + 1);
    setFeedback("idle");
  };

  const reset = useCallback(() => {
    setIndex(0);
    setCorrect(0);
    setWrong(0);
    setFeedback("idle");
    setResult(null);
    setPickedIds([]);
    setTileSalt(0);
    setSession((s) => s + 1);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const goNext = (nextCorrect: number, nextWrong: number) => {
    if (index + 1 >= deck.length) {
      setResult({
        gameId: "wordScramble",
        correct: nextCorrect,
        wrong: nextWrong,
        total: deck.length,
      });
      return;
    }
    setIndex((i) => i + 1);
    setPickedIds([]);
    setFeedback("idle");
  };

  const check = () => {
    if (!card || feedback !== "idle" || !built) return;
    const ok =
      answersMatch(built, target) ||
      answersMatch(built, card.jp) ||
      answersMatch(built, card.reading);
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

  const pickTile = (tile: Tile) => {
    if (feedback !== "idle" || pickedIds.includes(tile.id)) return;
    setPickedIds((ids) => [...ids, tile.id]);
  };

  const undoLast = () => {
    if (feedback !== "idle") return;
    setPickedIds((ids) => ids.slice(0, -1));
  };

  return (
    <GameShell
      open={open}
      onClose={handleClose}
      title="Word scramble"
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
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-pink-500">
            Unscramble the Japanese
          </p>
          <p className="mt-4 text-2xl font-bold text-neutral-900 sm:text-3xl">{card.en}</p>

          <div
            className={`mt-8 min-h-[3.5rem] w-full max-w-lg rounded-2xl border bg-white px-4 py-3 text-3xl font-bold tracking-[0.15em] [font-family:ui-sans-serif,'Hiragino_Sans','Hiragino_Kaku_Gothic_ProN','Yu_Gothic_UI','Yu_Gothic',Meiryo,sans-serif] ${
              feedback === "correct"
                ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                : feedback === "wrong"
                  ? "border-rose-400 bg-rose-50 text-rose-900"
                  : "border-pink-200 text-neutral-900"
            }`}
          >
            {built || <span className="text-neutral-300 tracking-normal">…</span>}
          </div>

          {feedback === "wrong" ? (
            <p className="mt-3 text-sm text-rose-700">
              Answer:{" "}
              <span className="font-semibold [font-family:ui-sans-serif,'Hiragino_Sans','Hiragino_Kaku_Gothic_ProN','Yu_Gothic_UI','Yu_Gothic',Meiryo,sans-serif]">
                {target}
                {card.jp !== target ? ` (${card.jp})` : ""}
              </span>
            </p>
          ) : feedback === "correct" ? (
            <p className="mt-3 text-sm font-semibold text-emerald-700">Correct!</p>
          ) : null}

          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {tiles.map((tile) => {
              const used = pickedIds.includes(tile.id);
              return (
                <button
                  key={tile.id}
                  type="button"
                  disabled={used || feedback !== "idle"}
                  onClick={() => pickTile(tile)}
                  className={`min-h-[3.25rem] min-w-[3.25rem] rounded-xl border px-3 text-2xl font-bold transition [font-family:ui-sans-serif,'Hiragino_Sans','Hiragino_Kaku_Gothic_ProN','Yu_Gothic_UI','Yu_Gothic',Meiryo,sans-serif] ${
                    used
                      ? "border-stone-100 bg-stone-50 text-stone-300"
                      : "border-pink-200 bg-white text-neutral-900 shadow-sm hover:border-pink-400 hover:bg-pink-50"
                  }`}
                >
                  {tile.char}
                </button>
              );
            })}
          </div>

          <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row">
            {feedback === "wrong" ? (
              <button
                type="button"
                onClick={() => goNext(correct, wrong)}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-6 text-sm font-bold text-white shadow-md shadow-pink-300/35"
              >
                Next
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={feedback !== "idle" || pickedIds.length === 0}
                  onClick={undoLast}
                  className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-stone-300 bg-stone-50 px-4 text-sm font-semibold text-stone-800 disabled:opacity-40"
                >
                  Undo
                </button>
                <button
                  type="button"
                  disabled={feedback !== "idle"}
                  onClick={resetRoundTiles}
                  className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-pink-200 bg-white px-4 text-sm font-semibold text-pink-700 disabled:opacity-40"
                >
                  Reshuffle
                </button>
                <button
                  type="button"
                  disabled={feedback !== "idle" || !built}
                  onClick={check}
                  className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-4 text-sm font-bold text-white shadow-md shadow-pink-300/35 disabled:opacity-40"
                >
                  Check
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </GameShell>
  );
}
