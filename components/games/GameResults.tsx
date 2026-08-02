"use client";

import type { GameSessionResult } from "@/lib/games/types";
import { GAME_META } from "@/lib/games/types";
import { formatAccuracy } from "@/lib/games/flashcard-game-content";

type Props = {
  result: GameSessionResult;
  onReplay: () => void;
  onExit: () => void;
};

export function GameResults({ result, onReplay, onExit }: Props) {
  const meta = GAME_META[result.gameId];
  const accuracy = formatAccuracy(result.correct, result.wrong);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-pink-500">Round complete</p>
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
        {meta.title}
      </h2>
      <dl className="mt-8 grid w-full grid-cols-3 gap-3">
        <div className="rounded-2xl border border-pink-100 bg-white/90 px-3 py-4 shadow-sm">
          <dt className="text-xs font-medium text-neutral-500">Correct</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">{result.correct}</dd>
        </div>
        <div className="rounded-2xl border border-pink-100 bg-white/90 px-3 py-4 shadow-sm">
          <dt className="text-xs font-medium text-neutral-500">Missed</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums text-rose-600">{result.wrong}</dd>
        </div>
        <div className="rounded-2xl border border-pink-100 bg-white/90 px-3 py-4 shadow-sm">
          <dt className="text-xs font-medium text-neutral-500">Accuracy</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums text-pink-700">{accuracy}</dd>
        </div>
      </dl>
      {result.detail ? (
        <p className="mt-4 text-sm text-neutral-600">{result.detail}</p>
      ) : null}
      <div className="mt-10 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={onReplay}
          className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-6 text-sm font-bold text-white shadow-md shadow-pink-300/35 transition hover:brightness-[1.05] sm:flex-none sm:min-w-[10rem]"
        >
          Play again
        </button>
        <button
          type="button"
          onClick={onExit}
          className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-stone-300 bg-stone-50 px-6 text-sm font-semibold text-stone-800 transition hover:border-pink-300 hover:bg-pink-50/70 sm:flex-none sm:min-w-[10rem]"
        >
          Back to games
        </button>
      </div>
    </div>
  );
}
