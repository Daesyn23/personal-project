"use client";

import { useCallback, useMemo, useState } from "react";
import { shuffleArray } from "@/lib/shuffle-array";
import type { GameSessionResult, PlayableCard } from "@/lib/games/types";
import { GameShell } from "@/components/games/GameShell";
import { GameResults } from "@/components/games/GameResults";

type Side = "jp" | "en";

type Tile = {
  key: string;
  cardId: string;
  side: Side;
  label: string;
};

type Props = {
  cards: PlayableCard[];
  setName: string;
  open: boolean;
  onClose: () => void;
};

function buildTiles(cards: PlayableCard[]): Tile[] {
  const jp = cards.map((c) => ({
    key: `jp-${c.id}`,
    cardId: c.id,
    side: "jp" as const,
    label: c.jp,
  }));
  const en = cards.map((c) => ({
    key: `en-${c.id}`,
    cardId: c.id,
    side: "en" as const,
    label: c.en,
  }));
  return [...shuffleArray(jp), ...shuffleArray(en)];
}

export function MatchGame({ cards, setName, open, onClose }: Props) {
  const [session, setSession] = useState(0);
  const tiles = useMemo(() => buildTiles(cards), [cards, session]);
  const [matched, setMatched] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Tile | null>(null);
  const [wrongKeys, setWrongKeys] = useState<Set<string>>(() => new Set());
  const [locked, setLocked] = useState(false);
  const [wrongCount, setWrongCount] = useState(0);
  const [result, setResult] = useState<GameSessionResult | null>(null);

  const reset = useCallback(() => {
    setMatched(new Set());
    setSelected(null);
    setWrongKeys(new Set());
    setLocked(false);
    setWrongCount(0);
    setResult(null);
    setSession((s) => s + 1);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const onTile = (tile: Tile) => {
    if (locked || result || matched.has(tile.cardId)) return;
    if (selected?.key === tile.key) {
      setSelected(null);
      return;
    }
    if (!selected) {
      setSelected(tile);
      return;
    }
    if (selected.side === tile.side) {
      setSelected(tile);
      return;
    }

    if (selected.cardId === tile.cardId) {
      const next = new Set(matched);
      next.add(tile.cardId);
      setMatched(next);
      setSelected(null);
      if (next.size >= cards.length) {
        setResult({
          gameId: "match",
          correct: cards.length,
          wrong: wrongCount,
          total: cards.length,
          detail: `${cards.length} pairs matched`,
        });
      }
      return;
    }

    setLocked(true);
    setWrongCount((n) => n + 1);
    setWrongKeys(new Set([selected.key, tile.key]));
    window.setTimeout(() => {
      setWrongKeys(new Set());
      setSelected(null);
      setLocked(false);
    }, 550);
  };

  const jpTiles = tiles.filter((t) => t.side === "jp");
  const enTiles = tiles.filter((t) => t.side === "en");
  const matchedCount = matched.size;

  return (
    <GameShell
      open={open}
      onClose={handleClose}
      title="Match"
      subtitle={setName}
      status={
        result ? null : (
          <span>
            {matchedCount} / {cards.length} pairs
          </span>
        )
      }
    >
      {result ? (
        <GameResults result={result} onReplay={reset} onExit={handleClose} />
      ) : (
        <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          {[
            { label: "Japanese", list: jpTiles },
            { label: "English", list: enTiles },
          ].map((col) => (
            <div key={col.label} className="flex min-h-0 flex-col">
              <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-pink-500">
                {col.label}
              </p>
              <div className="flex flex-col gap-2">
                {col.list.map((tile) => {
                  const isMatched = matched.has(tile.cardId);
                  const isSelected = selected?.key === tile.key;
                  const isWrong = wrongKeys.has(tile.key);
                  return (
                    <button
                      key={tile.key}
                      type="button"
                      disabled={isMatched || locked}
                      onClick={() => onTile(tile)}
                      className={`min-h-[3.25rem] rounded-xl border px-4 py-3 text-left text-base font-semibold transition sm:text-lg ${
                        isMatched
                          ? "border-emerald-200 bg-emerald-50/80 text-emerald-800/70 line-through opacity-70"
                          : isWrong
                            ? "animate-pulse border-rose-400 bg-rose-50 text-rose-800"
                            : isSelected
                              ? "border-pink-500 bg-pink-100 text-pink-900 ring-2 ring-pink-300"
                              : "border-pink-100 bg-white text-neutral-900 shadow-sm hover:border-pink-300 hover:bg-pink-50/60"
                      }`}
                    >
                      <span
                        className={
                          tile.side === "jp"
                            ? "[font-family:ui-sans-serif,'Hiragino_Sans','Hiragino_Kaku_Gothic_ProN','Yu_Gothic_UI','Yu_Gothic',Meiryo,sans-serif]"
                            : undefined
                        }
                      >
                        {tile.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </GameShell>
  );
}
