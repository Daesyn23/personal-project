"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import material from "@/data/kanji-lessons.json";
import type { KanjiLibrary } from "@/lib/kanji-learning";
import { buildQuestDeck, questStats, type QuestAnswer } from "@/lib/games/kanji-quest";
import { buildRushQuestions, type RushQuestion } from "@/lib/games/kanji-rush";
import { newPracticeRoundId, saveKanjiRound } from "@/lib/games/kanji-progress-store";
import { KanjiSyncStatus } from "./KanjiSyncStatus";

const library: KanjiLibrary = material;
const button = "min-h-12 rounded-xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600 disabled:cursor-not-allowed disabled:opacity-60";

export function KanjiRush({ initialLesson, onClose }: { initialLesson: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstChoice = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const locked = useRef(false);
  const roundId = useRef("");
  const remaining = useRef(60_000);
  const deadline = useRef<number | null>(null);
  const [lessonNumber, setLessonNumber] = useState(initialLesson);
  const [timed, setTimed] = useState(true);
  const [stage, setStage] = useState<"setup" | "play" | "results">("setup");
  const [questions, setQuestions] = useState<RushQuestion[]>([]);
  const [answers, setAnswers] = useState<QuestAnswer[]>([]);
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<QuestAnswer | null>(null);
  const [seconds, setSeconds] = useState(60);
  const [paused, setPaused] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [expired, setExpired] = useState(false);
  const lesson = library.lessons.find(item => item.number === lessonNumber)!;
  const available = useMemo(() => buildQuestDeck(lesson, "kanji"), [lesson]);
  const stats = questStats(answers);
  const question = questions[index];
  const missed = answers.filter(answer => !answer.correct).map(answer => answer.card);

  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element?.showModal(); document.body.style.overflow = "hidden";
    const hide = () => { if (document.hidden) setPaused(true); };
    document.addEventListener("visibilitychange", hide);
    return () => { document.removeEventListener("visibilitychange", hide); element?.close(); document.body.style.overflow = overflow; trigger?.focus(); };
  }, []);

  const finish = useCallback((timeUp = false) => {
    locked.current = true;
    saveKanjiRound({ id: roundId.current, lesson: lessonNumber, mode: "kanji", completed: answers.length === questions.length, answers });
    setExpired(timeUp); setStage("results");
  }, [answers, lessonNumber, questions.length]);

  // Only answering time counts. Feedback, pauses, and hidden tabs cost no time.
  useEffect(() => {
    if (stage !== "play" || !timed || paused || feedback) return;
    const end = performance.now() + remaining.current;
    deadline.current = end;
    const tick = () => {
      const left = Math.max(0, end - performance.now());
      setSeconds(Math.ceil(left / 1000));
      if (left === 0) { window.clearInterval(timer); finish(true); }
    };
    const timer = window.setInterval(tick, 100);
    return () => { window.clearInterval(timer); remaining.current = Math.max(0, end - performance.now()); deadline.current = null; };
  }, [stage, timed, paused, feedback, finish]);

  useEffect(() => {
    if (paused || confirmExit) return;
    if (stage === "results") heading.current?.focus({ preventScroll: true });
    else if (stage === "play") {
      if (feedback) nextButton.current?.focus({ preventScroll: true });
      else firstChoice.current?.focus({ preventScroll: true });
    }
    if (!feedback) content.current?.scrollTo({ top: 0 });
  }, [stage, index, feedback, paused, confirmExit]);

  function begin(cards = available, practice = false) {
    // Build choices from the full lesson even when replaying a single missed card.
    const ids = new Set(cards.map(card => card.id));
    setQuestions(buildRushQuestions(available).filter(item => ids.has(item.card.id)));
    roundId.current = newPracticeRoundId(); remaining.current = 60_000; deadline.current = null;
    setSeconds(60); setAnswers([]); setIndex(0); setFeedback(null); setPaused(false); setExpired(false);
    if (practice) setTimed(false);
    locked.current = false; setStage("play");
  }

  function choose(reading: string) {
    if (locked.current || paused || stage !== "play") return;
    if (deadline.current !== null && performance.now() >= deadline.current) { finish(true); return; }
    locked.current = true;
    const answer = { card: question.card, correct: question.card.answers.includes(reading), hinted: false, answer: reading };
    setAnswers(current => [...current, answer]); setFeedback(answer);
  }

  function advance() {
    if (index + 1 === questions.length) finish();
    else { setIndex(current => current + 1); setFeedback(null); locked.current = false; }
  }

  function close() {
    if (stage === "play") { setPaused(true); setConfirmExit(true); }
    else onClose();
  }

  function leave() {
    saveKanjiRound({ id: roundId.current, lesson: lessonNumber, mode: "kanji", completed: answers.length === questions.length, answers });
    onClose();
  }

  return <dialog ref={dialog} aria-labelledby="rush-title" onCancel={event => { event.preventDefault(); if (confirmExit) setConfirmExit(false); else close(); }} className="m-0 h-dvh max-h-dvh w-full max-w-none overflow-hidden border-0 bg-[#fffaf7] p-0 text-neutral-900 shadow-2xl backdrop:bg-neutral-950/50 backdrop:backdrop-blur-sm sm:m-auto sm:h-[min(850px,92dvh)] sm:max-h-[92dvh] sm:w-[calc(100%-2rem)] sm:max-w-2xl sm:rounded-3xl sm:border sm:border-pink-100">
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-pink-100 bg-white/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-7"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-pink-600">Learning Hub {stage !== "setup" && ` / Lesson ${lessonNumber}`}</p><h2 id="rush-title" className="text-xl font-semibold">Kanji Rush</h2></div><button type="button" onClick={close} aria-label="Close Kanji Rush" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-pink-100 bg-white text-2xl text-neutral-500 hover:bg-pink-50">×</button></header>
      <div ref={content} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 sm:px-7">
        {confirmExit ? <div className="mx-auto max-w-sm py-12 text-center" role="alert"><h3 className="text-2xl font-semibold">Finish for now?</h3><p className="mt-3 text-sm leading-6 text-neutral-600">Your checked readings will count toward your progress. Unanswered cards won’t count as misses.</p><button autoFocus type="button" onClick={() => { setConfirmExit(false); setPaused(false); }} className={`${button} mt-6 w-full bg-pink-600 text-white`}>Keep playing</button><button type="button" onClick={leave} className={`${button} mt-2 w-full border border-pink-200 bg-white text-pink-700`}>Save and leave</button></div>
        : stage === "setup" ? <div className="space-y-6">
          <div className="text-center"><RushEmblem /><p className="mt-3 text-xs font-bold uppercase tracking-widest text-pink-600">Quick eyes. Growing confidence.</p><h3 className="mt-2 text-3xl font-semibold">Find the reading. Keep the rhythm.</h3><p className="mt-3 text-sm leading-6 text-neutral-600">One kanji, four choices. Can you clear all 16?<br />Build a streak and earn 10 XP for every correct tap.</p></div>
          <div><label htmlFor="rush-lesson" className="mb-2 block text-sm font-semibold">Choose your lesson</label><select id="rush-lesson" value={lessonNumber} onChange={event => setLessonNumber(Number(event.target.value))} className="min-h-12 w-full rounded-xl border border-pink-200 bg-white px-3 text-base focus:outline-pink-500">{library.lessons.map(item => <option key={item.number} value={item.number}>Lesson {item.number} · {item.entries.slice(0, 5).map(entry => entry.character).join(" ")} …</option>)}</select></div>
          <fieldset><legend className="mb-2 text-sm font-semibold">Choose your pace</legend><div className="grid grid-cols-2 gap-3">{[true, false].map(value => <label key={String(value)} className={`cursor-pointer rounded-2xl border p-4 ${timed === value ? "border-pink-500 bg-pink-50 ring-1 ring-pink-500" : "border-neutral-200 bg-white"}`}><span className="flex items-center justify-between gap-2 text-sm font-semibold">{value ? "60-second Rush" : "Relaxed"}<input type="radio" name="rush-pace" checked={timed === value} onChange={() => setTimed(value)} className="h-4 w-4 accent-pink-600" /></span><span className="mt-2 block text-xs leading-5 text-neutral-500">{value ? "A little speed, a little spark." : "No timer. Take your time."}</span></label>)}</div></fieldset>
          <p className="rounded-xl bg-white p-4 text-xs leading-6 text-neutral-600">Choose a listed lesson reading, including kunyomi stems. The clock pauses while you review an answer or leave the tab. Finish or leave a round to save your checked readings.</p>
          <button type="button" onClick={() => begin()} className={`${button} w-full bg-neutral-900 text-white hover:bg-neutral-800`}>Start Rush · Lesson {lessonNumber} →</button>
        </div>
        : stage === "play" && question ? <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold"><span className="text-neutral-500">Card {index + 1} / {questions.length}</span><span className="rounded-full bg-amber-100 px-3 py-2 text-amber-900">{stats.points} XP · {stats.streak} streak</span><button type="button" onClick={() => setPaused(value => !value)} className="min-h-11 rounded-xl border border-pink-200 bg-white px-4 text-pink-700">{paused ? "Resume" : "Pause"}</button></div>
          <div className="flex items-center justify-between gap-3 text-xs text-neutral-500"><span>{timed ? feedback || paused ? "Clock paused" : "Answering time left" : "Relaxed round"}</span><span role="timer" aria-label="Time remaining" data-testid="rush-timer" className={`text-xl font-semibold tabular-nums ${timed && seconds <= 10 ? "text-rose-600" : "text-neutral-700"}`}>{timed ? `${seconds}s` : "Untimed"}</span></div>
          {timed && <progress aria-label="Answering time remaining" max={60} value={seconds} className="h-2 w-full appearance-none overflow-hidden rounded-full [&::-moz-progress-bar]:bg-pink-500 [&::-webkit-progress-bar]:bg-pink-100 [&::-webkit-progress-value]:bg-pink-500" />}
          {paused ? <div className="rounded-3xl border border-pink-200 bg-white px-5 py-14 text-center"><h3 className="text-3xl font-semibold">Take a breath.</h3><p className="mt-3 text-sm text-neutral-500">Your round is right here when you’re ready.</p><button autoFocus type="button" onClick={() => setPaused(false)} className={`${button} mt-6 bg-pink-600 text-white`}>Resume round</button></div> : <>
            <div className={`rounded-3xl border bg-white px-4 py-5 text-center shadow-sm ${feedback ? feedback.correct ? "border-emerald-300" : "border-amber-300" : "border-pink-200"}`} style={{ backgroundImage: "radial-gradient(#fce7f3 1px, transparent 1px)", backgroundSize: "16px 16px" }}><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Tap the matching reading</p><p lang="ja" data-testid="rush-prompt" className="my-4 font-serif text-8xl leading-tight text-neutral-800 sm:text-9xl">{question.card.prompt}</p></div>
            <div className="grid grid-cols-2 gap-3">{question.choices.map((choice, i) => {
              const correct = question.card.answers.includes(choice);
              const selected = feedback?.answer === choice;
              return <button ref={i === 0 ? firstChoice : undefined} key={`${question.card.id}:${choice}`} type="button" disabled={!!feedback} onClick={() => choose(choice)} lang="ja" className={`min-h-20 break-all rounded-2xl border-2 px-3 py-4 text-xl font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600 sm:text-2xl ${feedback && correct ? "border-emerald-400 bg-emerald-50 text-emerald-900" : feedback && selected ? "border-amber-400 bg-amber-50 text-amber-900" : "border-pink-100 bg-white text-neutral-800 enabled:hover:border-pink-400 enabled:hover:bg-pink-50 enabled:active:scale-[0.98] motion-reduce:transform-none"}`}>{choice}{feedback && (correct || selected) && <span lang="en" className="mt-1 block text-[10px] font-medium">{correct ? "Correct reading" : "Your choice"}</span>}</button>;
            })}</div>
            {feedback && <div className="space-y-3"><div role="status" className={`rounded-2xl p-4 ${feedback.correct ? "bg-emerald-50 text-emerald-950" : "bg-amber-50 text-amber-950"}`}><p className="text-lg font-semibold">{feedback.correct ? stats.streak >= 3 ? `${stats.streak} in a row! Keep that rhythm.` : "That’s it! +10 XP" : "A new reading to remember."}</p><p lang="ja" className="mt-2 break-words text-lg">{question.card.answers.join(" / ")}</p><p className="mt-1 text-sm">{question.card.meaning}</p>{!feedback.correct && <p className="mt-2 text-xs">Added to your practice pile. No XP lost.</p>}</div><button ref={nextButton} type="button" onClick={advance} className={`${button} w-full bg-neutral-900 text-white hover:bg-neutral-800`}>{index + 1 === questions.length ? "See Rush results →" : "Next kanji →"}</button></div>}
          </>}
        </div>
        : stage === "results" ? <div className="space-y-5">
          <div className="text-center"><RushEmblem /><p className="mt-3 text-xs font-semibold uppercase tracking-widest text-pink-600">Lesson {lessonNumber} · {expired ? "Time’s up" : "Round complete"}</p><h3 ref={heading} tabIndex={-1} className="mt-2 text-3xl font-semibold outline-none">{stats.correct === questions.length ? "You found your flow." : stats.correct ? "A little faster. A little stronger." : "Your next round starts here."}</h3><p className="mt-3 text-sm leading-6 text-neutral-500">{answers.length} of {questions.length} cards tried. {expired ? "Unanswered cards don’t count as misses." : "Every attempt helps the next reading feel more familiar."}</p></div>
          <dl className="grid grid-cols-3 gap-2 text-center">{[["Accuracy", answers.length ? `${Math.round(stats.correct / answers.length * 100)}%` : "—"], ["XP earned", stats.points], ["Best streak", stats.bestStreak]].map(([label, value]) => <div key={label} className="rounded-2xl border border-pink-100 bg-white px-2 py-4"><dt className="text-[11px] text-neutral-500">{label}</dt><dd className="mt-1 text-2xl font-semibold text-pink-800">{value}</dd></div>)}</dl>
          {answers.length ? <KanjiSyncStatus /> : <p className="text-center text-xs text-neutral-500">Answer a card next round to start earning progress.</p>}
          {missed.length > 0 && <button type="button" onClick={() => begin(missed, true)} className={`${button} w-full bg-pink-600 text-white`}>Practice {missed.length} missed {missed.length === 1 ? "card" : "cards"} · untimed →</button>}
          <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => begin()} className={`${button} border border-pink-200 bg-white text-pink-700`}>Play again</button><button type="button" onClick={() => setStage("setup")} className={`${button} border border-pink-200 bg-white text-pink-700`}>Choose lesson</button></div>
          {!!answers.length && <details className="rounded-2xl border border-neutral-200 bg-white"><summary className="min-h-12 cursor-pointer p-4 text-sm font-semibold">Review your {answers.length} readings</summary><ul className="divide-y divide-neutral-100 px-4">{answers.map(answer => <li key={answer.card.id} className="py-3"><div className="flex items-center justify-between gap-3"><span lang="ja" className="font-serif text-2xl">{answer.card.prompt}</span><span className={`rounded-full px-2 py-1 text-xs ${answer.correct ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{answer.correct ? "Correct" : "Practice"}</span></div><p lang="ja" className="mt-1 break-words text-sm text-pink-700">{answer.card.answers.join(" / ")}</p><p className="mt-1 text-xs text-neutral-500">{answer.card.meaning}</p></li>)}</ul></details>}
        </div> : null}
      </div>
    </div>
  </dialog>;
}

function RushEmblem() {
  return <svg aria-hidden="true" viewBox="0 0 120 100" className="mx-auto h-24 w-28"><path d="M8 32h24M3 50h20M12 68h20" stroke="#f9a8d4" strokeWidth="4" strokeLinecap="round" /><circle cx="72" cy="50" r="37" fill="#fff1f2" stroke="#f472b6" strokeWidth="2" /><circle cx="72" cy="50" r="29" fill="white" stroke="#fbcfe8" strokeWidth="2" /><path d="m77 25-23 30h18l-5 22 24-32H73z" fill="#fbbf24" stroke="#d97706" strokeWidth="1.5" strokeLinejoin="round" /></svg>;
}
