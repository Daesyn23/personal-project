"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import material from "@/data/kanji-lessons.json";
import mnemonicData from "@/data/kanji-mnemonics.json";
import type { KanjiLibrary } from "@/lib/kanji-learning";
import type { KanjiMnemonic } from "@/lib/kanji-mnemonic-types";
import { acceptsQuestAnswer, buildQuestDeck, questReading, questStats, type QuestAnswer, type QuestCard, type QuestMode } from "@/lib/games/kanji-quest";
import { HiraganaHandwritingPad, emptyHandwriting } from "@/components/games/HiraganaHandwritingPad";
import { shuffleArray } from "@/lib/shuffle-array";
import { newPracticeRoundId, saveKanjiRound } from "@/lib/games/kanji-progress-store";
import { KanjiSyncStatus } from "./KanjiSyncStatus";

const library: KanjiLibrary = material;
const mnemonics: Record<string, KanjiMnemonic> = mnemonicData;
const button = "min-h-12 rounded-xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600 disabled:cursor-not-allowed disabled:opacity-40";

export function KanjiQuest({ initialLesson, onClose }: { initialLesson: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const composing = useRef(false);
  const locked = useRef(false);
  const roundId = useRef("");
  const recognitionRequest = useRef<AbortController | null>(null);
  const [answerMethod, setAnswerMethod] = useState<"type" | "write">("type");
  const [drawing, setDrawing] = useState(emptyHandwriting);
  const [recognizing, setRecognizing] = useState(false);
  const [recognitionError, setRecognitionError] = useState("");
  const [lessonNumber, setLessonNumber] = useState(initialLesson);
  const [mode, setMode] = useState<QuestMode>("kanji");
  const [length, setLength] = useState(16);
  const [stage, setStage] = useState<"setup" | "play" | "results">("setup");
  const [deck, setDeck] = useState<QuestCard[]>([]);
  const [answers, setAnswers] = useState<QuestAnswer[]>([]);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [hinted, setHinted] = useState(false);
  const [feedback, setFeedback] = useState<QuestAnswer | null>(null);
  const [retry, setRetry] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const lesson = library.lessons.find(item => item.number === lessonNumber)!;
  const available = useMemo(() => buildQuestDeck(lesson, mode), [lesson, mode]);
  const stats = questStats(answers);
  const card = deck[index];
  const hiragana = questReading(value);
  const missed = answers.filter(answer => !answer.correct).map(answer => answer.card);

  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    setAnswerMethod(window.matchMedia("(pointer: coarse)").matches ? "write" : "type");
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; trigger?.focus(); };
  }, []);

  useEffect(() => {
    return () => { recognitionRequest.current?.abort(); };
  }, [stage, index, answerMethod, confirmExit]);

  useEffect(() => {
    if (confirmExit) return;
    if (stage === "play") {
      if (feedback) next.current?.focus({ preventScroll: true });
      else if (window.matchMedia("(pointer: fine)").matches) input.current?.focus({ preventScroll: true });
    } else if (stage === "results") resultHeading.current?.focus({ preventScroll: true });
    if (!feedback) content.current?.scrollTo({ top: 0 });
  }, [stage, index, feedback, confirmExit, answerMethod]);

  function begin(cards: QuestCard[], isRetry = false) {
    roundId.current = newPracticeRoundId();
    setDeck(shuffleArray(cards).slice(0, isRetry ? cards.length : length));
    setAnswers([]); setIndex(0); setValue(""); setHinted(false); setFeedback(null);
    setDrawing(emptyHandwriting()); setRecognitionError("");
    setRetry(isRetry); setStage("play"); locked.current = false; composing.current = false;
  }

  function check(skip = false, reading = value, handwritten = false) {
    if (locked.current || composing.current || (!skip && !reading.trim())) return;
    locked.current = true;
    const answer = { card, correct: !skip && acceptsQuestAnswer(card, reading), hinted, answer: skip ? "" : questReading(reading), handwritten };
    setAnswers(current => [...current, answer]);
    setFeedback(answer);
    input.current?.blur();
  }

  async function checkHandwriting(image: string) {
    if (locked.current || recognitionRequest.current) return;
    const controller = new AbortController();
    recognitionRequest.current = controller;
    setRecognizing(true); setRecognitionError("");
    const timeout = window.setTimeout(() => controller.abort("timeout"), 50_000);
    try {
      const response = await fetch("/api/japanese/handwriting", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }), signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Please try reading your handwriting again.");
      if (typeof result.reading !== "string" || !/^[ぁ-ゖー]{1,48}$/u.test(result.reading)) throw new Error("I couldn’t read that clearly. Please try again.");
      check(false, result.reading, true);
    } catch (error) {
      if (!controller.signal.aborted) setRecognitionError(error instanceof Error ? error.message : "Handwriting couldn’t be read. Please try again.");
      else if (controller.signal.reason === "timeout") setRecognitionError("That took too long. Try again or switch to Type. Your score hasn’t changed.");
    } finally {
      window.clearTimeout(timeout);
      if (recognitionRequest.current === controller) {
        recognitionRequest.current = null;
        setRecognizing(false);
      }
    }
  }

  function rewriteHandwriting() {
    // Undo the entire grading event, including its points and streak effect.
    setAnswers(current => current.slice(0, -1));
    setFeedback(null); setRecognitionError(""); locked.current = false;
  }

  function answerMethodPicker() {
    return <div className="flex rounded-xl bg-pink-100/60 p-1" aria-label="Answer method">
      {(["write", "type"] as const).map(method => <button key={method} type="button" disabled={recognizing} aria-pressed={answerMethod === method} onClick={() => { setAnswerMethod(method); setRecognitionError(""); composing.current = false; }} className={`min-h-11 flex-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${answerMethod === method ? "bg-white text-pink-700 shadow-sm" : "text-neutral-500"}`}>{method === "write" ? "Write" : "Type"}</button>)}
    </div>;
  }

  function advance() {
    setDrawing(emptyHandwriting()); setRecognitionError("");
    if (index + 1 === deck.length) { saveProgress(); setStage("results"); }
    else { setIndex(current => current + 1); setValue(""); setHinted(false); setFeedback(null); locked.current = false; }
  }

  function saveProgress() {
    saveKanjiRound({ id: roundId.current, lesson: lessonNumber, mode, completed: answers.length === deck.length, answers });
  }

  function close() {
    if (stage === "play") setConfirmExit(true);
    else onClose();
  }

  return <dialog ref={dialog} aria-labelledby="quest-title" onCancel={event => { event.preventDefault(); if (confirmExit) setConfirmExit(false); else close(); }} className="m-0 h-dvh max-h-dvh w-full max-w-none overflow-hidden border-0 bg-[#fffaf7] p-0 text-neutral-900 shadow-2xl backdrop:bg-neutral-950/50 backdrop:backdrop-blur-sm sm:m-auto sm:h-[min(850px,92dvh)] sm:max-h-[92dvh] sm:w-[calc(100%-2rem)] sm:max-w-2xl sm:rounded-3xl sm:border sm:border-pink-100">
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-pink-100 bg-white/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-7">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-pink-600">Learning Hub {stage !== "setup" && ` / Lesson ${lessonNumber}`}</p><h2 id="quest-title" className="text-xl font-semibold">Kanji Quest</h2></div>
        <button type="button" onClick={close} aria-label="Close Kanji Quest" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-pink-100 bg-white text-2xl text-neutral-500 hover:bg-pink-50">×</button>
      </header>
      {confirmExit ? <div className="m-auto w-full max-w-sm p-6 text-center" role="alert">
        <h3 className="text-xl font-semibold">Leave this round?</h3><p className="mt-3 text-sm leading-6 text-neutral-600">Your checked readings will count toward your progress. You can start a fresh quest anytime.</p>
        <button type="button" autoFocus onClick={() => setConfirmExit(false)} className={`${button} mt-6 w-full bg-pink-600 text-white`}>Keep playing</button>
        <button type="button" onClick={() => { saveProgress(); onClose(); }} className={`${button} mt-2 w-full border border-pink-200 bg-white text-pink-700`}>Leave round</button>
      </div> : <div ref={content} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 sm:px-7">
        {stage === "setup" && <div className="space-y-6">
          <div className="text-center"><div aria-hidden="true" className="mx-auto flex w-fit items-center gap-3"><span lang="ja" className="rotate-[-6deg] rounded-2xl border border-pink-200 bg-white px-5 py-3 font-serif text-5xl text-pink-900 shadow-sm">学</span><span className="text-pink-400">→</span><span lang="ja" className="rotate-[4deg] rounded-2xl bg-pink-100 px-5 py-4 text-3xl text-pink-800">がく</span></div><h3 className="mt-5 text-2xl font-semibold">Turn recognition into recall.</h3><p className="mt-2 text-sm leading-6 text-neutral-600">A little challenge, one reading at a time.<br />No timer. Just you and your next breakthrough.</p></div>
          <div><label htmlFor="quest-lesson" className="mb-2 block text-sm font-semibold">Choose your lesson</label><select id="quest-lesson" value={lessonNumber} onChange={event => setLessonNumber(Number(event.target.value))} className="min-h-12 w-full rounded-xl border border-pink-200 bg-white px-3 text-base focus:outline-pink-500">{library.lessons.map(item => <option key={item.number} value={item.number}>Lesson {item.number} · {item.entries.slice(0, 5).map(entry => entry.character).join(" ")} …</option>)}</select></div>
          <fieldset><legend className="mb-2 text-sm font-semibold">Your challenge</legend><div className="grid grid-cols-2 gap-3">{(["kanji", "vocabulary"] as const).map(item => <label key={item} className={`cursor-pointer rounded-2xl border p-3 ${mode === item ? "border-pink-500 bg-pink-50 ring-1 ring-pink-500" : "border-neutral-200 bg-white"}`}><span className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{item === "kanji" ? "Kanji" : "Vocabulary"}</span><input type="radio" name="quest-mode" value={item} checked={mode === item} onChange={() => setMode(item)} className="h-4 w-4 accent-pink-600" /></span><span lang="ja" className="mt-2 block font-serif text-2xl">{item === "kanji" ? "日" : "日本"}</span><span className="mt-1 block text-xs leading-5 text-neutral-500">{item === "kanji" ? "One character. Any listed reading." : "Whole words from this lesson."}</span></label>)}</div></fieldset>
          <fieldset><legend className="mb-2 text-sm font-semibold">Round length</legend><div className="flex gap-2">{[8, 16].map(size => <label key={size} className={`flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-sm ${length === size ? "border-pink-400 bg-pink-50 text-pink-800" : "border-neutral-200 bg-white"}`}><input type="radio" name="quest-length" checked={length === size} onChange={() => setLength(size)} className="accent-pink-600" />{size === 8 ? "Quick 8" : "Full 16"}</label>)}</div></fieldset>
          <div><p className="mb-2 text-sm font-semibold">Answer with</p>{answerMethodPicker()}</div>
          <p className="rounded-xl bg-white p-3 text-xs leading-6 text-neutral-600">Write hiragana with your finger, or type hiragana or romaji, then press <strong>Done</strong>. Earn <strong>10 points</strong> per correct reading, or <strong>5</strong> with a story hint. Missed cards become your own practice round.</p>
          <p className="text-xs leading-5 text-neutral-500">Your points become XP. Finish or leave a round to save your checked readings to your learning journey.</p>
          <button type="button" disabled={!available.length} onClick={() => begin(available)} className={`${button} w-full bg-pink-600 text-white shadow-lg shadow-pink-200/50 hover:bg-pink-700`}>Start Lesson {lessonNumber} · {Math.min(length, available.length)} cards →</button>
        </div>}

        {stage === "play" && card && <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-semibold text-neutral-500"><span>{retry ? "Practice round" : mode === "kanji" ? "Kanji readings" : "Vocabulary"} · {index + 1} / {deck.length}</span><span className="rounded-full bg-amber-100 px-3 py-1.5 text-amber-900">{stats.points} points · {stats.streak} streak</span></div>
          <div role="progressbar" aria-label="Round progress" aria-valuemin={0} aria-valuemax={deck.length} aria-valuenow={answers.length} className="flex gap-1">{deck.map((item, i) => <span key={item.id} className={`h-1.5 min-w-0 flex-1 rounded-full transition-colors motion-reduce:transition-none ${answers[i] ? answers[i].correct ? "bg-emerald-500" : "bg-amber-400" : i === index ? "bg-pink-400" : "bg-pink-100"}`} />)}</div>
          <div key={card.id} className={`relative overflow-hidden rounded-3xl border bg-white px-4 text-center shadow-sm ${answerMethod === "write" && !feedback ? "py-3" : "py-5 sm:py-8"} ${feedback ? feedback.correct ? "border-emerald-300" : "border-amber-300" : "border-pink-200"}`}>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-50" style={{ backgroundImage: "linear-gradient(#fce7f3 1px, transparent 1px), linear-gradient(90deg, #fce7f3 1px, transparent 1px)", backgroundSize: "32px 32px", maskImage: "linear-gradient(to bottom, black, transparent)" }} />
            <p className="relative text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">{mode === "kanji" ? "How do you read this kanji?" : "How do you read this word?"}</p>
            <p lang="ja" data-testid="quest-prompt" className={`relative my-4 break-words font-serif leading-tight text-neutral-800 [overflow-wrap:anywhere] ${answerMethod === "write" && !feedback ? "text-5xl" : card.prompt.length === 1 ? "text-8xl sm:text-9xl" : card.prompt.length < 5 ? "text-5xl sm:text-6xl" : "text-4xl sm:text-5xl"}`}>{card.prompt}</p>
            <p className="relative text-xs leading-5 text-neutral-500">{mode === "kanji" ? "Any lesson reading counts, including kunyomi stems." : "Write the reading of the whole word."}</p>
          </div>
          {!feedback ? <>
            {answerMethodPicker()}
            {answerMethod === "write" ? <HiraganaHandwritingPad drawing={drawing} onChange={draft => { setDrawing(draft); setRecognitionError(""); }} busy={recognizing} onDone={checkHandwriting} /> : <form onSubmit={event => { event.preventDefault(); check(); }} className="space-y-3">
              <label htmlFor="quest-answer" className="block text-sm font-semibold">Your reading</label>
              <input ref={input} id="quest-answer" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="done" value={value} onChange={event => setValue(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => { if (event.key === "Enter" && (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault(); }} aria-describedby="quest-input-help quest-preview" placeholder="Type your answer…" className="min-h-14 w-full rounded-2xl border-2 border-pink-200 bg-white px-4 py-3 text-center text-xl outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100" />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><p id="quest-input-help" className="text-neutral-500">Hiragana or romaji · e.g. neko → ねこ</p><p id="quest-preview" className="min-h-5 break-all font-medium text-pink-700">Your hiragana: <span lang="ja">{hiragana || "…"}</span></p></div>
              <button type="submit" disabled={!value.trim()} className={`${button} w-full bg-pink-600 text-white shadow-sm hover:bg-pink-700`}>Done</button>
            </form>}
            {recognizing && <p role="status" className="text-sm text-pink-700">Reading your handwriting…</p>}
            {recognitionError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">{recognitionError}</p>}
            <div className="flex justify-between gap-2"><button type="button" disabled={hinted || recognizing} onClick={() => setHinted(true)} className={`${button} border border-pink-200 bg-white text-pink-700`}>{hinted ? "Hint revealed" : "Story hint · 5 points"}</button><button type="button" disabled={recognizing} onClick={() => check(true)} className={`${button} text-neutral-500 hover:bg-white`}>Reveal answer</button></div>
            {hinted && <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><p className="font-semibold">Meaning: {card.meaning}</p><p className="mt-2"><span lang="ja">{card.character}</span> · {mnemonics[card.character]?.story}</p></div>}
          </> : <div className="space-y-3">
            <div role="status" className={`rounded-2xl border p-4 ${feedback.correct ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
              <p className="text-lg font-semibold">{feedback.correct ? stats.streak >= 3 ? `Correct! ${stats.streak} in a row.` : "Correct! Nicely read." : feedback.answer ? "Not quite — let’s remember this one." : "A new reading to remember."}</p>
              <p className="mt-1 text-xs">{feedback.correct ? `+${hinted ? 5 : 10} points${hinted ? " · with a hint" : ""}` : "Added to your practice pile. No points lost."}</p>
              {feedback.handwritten && <div className="mt-3 rounded-xl bg-white/70 p-3"><p className="text-xs font-semibold">Read your handwriting as</p><p lang="ja" className="mt-1 break-words text-2xl">{feedback.answer}</p><button type="button" onClick={rewriteHandwriting} className="mt-2 min-h-11 text-sm font-semibold underline underline-offset-4">Misread? Rewrite without penalty</button></div>}
              {!feedback.handwritten && !feedback.correct && feedback.answer && <p className="mt-3 break-words text-sm">You wrote: <span lang="ja">{feedback.answer}</span></p>}
              <p className="mt-3 text-xs font-semibold">{mode === "kanji" ? "Accepted lesson readings" : "Accepted readings"}</p><p lang="ja" className="mt-1 break-words text-xl">{card.answers.join(" / ")}</p><p className="mt-2 text-sm">{card.meaning}</p>
              {!feedback.correct && <p className="mt-3 border-t border-amber-200 pt-3 text-sm leading-6">{mnemonics[card.character]?.story}</p>}
            </div>
            <button ref={next} type="button" onClick={advance} className={`${button} w-full bg-neutral-900 text-white hover:bg-neutral-800`}>{index + 1 === deck.length ? "See my results →" : mode === "kanji" ? "Next kanji →" : "Next word →"}</button>
          </div>}
        </div>}

        {stage === "results" && <div className="space-y-5">
          <div className="text-center"><QuestMedal perfect={stats.correct === deck.length} /><p className="mt-2 text-xs font-semibold uppercase tracking-widest text-pink-600">Lesson {lessonNumber} · {retry ? "Practice complete" : "Quest complete"}</p><h3 ref={resultHeading} tabIndex={-1} className="mt-2 text-3xl font-semibold outline-none">{stats.correct === deck.length ? "A perfect little quest." : stats.correct >= deck.length / 2 ? "Your practice is paying off." : "Every reading is a new start."}</h3><p className="mt-3 text-sm leading-6 text-neutral-500">{missed.length ? "Take your new discoveries into one more round." : "You read every card correctly. Ready for another lesson?"}</p></div>
          <dl className="grid grid-cols-3 gap-2 text-center">{[["Correct", `${stats.correct}/${deck.length}`], ["Points", stats.points], ["Best streak", stats.bestStreak]].map(([label, score]) => <div key={label} className="rounded-2xl border border-pink-100 bg-white px-2 py-4"><dt className="text-[11px] text-neutral-500">{label}</dt><dd className="mt-1 text-2xl font-semibold text-pink-800">{score}</dd></div>)}</dl>
          <p className="text-center text-xs text-pink-700">+{stats.points} XP added to your learning journey</p><KanjiSyncStatus />
          {missed.length > 0 && <button type="button" onClick={() => begin(missed, true)} className={`${button} w-full bg-pink-600 text-white hover:bg-pink-700`}>Practice {missed.length} missed {missed.length === 1 ? "card" : "cards"} →</button>}
          <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => begin(available)} className={`${button} border border-pink-200 bg-white text-pink-700`}>Play again</button><button type="button" onClick={() => setStage("setup")} className={`${button} border border-pink-200 bg-white text-pink-700`}>Choose lesson</button></div>
          <details className="rounded-2xl border border-neutral-200 bg-white"><summary className="cursor-pointer px-4 py-4 text-sm font-semibold">Review your {answers.length} readings</summary><ul className="divide-y divide-neutral-100 px-4">{answers.map(answer => <li key={answer.card.id} className="py-3"><div className="flex items-start justify-between gap-3"><span lang="ja" className="break-all font-serif text-2xl">{answer.card.prompt}</span><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${answer.correct ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{answer.correct ? answer.hinted ? "With hint" : "Correct" : "Practice"}</span></div><p lang="ja" className="mt-1 break-words text-sm text-pink-700">{answer.card.answers.join(" / ")}</p><p className="mt-1 text-xs text-neutral-500">{answer.card.meaning}</p></li>)}</ul></details>
        </div>}
      </div>}
    </div>
  </dialog>;
}

function QuestMedal({ perfect }: { perfect: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 120 104" className="mx-auto h-24 w-28 text-pink-500"><path d="m41 67-7 33 26-13 26 13-7-33" fill="#fbcfe8" stroke="currentColor" strokeWidth="2" /><circle cx="60" cy="43" r="36" fill="#fff1f2" stroke="currentColor" strokeWidth="2" /><circle cx="60" cy="43" r="28" fill="white" stroke="#fbcfe8" strokeWidth="2" />{perfect ? <path d="m60 23 6 13 15 2-11 10 3 15-13-7-13 7 3-15-11-10 15-2z" fill="#fbbf24" stroke="#d97706" strokeWidth="1.5" /> : <path d="m45 43 10 10 20-23" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />}<path d="M12 25v8m-4-4h8m88 29v8m-4-4h8M96 12l4 4M18 70l-4 4" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" /></svg>;
}
