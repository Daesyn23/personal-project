"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { HeadingWithInfo } from "@/components/InfoTip";
import { MatchGame } from "@/components/games/MatchGame";
import { MultipleChoiceGame } from "@/components/games/MultipleChoiceGame";
import { TypeAnswerGame } from "@/components/games/TypeAnswerGame";
import { TrueFalseGame } from "@/components/games/TrueFalseGame";
import { WordScrambleGame } from "@/components/games/WordScrambleGame";
import {
  canStartGame,
  toPlayableCards,
} from "@/lib/games/flashcard-game-content";
import {
  ALL_GAME_IDS,
  GAME_META,
  type GameId,
} from "@/lib/games/types";
import type { CardSetRow, FlashcardRow } from "@/lib/types";

type Props = {
  sets: CardSetRow[];
  loaded: boolean;
  /** Prefill from flashcards / dashboard when the Games tab opens. */
  preferredSetId?: string | null;
  loadCards: (setId: string) => Promise<FlashcardRow[]>;
};

function GameMark({ gameId }: { gameId: GameId }) {
  const common = "h-7 w-7";
  switch (gameId) {
    case "match":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="4" width="7" height="7" rx="1.5" className="stroke-pink-600" strokeWidth="1.8" />
          <rect x="14" y="13" width="7" height="7" rx="1.5" className="stroke-rose-500" strokeWidth="1.8" />
          <path d="M10 7.5h2.5a2 2 0 012 2V13" className="stroke-pink-400" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "multipleChoice":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="7" cy="7" r="2.2" className="stroke-pink-600" strokeWidth="1.8" />
          <circle cx="7" cy="17" r="2.2" className="fill-pink-500 stroke-pink-600" strokeWidth="1.8" />
          <path d="M12 7h8M12 17h8" className="stroke-rose-400" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "typeAnswer":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 19h16M7 15l8.5-8.5a1.8 1.8 0 012.5 2.5L9.5 17.5 5 19l2-4.5z"
            className="stroke-pink-600"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "trueFalse":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 12.5l3.2 3.2L11.5 11" className="stroke-emerald-600" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 9l5 5M19 9l-5 5" className="stroke-rose-500" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      );
    case "wordScramble":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3.5" y="8" width="5" height="8" rx="1.2" className="stroke-pink-600" strokeWidth="1.7" />
          <rect x="9.5" y="5" width="5" height="8" rx="1.2" className="stroke-rose-500" strokeWidth="1.7" />
          <rect x="15.5" y="10" width="5" height="8" rx="1.2" className="stroke-pink-400" strokeWidth="1.7" />
        </svg>
      );
  }
}

function StepBadge({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 text-xs font-bold text-white shadow-sm shadow-pink-300/40">
        {n}
      </span>
      <span className="text-sm font-semibold text-neutral-800">{children}</span>
    </div>
  );
}

