"use client";
import { useState } from 'react';
import material from '@/data/kanji-lessons.json';
import type { KanjiProgress } from '@/lib/games/kanji-progress';
import { kanjiMastery, type MasteryStatus } from '@/lib/games/kanji-mastery';
const colors: Record<MasteryStatus, string> = { New: 'bg-neutral-50 text-neutral-500', Practicing: 'bg-pink-50 text-pink-800', Remembered: 'bg-emerald-50 text-emerald-800', 'Review due': 'bg-amber-50 text-amber-900' };
export function KanjiMasteryPanel({ progress, now, onReview }: { progress: KanjiProgress; now: number; onReview: (lesson: number) => void }) {
 const [lesson, setLesson] = useState(0);
 const entries = material.lessons.flatMap(item => item.entries.map(entry => ({ ...entry, lesson: item.number, mastery: kanjiMastery(progress, entry.id, now) })));
 const due = entries.filter(entry => entry.mastery.status === 'Review due').sort((a,b) => a.mastery.dueAt! - b.mastery.dueAt!);
 return <div className="mt-5 border-t border-pink-100 pt-5">
  <h4 className="font-semibold text-neutral-900">What’s sticking?</h4><p className="mt-1 text-xs leading-5 text-neutral-500">Remembered means correct recall on three separate days. Reviews keep your memory fresh.</p>
  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{(Object.keys(colors) as MasteryStatus[]).map(status => <div key={status} className={`rounded-xl p-3 ${colors[status]}`}><span className="block text-xs">{status}</span><strong className="text-xl">{entries.filter(entry => entry.mastery.status === status).length}</strong></div>)}</div>
  <button type="button" disabled={!due.length} onClick={() => onReview(due[0].lesson)} className="mt-3 min-h-12 w-full rounded-xl bg-pink-600 px-4 text-sm font-semibold text-white disabled:bg-neutral-100 disabled:text-neutral-500">{due.length ? `Review due kanji · ${due.length} ready →` : 'All caught up · no reviews due'}</button>
  <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-pink-800">Explore mastery by lesson</summary>
   <label className="block text-xs font-semibold" htmlFor="mastery-lesson">Mastery lesson</label><select id="mastery-lesson" value={lesson} onChange={event => setLesson(Number(event.target.value))} className="mt-2 min-h-12 w-full rounded-xl border border-pink-200 bg-white px-3 text-base">{material.lessons.map(item => <option key={item.number} value={item.number}>Lesson {item.number}</option>)}</select>
   <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{entries.filter(entry => entry.lesson === lesson).map(entry => <div key={entry.id} className={`rounded-xl p-3 text-center ${colors[entry.mastery.status]}`}><span lang="ja" className="block font-serif text-3xl">{entry.character}</span><span className="mt-1 block text-xs">{entry.mastery.status}</span>{entry.mastery.dueAt && <span className="mt-1 block text-[10px]">Review {new Date(entry.mastery.dueAt).toLocaleDateString(undefined, {month:'short',day:'numeric'})}</span>}</div>)}</div>
   <button type="button" onClick={() => onReview(lesson)} className="mt-2 min-h-11 text-sm font-semibold text-pink-700 underline">Review this lesson →</button>
  </details>
 </div>;
}
