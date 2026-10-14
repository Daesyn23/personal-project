"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { KanjiProgressPanel } from "./KanjiProgressPanel";

const KanjiQuest = dynamic(() => import("./KanjiQuest").then(module => module.KanjiQuest), { loading: () => <p role="status" className="p-4 text-sm text-pink-700">Opening Kanji Quest…</p> });
const KanjiRush = dynamic(() => import("./KanjiRush").then(module => module.KanjiRush), { loading: () => <p role="status" className="p-4 text-sm text-pink-700">Opening Kanji Rush…</p> });
const KanjiListening = dynamic(() => import("./KanjiListening").then(module => module.KanjiListening));
const button = "min-h-12 rounded-xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600";

/** One entry point shared by the Learning Hub and Games, independent of flashcard sets. */
export function KanjiQuestLauncher({ initialLesson = 0, compact = false }: { initialLesson?: number; compact?: boolean }) {
  const [open, setOpen] = useState<{ game: "quest" | "rush" | "review" | "listening"; lesson: number } | null>(null);
  return <>
    {compact ? <button type="button" onClick={() => setOpen({ game: "quest", lesson: initialLesson })} aria-label={`Play Lesson ${initialLesson}`} className="min-h-11 rounded-lg border border-pink-200 bg-white px-2 py-2 text-xs font-semibold text-pink-700 hover:bg-pink-100">Play</button> : <div className="space-y-4"><div className="grid gap-4 lg:grid-cols-2">
      <div className="relative overflow-hidden rounded-2xl border border-pink-200 bg-gradient-to-br from-pink-50 via-white to-amber-50 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span aria-hidden="true" lang="ja" className="hidden h-16 w-16 shrink-0 rotate-[-6deg] items-center justify-center rounded-2xl border border-pink-200 bg-white font-serif text-4xl text-pink-800 shadow-sm sm:flex">読</span>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-pink-600">Play your lessons</p><h3 className="mt-1 text-xl font-semibold text-neutral-900">Kanji Quest</h3><p className="mt-1 text-sm leading-6 text-neutral-600">See the kanji. Write its reading. Grow your streak.</p></div>
          </div>
          <button type="button" onClick={() => setOpen({ game: "quest", lesson: initialLesson })} className={`${button} w-full bg-pink-600 text-white shadow-sm hover:bg-pink-700 sm:w-auto`}>Play Kanji Quest →</button>
        </div>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-pink-50 p-5 sm:p-6"><div className="flex h-full flex-wrap items-center justify-between gap-4"><div className="flex min-w-0 items-center gap-4"><span aria-hidden="true" lang="ja" className="hidden h-16 w-16 shrink-0 rotate-[6deg] items-center justify-center rounded-2xl border border-amber-200 bg-white font-serif text-4xl text-amber-800 shadow-sm sm:flex">速</span><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">A fresh challenge</p><h3 className="mt-1 text-xl font-semibold text-neutral-900">Kanji Rush</h3><p className="mt-1 text-sm leading-6 text-neutral-600">Four readings. One match. Find your rhythm.</p></div></div><button type="button" onClick={() => setOpen({ game: "rush", lesson: initialLesson })} className={`${button} w-full bg-neutral-900 text-white shadow-sm hover:bg-neutral-800 sm:w-auto`}>Play Kanji Rush →</button></div></div>
      </div><div className="relative overflow-hidden rounded-2xl border border-pink-200 bg-gradient-to-br from-pink-50 via-white to-amber-50 p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex min-w-0 items-center gap-4"><span aria-hidden="true" lang="ja" className="hidden h-16 w-16 shrink-0 rotate-[-6deg] items-center justify-center rounded-2xl border border-pink-200 bg-white font-serif text-4xl text-pink-800 shadow-sm sm:flex">聞</span><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-pink-600">Train your listening</p><h3 className="mt-1 text-xl font-semibold text-neutral-900">Listening Quest</h3><p className="mt-1 text-sm leading-6 text-neutral-600">Hear a word. Write its hiragana. Replay at your own pace.</p></div></div><button type="button" onClick={() => setOpen({game:"listening",lesson:initialLesson})} className={`${button} w-full bg-pink-600 text-white shadow-sm hover:bg-pink-700 sm:w-auto`}>Play Listening Quest →</button></div></div><KanjiProgressPanel onPractice={lesson => setOpen({ game: "rush", lesson })} onReview={lesson => setOpen({game:"review",lesson})} /></div>}
    {open?.game === "quest" && <KanjiQuest initialLesson={open.lesson} onClose={() => setOpen(null)} />}
    {open?.game === "review" && <KanjiQuest initialLesson={open.lesson} review onClose={() => setOpen(null)} />}
    {open?.game === "listening" && <KanjiListening initialLesson={open.lesson} onClose={() => setOpen(null)} />}
    {open?.game === "rush" && <KanjiRush initialLesson={open.lesson} onClose={() => setOpen(null)} />}
  </>;
}

