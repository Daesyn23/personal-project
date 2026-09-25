"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import material from "@/data/kanji-lessons.json";
import mnemonicData from "@/data/kanji-mnemonics.json";
import { KanjiMnemonicCard } from "@/components/KanjiMnemonicCard";
import type { KanjiMnemonic } from "@/lib/kanji-mnemonic-types";
import { matchesKanji, type KanjiEntry, type KanjiLesson, type KanjiLibrary } from "@/lib/kanji-learning";

const library: KanjiLibrary = material;
const mnemonics: Record<string, KanjiMnemonic> = mnemonicData;
const ranges = [
  { label: "All lessons", start: 0, end: 40 },
  { label: "0–10", start: 0, end: 10 },
  { label: "11–20", start: 11, end: 20 },
  { label: "21–30", start: 21, end: 30 },
  { label: "31–40", start: 31, end: 40 },
];
const allEntries = library.lessons.flatMap(lesson => lesson.entries.map(entry => ({ lesson, entry })));

export function WorkspaceLearningHub() {
  const [query, setQuery] = useState("");
  const [range, setRange] = useState(0);
  const [lessonNumber, setLessonNumber] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const visibleLessons = useMemo(() => library.lessons
    .filter(lesson => lesson.number >= ranges[range].start && lesson.number <= ranges[range].end)
    .filter(lesson => lessonNumber === "all" || lesson.number === Number(lessonNumber))
    .map(lesson => ({ ...lesson, entries: lesson.entries.filter(entry => matchesKanji(entry, query)) }))
    .filter(lesson => lesson.entries.length), [query, range, lessonNumber]);
  const visibleCount = visibleLessons.reduce((count, lesson) => count + lesson.entries.length, 0);
  const selectedIndex = allEntries.findIndex(item => item.entry.id === selectedId);
  const selected = allEntries[selectedIndex];
  const clearFilters = () => { setQuery(""); setRange(0); setLessonNumber("all"); };

  return (
    <section aria-labelledby="learning-hub-title" className="learning-hub space-y-4 pb-24 sm:space-y-6 sm:pb-0">
      <div className="relative overflow-hidden rounded-2xl border border-pink-100 bg-white/90 p-4 shadow-sm sm:rounded-3xl sm:px-9 sm:py-9">
        <div aria-hidden="true" lang="ja" className="pointer-events-none absolute -right-2 -top-9 select-none text-[200px] leading-none text-pink-50 sm:right-10">学</div>
        <div className="relative flex flex-wrap items-end justify-between gap-3 sm:gap-6">
          <div>
            <p className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-pink-600 sm:block">Your Japanese learning hub</p>
            <h2 id="learning-hub-title" className="text-2xl font-semibold tracking-tight text-neutral-900 sm:mt-3 sm:text-4xl">A little kanji, every day.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-600">Tap a kanji to explore its story, shape, readings, and vocabulary.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-neutral-600 sm:mt-5">
              <span className="rounded-full bg-pink-50 px-3 py-1.5">41 lessons</span>
              <span className="rounded-full bg-pink-50 px-3 py-1.5">656 kanji</span>
              <span className="hidden rounded-full bg-pink-50 px-3 py-1.5 sm:inline">Your original learning materials</span>
            </div>
          </div>
          <a href={library.compiledPdf} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-pink-200 bg-white px-4 py-2.5 text-xs font-semibold text-pink-700 transition hover:bg-pink-50">Open compiled list ↗</a>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-pink-100 bg-white/90 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label htmlFor="kanji-search" className="mb-1.5 block text-xs font-semibold text-neutral-600">Find a kanji</label>
            <input id="kanji-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Kanji, meaning, or reading…" className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 sm:text-sm" />
          </div>
          <div className="sm:w-44">
            <label htmlFor="kanji-lesson" className="mb-1.5 block text-xs font-semibold text-neutral-600">Jump to a lesson</label>
            <select id="kanji-lesson" value={lessonNumber} onChange={event => { setLessonNumber(event.target.value); setRange(0); }} className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-base outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 sm:text-sm">
              <option value="all">All lessons</option>
              {library.lessons.map(lesson => <option key={lesson.number} value={lesson.number}>Lesson {lesson.number}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1" aria-label="Lesson ranges">
            {ranges.map((item, index) => <button key={item.label} type="button" aria-pressed={range === index && lessonNumber === "all"} onClick={() => { setRange(index); setLessonNumber("all"); }} className={`min-h-11 shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${range === index && lessonNumber === "all" ? "bg-pink-600 text-white" : "bg-neutral-50 text-neutral-600 hover:bg-pink-50"}`}>{item.label}</button>)}
          </div>
          <p className="text-xs text-neutral-500" aria-live="polite">{visibleCount} kanji · {visibleLessons.length} lessons</p>
        </div>
      </div>

      {visibleLessons.length ? (
        <div className="overflow-hidden rounded-2xl border border-pink-100 bg-white/95 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-neutral-800">Kanji lesson grid</h3>
            <p className="text-xs text-neutral-500">Select a kanji to explore</p>
          </div>
          <div aria-label="Kanji grouped by lesson">
            {visibleLessons.map(lesson => <section key={lesson.number} aria-labelledby={`kanji-lesson-${lesson.number}-title`} className="border-b border-pink-100 last:border-b-0 lg:flex">
              <h4 id={`kanji-lesson-${lesson.number}-title`} className="flex items-center gap-2 bg-pink-50/80 px-4 py-3 text-sm font-semibold text-pink-900 lg:w-20 lg:shrink-0 lg:flex-col lg:justify-center lg:gap-1 lg:border-r lg:border-pink-100 lg:px-2">
                <span className="text-xs font-medium text-pink-600 lg:text-[10px] lg:uppercase lg:tracking-widest">Lesson</span>
                <span className="tabular-nums lg:text-xl">{lesson.number}</span>
                <span className="ml-auto text-xs font-normal text-pink-700/70 lg:hidden">{lesson.entries.length} kanji</span>
              </h4>
              <div className="grid min-w-0 flex-1 grid-cols-4 sm:grid-cols-8 lg:grid-cols-[repeat(16,minmax(0,1fr))]">
                {lesson.entries.map(entry => <button key={entry.id} type="button" onClick={() => setSelectedId(entry.id)} aria-label={`${entry.character} — ${entry.meaning}, Lesson ${lesson.number}`} className="kanji-cell group flex min-h-28 min-w-0 flex-col items-stretch border-b border-r border-neutral-100 transition hover:bg-pink-50 focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pink-600">
                  <span lang="ja" className="flex min-h-16 items-center justify-center px-1 py-2 font-serif text-[32px] leading-none text-neutral-800 transition group-hover:text-pink-700">{entry.character}</span>
                  <span className="flex flex-1 items-center justify-center break-words border-t border-neutral-100 bg-neutral-50/60 px-1 py-2 text-center text-[11px] leading-snug text-neutral-600 lg:text-[10px]">{entry.meaning}</span>
                </button>)}
              </div>
            </section>)}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-pink-200 bg-white/80 px-6 py-14 text-center">
          <h3 className="font-semibold text-neutral-800">No kanji found</h3>
          <p className="mt-2 text-sm text-neutral-500">Try another reading or meaning, or browse all lessons.</p>
          <button type="button" onClick={clearFilters} className="mt-5 rounded-full bg-pink-600 px-5 py-2 text-sm font-semibold text-white">Clear filters</button>
        </div>
      )}

      {selected && <KanjiDetail lesson={selected.lesson} entry={selected.entry} index={selectedIndex} onClose={() => setSelectedId(null)} onStep={step => setSelectedId(allEntries[selectedIndex + step].entry.id)} onSelect={setSelectedId} />}
    </section>
  );
}

function KanjiDetail({ lesson, entry, index, onClose, onStep, onSelect }: {
  lesson: KanjiLesson; entry: KanjiEntry; index: number;
  onClose: () => void; onStep: (step: number) => void; onSelect: (id: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"study" | "source">("study");
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = overflow; trigger?.focus(); };
  }, []);
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [entry.id, view]);

  return <dialog ref={dialogRef} aria-labelledby="kanji-detail-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }} className="kanji-dialog m-0 h-dvh max-h-dvh w-full max-w-none overflow-hidden border-0 bg-white p-0 text-neutral-900 shadow-2xl backdrop:bg-neutral-950/40 backdrop:backdrop-blur-sm sm:m-auto sm:h-auto sm:max-h-[90dvh] sm:w-[calc(100%-1.5rem)] sm:max-w-5xl sm:rounded-3xl sm:border sm:border-pink-100">
    <div className="flex h-full flex-col sm:max-h-[90dvh]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-pink-100 bg-pink-50/60 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-7 sm:py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-pink-600">Learning Hub / Lesson {lesson.number}</p>
          <h2 id="kanji-detail-title" className="mt-1 text-lg font-semibold"><span lang="ja">{entry.character}</span> <span className="font-normal text-neutral-500">· {entry.lessonMeaning || entry.meaning}</span></h2>
        </div>
        <button type="button" autoFocus onClick={onClose} aria-label="Close kanji details" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-pink-100 bg-white text-xl text-neutral-600 hover:bg-pink-100">×</button>
      </header>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1 border-b border-neutral-100 px-3 py-2 sm:gap-3 sm:px-7 sm:py-3">
        <div className="flex rounded-lg bg-neutral-100 p-1" aria-label="Detail view">
          <button type="button" aria-pressed={view === "study"} onClick={() => setView("study")} className={`min-h-11 rounded-md px-3 py-2 text-xs font-semibold ${view === "study" ? "bg-white text-pink-700 shadow-sm" : "text-neutral-500"}`}>Study</button>
          <button type="button" aria-pressed={view === "source"} onClick={() => setView("source")} className={`min-h-11 rounded-md px-3 py-2 text-xs font-semibold ${view === "source" ? "bg-white text-pink-700 shadow-sm" : "text-neutral-500"}`}>Lesson pages ({entry.pages.length})</button>
        </div>
        <a href={`${lesson.pdf}#page=${entry.pages[0].number}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center px-2 text-xs font-semibold text-pink-700 hover:underline">Open lesson PDF ↗</a>
      </div>
      <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-7">
        {view === "study" ? <div className="space-y-5 sm:space-y-7">
          <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
            <div className="flex min-h-24 items-center justify-center rounded-2xl border border-pink-100 bg-pink-50/60 sm:row-span-2 sm:min-h-40"><span lang="ja" className="font-serif text-6xl leading-none sm:text-8xl">{entry.character}</span></div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Meaning</p>
              <p className="mt-2 break-words text-xl font-medium sm:text-2xl">{entry.lessonMeaning || entry.meaning}</p>
            </div>
              <div className="col-span-2 grid min-w-0 grid-cols-2 gap-3 sm:col-span-1">
                <div className="rounded-xl bg-neutral-50 p-3"><h3 className="text-xs font-medium text-neutral-500">Kunyomi · 訓読み</h3><p lang={entry.kunyomi ? "ja" : "en"} className="mt-2 break-words text-lg">{entry.kunyomi || <span className="text-sm text-neutral-400">Not listed</span>}</p></div>
                <div className="rounded-xl bg-neutral-50 p-3"><h3 className="text-xs font-medium text-neutral-500">Onyomi · 音読み</h3><p lang={entry.onyomi ? "ja" : "en"} className="mt-2 break-words text-lg">{entry.onyomi || <span className="text-sm text-neutral-400">Not listed</span>}</p></div>
              </div>
          </div>
          <KanjiMnemonicCard key={entry.id} character={entry.character} mnemonic={mnemonics[entry.character]} />
          <section aria-labelledby="stroke-heading">
            <h3 id="stroke-heading" className="mb-3 text-sm font-semibold">Stroke order <span className="font-normal text-neutral-400">· from your lesson</span></h3>
            <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white"><Image unoptimized src={entry.strokeImage} alt={`Stroke order sequence for ${entry.character}, from Lesson ${lesson.number}`} width={1600} height={100} className="h-auto w-full min-w-[650px]" /></div>
            <p className="mt-2 text-xs text-neutral-500 sm:hidden">Swipe the stroke strip to see the whole sequence.</p>
          </section>
          <section aria-labelledby="vocab-heading">
            <div className="mb-3 flex items-center justify-between"><h3 id="vocab-heading" className="text-sm font-semibold">Lesson vocabulary</h3><span className="text-xs text-neutral-400">{entry.vocabulary.length} entries</span></div>
            <dl className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 sm:hidden">
              {entry.vocabulary.map((row, i) => <div key={`${row.page}-${i}`} className="px-3 py-3">
                <dt className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span lang="ja" className="break-words text-xl [overflow-wrap:anywhere]">{row.word || "—"}</span>
                  <span lang="ja" className="break-words text-base text-pink-700 [overflow-wrap:anywhere]"><span className="sr-only">Reading: </span>{row.reading || "—"}</span>
                </dt>
                <dd className="mt-1.5 break-words text-sm leading-6 text-neutral-600">{row.meaning || "—"}</dd>
              </div>)}
            </dl>
            <div className="hidden overflow-x-auto rounded-xl border border-neutral-200 sm:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500"><tr><th scope="col" className="px-4 py-3 font-medium">Kanji / word</th><th scope="col" className="px-4 py-3 font-medium">Reading</th><th scope="col" className="px-4 py-3 font-medium">Meaning</th></tr></thead>
                <tbody>{entry.vocabulary.map((row, i) => <tr key={`${row.page}-${i}`} className="border-b border-neutral-100 last:border-0"><td lang="ja" className="px-4 py-3 text-lg">{row.word || "—"}</td><td lang="ja" className="px-4 py-3 text-base text-pink-700">{row.reading || "—"}</td><td className="px-4 py-3 text-neutral-600">{row.meaning || "—"}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-5 text-neutral-400">Transcribed from your materials. The Lesson pages view preserves the original wording and layout.</p>
          </section>
        </div> : <div className="space-y-6">
          <p className="text-sm leading-6 text-neutral-500">Every page for <span lang="ja">{entry.character}</span> in Lesson {lesson.number}, including continuation pages. Select a page to open it at full size.</p>
          {entry.pages.map(page => <figure key={page.number}>
            <figcaption className="mb-2 text-xs font-medium text-neutral-500">Lesson {lesson.number} · Page {page.number}</figcaption>
            <a href={page.image} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-neutral-200"><Image unoptimized src={page.image} alt={`Original lesson ${lesson.number}, page ${page.number}: ${entry.character} readings, strokes and vocabulary`} width={1600} height={900} className="h-auto w-full" /></a>
          </figure>)}
        </div>}
        <section className="mt-7 border-t border-neutral-100 pt-5" aria-label={`Other kanji in lesson ${lesson.number}`}>
          <p className="mb-3 text-xs font-medium text-neutral-500">In this lesson</p>
          <div className="flex flex-wrap gap-2">{lesson.entries.map(item => <button key={item.id} type="button" lang="ja" aria-label={`Study ${item.character}`} aria-pressed={entry.id === item.id} onClick={() => onSelect(item.id)} className={`h-11 w-11 rounded-lg border font-serif text-xl transition ${entry.id === item.id ? "border-pink-600 bg-pink-600 text-white" : "border-neutral-200 text-neutral-600 hover:border-pink-300 hover:bg-pink-50"}`}>{item.character}</button>)}</div>
        </section>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-neutral-100 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-7 sm:py-4">
        <button type="button" disabled={index === 0} onClick={() => onStep(-1)} className="min-h-11 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-600 hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-30">← Previous</button>
        <span className="text-xs tabular-nums text-neutral-400">{index + 1} / {allEntries.length}</span>
        <button type="button" disabled={index === allEntries.length - 1} onClick={() => onStep(1)} className="min-h-11 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-600 hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-30">Next →</button>
      </footer>
    </div>
  </dialog>;
}