export function WorkspaceGamesSection({
  sets,
  loaded,
  preferredSetId = null,
  loadCards,
}: Props) {
  const [selectedSetId, setSelectedSetId] = useState<string | null>(
    preferredSetId ?? sets[0]?.id ?? null
  );
  const [cards, setCards] = useState<FlashcardRow[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameId | null>(null);
  const [playing, setPlaying] = useState(false);
  const [lastPreferred, setLastPreferred] = useState<string | null>(null);

  useEffect(() => {
    if (!preferredSetId || preferredSetId === lastPreferred) return;
    setSelectedSetId(preferredSetId);
    setLastPreferred(preferredSetId);
  }, [preferredSetId, lastPreferred]);

  useEffect(() => {
    if (!selectedSetId && sets.length > 0) {
      setSelectedSetId(sets[0].id);
    }
    if (selectedSetId && !sets.some((s) => s.id === selectedSetId)) {
      setSelectedSetId(sets[0]?.id ?? null);
    }
  }, [sets, selectedSetId]);

  useEffect(() => {
    if (!selectedSetId) {
      setCards([]);
      return;
    }
    let cancelled = false;
    setCardsLoading(true);
    loadCards(selectedSetId)
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
  }, [selectedSetId, loadCards]);

  const playable = useMemo(() => toPlayableCards(cards), [cards]);
  const setName = sets.find((s) => s.id === selectedSetId)?.name ?? "Flashcards";

  const startGame = useCallback(
    (gameId: GameId) => {
      if (!canStartGame(gameId, playable.length)) return;
      setSelectedGame(gameId);
      setPlaying(true);
    },
    [playable.length]
  );

  const stopGame = useCallback(() => {
    setPlaying(false);
    setSelectedGame(null);
  }, []);

  return (
    <section className="min-w-0 space-y-8 sm:space-y-10">
      <header className="relative overflow-hidden rounded-3xl border border-pink-100/80 bg-white/70 px-5 py-6 shadow-sm shadow-pink-100/30 backdrop-blur-sm sm:px-8 sm:py-8">
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-gradient-to-bl from-pink-300/35 via-rose-200/20 to-transparent blur-2xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-10 h-40 w-40 rounded-full bg-gradient-to-tr from-rose-200/30 to-transparent blur-2xl"
          aria-hidden
        />
        <div className="relative max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pink-500/90">
            Classroom fun
          </p>
          <HeadingWithInfo
            className="mt-2"
            infoLabel="Mini games"
            heading={
              <h2 className="bg-gradient-to-r from-pink-700 via-rose-600 to-pink-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
                Mini games
              </h2>
            }
          >
            Pick a flashcard lesson set, choose a game, and play fullscreen on the projector.
            Words and meanings come straight from that set.
          </HeadingWithInfo>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-600">
            A quick break that still practices the lesson vocab you just taught.
          </p>
        </div>
      </header>

      <div className="space-y-4">
        <StepBadge n={1}>Choose a flashcard set</StepBadge>
        {!loaded ? (
          <p className="text-sm text-neutral-500">Loading sets…</p>
        ) : sets.length === 0 ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
            No flashcard sets yet. Create or import a set under Flashcards first.
          </p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <label className="block min-w-0 flex-1 sm:max-w-md">
              <span className="sr-only">Flashcard set</span>
              <select
                id="games-set-select"
                value={selectedSetId ?? ""}
                onChange={(e) => {
                  setSelectedSetId(e.target.value || null);
                  setPlaying(false);
                  setSelectedGame(null);
                }}
                className="w-full appearance-none rounded-2xl border border-pink-200/90 bg-white px-4 py-3.5 text-sm font-semibold text-neutral-900 shadow-sm outline-none transition focus:border-pink-400 focus:ring-2 focus:ring-pink-300/60"
              >
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {typeof s.card_count === "number" ? ` (${s.card_count})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div
              className="inline-flex items-center gap-2 rounded-2xl border border-pink-100 bg-pink-50/70 px-4 py-3 text-sm text-pink-900"
              aria-live="polite"
            >
              <span className="text-lg font-bold tabular-nums text-pink-700">
                {cardsLoading ? "…" : playable.length}
              </span>
              <span className="text-xs font-medium leading-snug text-pink-800/80">
                playable words
                <span className="block text-[11px] font-normal text-pink-700/70">
                  need Japanese + English
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <StepBadge n={2}>Pick a game</StepBadge>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {ALL_GAME_IDS.map((gameId, i) => {
            const meta = GAME_META[gameId];
            const ok = canStartGame(gameId, playable.length);
            const disabled = !selectedSetId || cardsLoading || !ok;
            const wide = i < 3;
            return (
              <button
                key={gameId}
                type="button"
                disabled={disabled}
                onClick={() => startGame(gameId)}
                style={{ animationDelay: `${i * 55}ms` }}
                className={`game-tile-in group relative flex min-h-[11rem] flex-col overflow-hidden rounded-2xl border border-pink-100/90 bg-white p-5 text-left shadow-sm shadow-pink-100/20 transition duration-200 hover:-translate-y-1 hover:border-pink-300 hover:shadow-md hover:shadow-pink-200/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 disabled:pointer-events-none disabled:opacity-45 sm:min-h-[12rem] ${
                  wide ? "lg:col-span-2" : "sm:col-span-1 lg:col-span-3"
                }`}
              >
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-pink-500 via-rose-400 to-pink-300 opacity-80 transition group-hover:opacity-100"
                  aria-hidden
                />
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-pink-50 to-rose-50 ring-1 ring-pink-100 transition group-hover:from-pink-100 group-hover:to-rose-100">
                    <GameMark gameId={gameId} />
                  </span>
                  <span className="rounded-md bg-neutral-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500 ring-1 ring-neutral-100">
                    {meta.hint}
                  </span>
                </div>
                <span className="mt-4 text-lg font-bold tracking-tight text-neutral-900 transition group-hover:text-pink-700">
                  {meta.title}
                </span>
                <span className="mt-1.5 flex-1 text-sm leading-relaxed text-neutral-600">
                  {meta.blurb}
                </span>
                <span
                  className={`mt-5 inline-flex min-h-[40px] items-center justify-center rounded-xl px-4 text-sm font-bold transition ${
                    ok
                      ? "bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-sm shadow-pink-300/30 group-hover:brightness-105"
                      : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {ok ? "Start game" : `Needs ≥${meta.minCards} words`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {playing && selectedGame === "match" ? (
        <MatchGame cards={playable} setName={setName} open onClose={stopGame} />
      ) : null}
      {playing && selectedGame === "multipleChoice" ? (
        <MultipleChoiceGame cards={playable} setName={setName} open onClose={stopGame} />
      ) : null}
      {playing && selectedGame === "typeAnswer" ? (
        <TypeAnswerGame cards={playable} setName={setName} open onClose={stopGame} />
      ) : null}
      {playing && selectedGame === "trueFalse" ? (
        <TrueFalseGame cards={playable} setName={setName} open onClose={stopGame} />
      ) : null}
      {playing && selectedGame === "wordScramble" ? (
        <WordScrambleGame cards={playable} setName={setName} open onClose={stopGame} />
      ) : null}
    </section>
  );
}
