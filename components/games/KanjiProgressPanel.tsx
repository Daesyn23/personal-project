"use client";

import { useEffect, useState } from "react";
import { progressTotals, studyDate, studyStreak } from "@/lib/games/kanji-progress";
import { progressSyncMessage, syncKanjiProgress } from "@/lib/games/kanji-progress-store";
import { KanjiMasteryPanel } from "./KanjiMasteryPanel";
import { useKanjiProgress } from "@/hooks/useKanjiProgress";

export function KanjiProgressPanel({ onPractice, onReview }: { onPractice: (lesson: number) => void; onReview: (lesson: number) => void }) {
  const snapshot = useKanjiProgress();
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => {
    const refresh = () => setToday(new Date());
    refresh();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => { window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, []);
  const { progress } = snapshot;
  const totals = progressTotals(progress);
  const daily = today ? progress.days[studyDate(today)] ?? 0 : 0;
  const streak = today ? studyStreak(progress, today) : 0;
  const level = Math.floor(totals.xp / 100) + 1;
  return <section aria-labelledby="kanji-progress-title" className="rounded-2xl border border-pink-100 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-pink-600">Every little practice counts</p><h3 id="kanji-progress-title" className="mt-1 text-xl font-semibold text-neutral-900">Your learning journey</h3><p role="status" className="mt-1 text-xs text-neutral-500">{progressSyncMessage(snapshot)}</p></div>
      <span className="rounded-full bg-pink-50 px-4 py-2 text-sm font-semibold text-pink-800">Level {level}</span>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {progress.lastLesson !== null && <button type="button" onClick={() => onPractice(progress.lastLesson!)} className="min-h-11 rounded-xl bg-pink-50 px-4 py-2 text-sm font-semibold text-pink-800 hover:bg-pink-100">Continue Lesson {progress.lastLesson} in Rush →</button>}
      {snapshot.accountId && <button type="button" disabled={snapshot.syncStatus === "syncing" || snapshot.syncStatus === "connecting"} onClick={() => void syncKanjiProgress()} className="min-h-11 rounded-xl px-3 py-2 text-xs font-semibold text-neutral-500 underline underline-offset-4 disabled:opacity-50">Sync now</button>}
    </div>
    <div className="mt-4 flex justify-between gap-3 text-xs text-neutral-500"><span data-testid="progress-xp">{totals.xp} XP earned</span><span>{100 - totals.xp % 100} XP to level {level + 1}</span></div>
    <progress aria-label="XP toward next level" max={100} value={totals.xp % 100} className="mt-2 h-2 w-full appearance-none overflow-hidden rounded-full [&::-moz-progress-bar]:bg-pink-500 [&::-webkit-progress-bar]:bg-pink-100 [&::-webkit-progress-value]:bg-pink-500" />
    <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[
      ["Study streak", `${streak} ${streak === 1 ? "day" : "days"}`],
      ["Accuracy", totals.answered ? `${Math.round(totals.correct / totals.answered * 100)}%` : "—"],
      ["Kanji practiced", `${totals.practiced} / 656`],
      ["Today’s goal", `${Math.min(daily, 10)} / 10`],
    ].map(([label, value]) => <div key={label} className="rounded-xl bg-[#fffaf7] p-3"><dt className="text-xs text-neutral-500">{label}</dt><dd className="mt-1 text-xl font-semibold text-neutral-800">{value}</dd></div>)}</dl>
    <p className="mt-3 text-xs leading-5 text-neutral-500">{daily >= 10 ? `Daily goal reached! ${daily} readings practiced today.` : `${10 - daily} more readings to reach today’s goal.`} {totals.answered ? `${totals.correct} correct of ${totals.answered} checked readings.` : "Finish a round to start your journey."}</p>
    <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium">{[
      [totals.rounds > 0, "First steps"], [progress.perfectRounds > 0, "Perfect round"], [progress.bestStreak >= 5, "Five in a row"], [Object.keys(progress.lessons).length >= 5, "Five lessons explored"],
    ].map(([earned, label]) => <span key={String(label)} className={`rounded-full border px-3 py-1.5 ${earned ? "border-amber-200 bg-amber-50 text-amber-900" : "border-neutral-100 text-neutral-400"}`} aria-label={`${label}: ${earned ? "earned" : "not yet earned"}`}>{String(label)}</span>)}</div>
    <KanjiMasteryPanel progress={progress} now={today?.getTime() ?? 0} onReview={onReview} />
    <details className="mt-5 border-t border-pink-100 pt-1">
      <summary className="min-h-12 cursor-pointer py-4 text-sm font-semibold text-pink-800">Your lesson map · {Object.values(progress.lessons).filter(lesson => lesson.kanjiIds.length === 16).length} / 41 fully practiced</summary>
      <p className="mb-3 text-xs leading-5 text-neutral-500">Coverage counts unique kanji you’ve tried, including misses. Vocabulary adds XP and accuracy. Tap a lesson to practice in Rush.</p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">{Array.from({ length: 41 }, (_, lesson) => {
        const practiced = progress.lessons[lesson]?.kanjiIds.length ?? 0;
        return <button key={lesson} type="button" onClick={() => onPractice(lesson)} aria-label={`Practice Lesson ${lesson}, ${practiced} of 16 kanji practiced`} className={`min-h-16 rounded-xl border px-1 py-2 text-center transition hover:border-pink-500 focus-visible:outline-pink-500 ${practiced === 16 ? "border-emerald-200 bg-emerald-50 text-emerald-900" : practiced ? "border-pink-200 bg-pink-50 text-pink-900" : "border-neutral-100 bg-neutral-50 text-neutral-600"}`}><span className="block text-sm font-semibold">{lesson}</span><span className="mt-1 block text-[10px]">{practiced}/16</span></button>;
      })}</div>
    </details>
  </section>;
}
