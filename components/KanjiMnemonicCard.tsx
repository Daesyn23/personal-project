"use client";

import { useId, useState } from "react";
import type { KanjiMnemonic } from "@/lib/kanji-mnemonic-types";
import { KanjiShapeGuide } from "@/components/KanjiShapeGuide";

export function KanjiMnemonicCard({ character, mnemonic }: {
  character: string;
  mnemonic: KanjiMnemonic;
}) {
  const [revealed, setRevealed] = useState(true);
  const id = useId();

  return (
    <section aria-labelledby={`${id}-heading`} className="overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-orange-50/60 to-pink-50/50">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 px-4 py-3 sm:px-5">
        <h3 id={`${id}-heading`} className="flex items-center gap-2 text-sm font-semibold text-amber-950"><span aria-hidden="true">✦</span> Remember this kanji</h3>
        <button type="button" aria-expanded={revealed} aria-controls={`${id}-story`} onClick={() => setRevealed(value => !value)} className="min-h-11 rounded-full border border-amber-200 bg-white/80 px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600">
          {revealed ? "Hide story" : "Reveal story"}
        </button>
      </div>
      <div className="grid items-center gap-4 p-3 sm:grid-cols-[minmax(0,1fr)_280px] sm:gap-6 sm:p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Mnemonic story</p>
          <div id={`${id}-story`} hidden={!revealed}>
            <p className="mt-2 text-base leading-7 text-neutral-800">{mnemonic.story}</p>
          </div>
          {!revealed && <p className="mt-2 text-sm leading-7 text-amber-900/70" role="status">Look at the shape of the kanji. Can you remember the story?</p>}
          <p className="mt-3 text-[11px] leading-5 text-neutral-500">An imagined scene to remember the meaning.</p>
        </div>
        <KanjiShapeGuide character={character} />
      </div>
    </section>
  );
}
