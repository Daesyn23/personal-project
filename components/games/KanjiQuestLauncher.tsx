"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const KanjiQuest = dynamic(() => import("./KanjiQuest").then(module => module.KanjiQuest), { loading: () => <p role="status" className="p-4 text-sm text-pink-700">Opening Kanji Quest…</p> });
const button = "min-h-12 rounded-xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600";

/** One entry point shared by the Learning Hub and Games, independent of flashcard sets. */
export function KanjiQuestLauncher({ initialLesson = 0, compact = false }: { initialLesson?: number; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    {compact ? <button type="button" onClick={() => setOpen(true)} aria-label={`Play Lesson ${initialLesson}`} className="min-h-11 rounded-lg border border-pink-200 bg-white px-2 py-2 text-xs font-semibold text-pink-700 hover:bg-pink-100">Play</button> :
      <div className="relative overflow-hidden rounded-2xl border border-pink-200 bg-gradient-to-br from-pink-50 via-white to-amber-50 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span aria-hidden="true" lang="ja" className="hidden h-16 w-16 shrink-0 rotate-[-6deg] items-center justify-center rounded-2xl border border-pink-200 bg-white font-serif text-4xl text-pink-800 shadow-sm sm:flex">読</span>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-pink-600">Play your lessons</p><h3 className="mt-1 text-xl font-semibold text-neutral-900">Kanji Quest</h3><p className="mt-1 text-sm leading-6 text-neutral-600">See the kanji. Write its reading. Grow your streak.</p></div>
          </div>
          <button type="button" onClick={() => setOpen(true)} className={`${button} w-full bg-pink-600 text-white shadow-sm hover:bg-pink-700 sm:w-auto`}>Play Kanji Quest →</button>
        </div>
      </div>}
    {open && <KanjiQuest initialLesson={initialLesson} onClose={() => setOpen(false)} />}
  </>;
}

