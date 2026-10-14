"use client";

import { useEffect, useRef, useState } from "react";
import material from "@/data/kanji-lessons.json";
import { buildQuestDeck, questReading, questStats, type QuestAnswer } from "@/lib/games/kanji-quest";
import { acceptsListeningAnswer, buildListeningQuestions, type ListeningQuestion } from "@/lib/games/kanji-listening";
import { cancelSpeechSynthesis, getJapaneseVoices, speakJapaneseLine } from "@/lib/japanese-tts";
import { newPracticeRoundId, saveKanjiRound } from "@/lib/games/kanji-progress-store";
import { HiraganaHandwritingPad, emptyHandwriting } from "./HiraganaHandwritingPad";
import { KanjiSyncStatus } from "./KanjiSyncStatus";

const button = "min-h-12 rounded-xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600 disabled:cursor-not-allowed disabled:opacity-40";
type Method = "write" | "type" | "choose";

export function KanjiListening({ initialLesson, onClose }: { initialLesson: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const round = useRef("");
  const locked = useRef(false);
  const composing = useRef(false);
  const audioEpoch = useRef(0);
  const recognition = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const [lesson, setLesson] = useState(initialLesson);
  const [length, setLength] = useState(8);
  const [method, setMethod] = useState<Method>("choose");
  const [questions, setQuestions] = useState<ListeningQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<"setup" | "play" | "results">("setup");
  const [answers, setAnswers] = useState<QuestAnswer[]>([]);
  const [feedback, setFeedback] = useState<QuestAnswer | null>(null);
  const [heard, setHeard] = useState(false);
  const [error, setError] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [drawing, setDrawing] = useState(emptyHandwriting);
  const [value, setValue] = useState("");
  const question = questions[index];
  const stats = questStats(answers);
  const missed = questions.filter(item => answers.some(answer => answer.card.id === item.card.id && !answer.correct));

  useEffect(() => {
    const audio = audioEpoch;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const element = dialog.current;
    if (window.matchMedia("(pointer: coarse)").matches) setMethod("write");
    getJapaneseVoices(); element?.showModal(); document.body.style.overflow = "hidden";
    return () => {
      audio.current++; recognition.current?.abort(); cancelSpeechSynthesis();
      element?.close(); document.body.style.overflow = overflow; trigger?.focus();
    };
  }, []);
  useEffect(() => { if (!confirmExit) { if (feedback) next.current?.focus(); else heading.current?.focus(); } }, [stage, index, feedback, confirmExit]);

  function stopAudio() { audioEpoch.current++; cancelSpeechSynthesis(); setSpeaking(false); }
  function play(slow = false) {
    setError("");
    if (!getJapaneseVoices().length) { setError("No Japanese voice is available yet. Enable a Japanese voice in your device’s speech settings, then try Replay."); return; }
    const epoch = ++audioEpoch.current;
    setSpeaking(true);
    speakJapaneseLine(question.reading, "reading", { rate: slow ? 0.6 : 0.9,
      onEnd: () => { if (epoch === audioEpoch.current) { setSpeaking(false); setHeard(true); } },
      onError: () => { if (epoch === audioEpoch.current) { setSpeaking(false); setError("Audio couldn’t play. Tap Replay to try again."); } },
    });
  }
  function resetAnswer() { setFeedback(null); setHeard(false); setError(""); setDrawing(emptyHandwriting()); setValue(""); locked.current = false; composing.current = false; }
  function begin(cards?: ListeningQuestion[]) {
    const deck = cards ?? buildListeningQuestions(buildQuestDeck(material.lessons.find(item => item.number === lesson)!, "vocabulary"), Math.random, length);
    if (!deck.length) { setError("Choose a lesson with more distinct vocabulary."); return; }
    stopAudio(); round.current = newPracticeRoundId(); setQuestions(deck); setIndex(0); setAnswers([]); resetAnswer(); setStage("play");
  }
  function grade(answer: string, correct: boolean, handwritten = false) {
    if (locked.current || !heard) return;
    locked.current = true;
    const result = { card: question.card, answer, correct, hinted: false, handwritten };
    setAnswers(previous => [...previous, result]); setFeedback(result); stopAudio();
  }
  async function checkHandwriting(image: string) {
    if (locked.current || recognition.current || !heard) return;
    const controller = new AbortController(); recognition.current = controller;
    setRecognizing(true); setError("");
    const timer = window.setTimeout(() => controller.abort("timeout"), 50_000);
    try {
      const response = await fetch("/api/japanese/handwriting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }), signal: controller.signal });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Couldn’t read your handwriting. Try again.");
      if (typeof result.reading !== "string" || !/^[ぁ-ゖー]{1,48}$/u.test(result.reading)) throw new Error("I couldn’t read that clearly. Please try again.");
      grade(result.reading, acceptsListeningAnswer(question, result.reading), true);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Couldn’t read your handwriting. Try again.");
      else if (controller.signal.reason === "timeout") setError("That took too long. Try again or switch to Type. Your score hasn’t changed.");
    } finally {
      window.clearTimeout(timer);
      if (recognition.current === controller) { recognition.current = null; setRecognizing(false); }
    }
  }
  function rewrite() { setAnswers(previous => previous.slice(0, -1)); setFeedback(null); setError(""); locked.current = false; }
  function save() { saveKanjiRound({ id: round.current, lesson, mode: "vocabulary", completed: answers.length === questions.length, answers }); }
  function advance() {
    stopAudio();
    if (index + 1 === questions.length) { save(); setStage("results"); }
    else { setIndex(previous => previous + 1); resetAnswer(); }
  }
  function close() {
    stopAudio(); recognition.current?.abort(); recognition.current = null; setRecognizing(false);
    if (stage === "play") setConfirmExit(true); else onClose();
  }
  function methodPicker() {
    return <div className="flex rounded-xl bg-pink-100/60 p-1" aria-label="Answer method">{(["write", "type", "choose"] as const).map(item => <button key={item} type="button" disabled={recognizing} aria-pressed={method === item} onClick={() => { setMethod(item); setError(""); composing.current = false; }} className={`min-h-11 min-w-0 flex-1 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${method === item ? "bg-white text-pink-700 shadow-sm" : "text-neutral-500"}`}>{item === "write" ? "Write" : item === "type" ? "Type" : "Choose"}</button>)}</div>;
  }

  return <dialog ref={dialog} aria-labelledby="listening-title" onCancel={event => { event.preventDefault(); if (confirmExit) setConfirmExit(false); else close(); }} className="m-0 h-dvh max-h-dvh w-full max-w-none overflow-hidden border-0 bg-[#fffaf7] p-0 text-neutral-900 shadow-2xl backdrop:bg-neutral-950/50 backdrop:backdrop-blur-sm sm:m-auto sm:h-[min(850px,92dvh)] sm:max-h-[92dvh] sm:w-[calc(100%-2rem)] sm:max-w-2xl sm:rounded-3xl sm:border sm:border-pink-100">
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-pink-100 bg-white/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-7"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-pink-600">Learning Hub {stage !== "setup" && `/ Lesson ${lesson}`}</p><h2 id="listening-title" className="text-xl font-semibold">Listening Quest</h2></div><button type="button" aria-label="Close Listening Quest" onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-pink-100 bg-white text-2xl text-neutral-500 hover:bg-pink-50">×</button></header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 sm:px-7">
        {confirmExit ? <div className="mx-auto max-w-sm space-y-4 py-12 text-center" role="alert"><h3 className="text-2xl font-semibold">Finish for now?</h3><p className="text-sm leading-6 text-neutral-600">Your checked answers will count toward your progress. Unanswered words won’t count as misses.</p><button type="button" autoFocus onClick={() => setConfirmExit(false)} className={`${button} w-full bg-pink-600 text-white`}>Keep listening</button><button type="button" onClick={() => { save(); onClose(); }} className={`${button} w-full border border-pink-200 bg-white text-pink-700`}>Save and leave</button></div> : stage === "setup" ? <>
          <div className="text-center"><span aria-hidden="true" lang="ja" className="mx-auto flex h-24 w-24 rotate-[-6deg] items-center justify-center rounded-2xl border border-pink-200 bg-white font-serif text-6xl text-pink-900 shadow-sm">聞</span><p className="mt-5 text-xs font-bold uppercase tracking-widest text-pink-600">A little listening, every day</p><h3 ref={heading} tabIndex={-1} className="mt-2 text-3xl font-semibold outline-none">Hear it. Write it. Remember it.</h3><p className="mt-3 text-sm leading-6 text-neutral-600">Hear a word from your lesson. Write its hiragana with your finger, type it, or choose its kanji. No timer. Replay whenever you like.</p></div>
          <div><label htmlFor="listening-lesson" className="mb-2 block text-sm font-semibold">Choose your lesson</label><select id="listening-lesson" value={lesson} onChange={event => setLesson(Number(event.target.value))} className="min-h-12 w-full rounded-xl border border-pink-200 bg-white px-3 text-base focus:outline-pink-500">{material.lessons.map(item => <option key={item.number} value={item.number}>Lesson {item.number} · {item.entries.slice(0, 5).map(entry => entry.character).join(" ")} …</option>)}</select></div>
          <fieldset><legend className="mb-2 text-sm font-semibold">Round length</legend><div className="flex gap-2">{[8, 16].map(size => <label key={size} className={`flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-sm ${length === size ? "border-pink-400 bg-pink-50 text-pink-800" : "border-neutral-200 bg-white"}`}><input type="radio" name="listening-length" checked={length === size} onChange={() => setLength(size)} className="accent-pink-600" />{size === 8 ? "Quick 8" : "Full 16"}</label>)}</div></fieldset>
          <div><p className="mb-2 text-sm font-semibold">Answer with</p>{methodPicker()}</div>
          <p className="rounded-xl bg-white p-4 text-xs leading-6 text-neutral-600">Use your device’s Japanese voice. Listen normally or slowly, then press Done to check your hiragana. Each correct answer earns 10 XP. Finish or leave a round to sync your checked answers.</p>
          <button type="button" onClick={() => begin()} className={`${button} w-full bg-pink-600 text-white shadow-lg shadow-pink-200/50 hover:bg-pink-700`}>Start listening →</button>
        </> : stage === "play" && question ? <>
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-neutral-500"><span>Listening · {index + 1} / {questions.length}</span><span className="rounded-full bg-amber-100 px-3 py-1.5 text-amber-900">{stats.points} points · {stats.streak} streak</span></div>
          <div role="progressbar" aria-label="Round progress" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={answers.length} className="flex gap-1">{questions.map((item, i) => <span key={item.card.id} className={`h-1.5 min-w-0 flex-1 rounded-full ${answers[i] ? answers[i].correct ? "bg-emerald-500" : "bg-amber-400" : i === index ? "bg-pink-400" : "bg-pink-100"}`} />)}</div>
          <div className={`relative overflow-hidden rounded-3xl border bg-white px-4 py-5 text-center shadow-sm ${feedback ? feedback.correct ? "border-emerald-300" : "border-amber-300" : "border-pink-200"}`}>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-50" style={{ backgroundImage: "linear-gradient(#fce7f3 1px, transparent 1px), linear-gradient(90deg, #fce7f3 1px, transparent 1px)", backgroundSize: "32px 32px", maskImage: "linear-gradient(to bottom, black, transparent)" }} />
            <h3 ref={heading} tabIndex={-1} className="relative text-xl font-semibold outline-none">{method === "choose" ? "Which word did you hear?" : "Write the hiragana you hear."}</h3>
            <div className="relative mt-4 grid grid-cols-2 gap-3"><button type="button" disabled={recognizing} onClick={() => play()} className={`${button} bg-pink-600 text-white hover:bg-pink-700`}>{speaking ? "Play again" : "Replay audio"}</button><button type="button" disabled={recognizing} onClick={() => play(true)} className={`${button} border border-pink-200 bg-white text-pink-700`}>Slow playback</button></div>
          </div>
          {!feedback ? <>{methodPicker()}{!heard ? <p role="status" className="rounded-xl bg-white p-4 text-center text-sm text-neutral-500">Listen to the audio before answering.</p> : method === "write" ? <HiraganaHandwritingPad drawing={drawing} onChange={draft => { setDrawing(draft); setError(""); }} busy={recognizing} onDone={checkHandwriting} /> : method === "type" ? <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (!composing.current && value.trim()) grade(questReading(value), acceptsListeningAnswer(question, value)); }}><label htmlFor="listening-answer" className="block text-sm font-semibold">Your reading</label><input id="listening-answer" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="done" value={value} onChange={event => setValue(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => { if (event.key === "Enter" && (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault(); }} placeholder="Type hiragana or romaji…" className="min-h-14 w-full rounded-2xl border-2 border-pink-200 bg-white px-4 py-3 text-center text-xl outline-pink-500" /><p className="text-xs text-pink-700">Your hiragana: <span lang="ja">{questReading(value) || "…"}</span></p><button type="submit" disabled={!value.trim()} className={`${button} w-full bg-pink-600 text-white`}>Done</button></form> : <div className="grid grid-cols-2 gap-3">{question.choices.map(choice => <button key={choice.id} type="button" onClick={() => grade(choice.prompt, choice.id === question.card.id)} className={`${button} min-h-24 break-words border border-pink-200 bg-white font-serif text-2xl`} lang="ja">{choice.prompt}</button>)}</div>}</> : <div className="space-y-3">
            <div role="status" className={`rounded-2xl border p-4 ${feedback.correct ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}><p className="text-lg font-semibold">{feedback.correct ? "You caught it! +10 XP" : "A new sound to remember."}</p>
              {feedback.handwritten && <div className="mt-3 rounded-xl bg-white/70 p-3"><p className="text-xs font-semibold">Read your handwriting as</p><p lang="ja" className="mt-1 break-words text-2xl">{feedback.answer}</p><button type="button" onClick={rewrite} className="mt-2 min-h-11 text-sm font-semibold underline underline-offset-4">Misread? Rewrite without penalty</button></div>}
              {!feedback.correct && !feedback.handwritten && <p className="mt-3 break-words text-sm">Your answer: <span lang="ja">{feedback.answer}</span></p>}
              <p className="mt-3 text-xs font-semibold">The word you heard</p><p lang="ja" className="mt-1 break-words text-2xl">{question.card.prompt} · {question.reading}</p><p className="mt-2 text-sm">{question.card.meaning}</p>
            </div><button ref={next} type="button" onClick={advance} className={`${button} w-full bg-neutral-900 text-white hover:bg-neutral-800`}>{index + 1 === questions.length ? "See my results →" : "Next word →"}</button>
          </div>}
        </> : <>
          <div className="text-center"><span aria-hidden="true" lang="ja" className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-4 border-amber-200 bg-amber-50 font-serif text-5xl text-amber-800">聞</span><p className="mt-4 text-xs font-semibold uppercase tracking-widest text-pink-600">Lesson {lesson} · Listening complete</p><h3 ref={heading} tabIndex={-1} className="mt-2 text-3xl font-semibold outline-none">Your ears are learning.</h3></div>
          <dl className="grid grid-cols-3 gap-2 text-center">{[["Correct", `${stats.correct}/${questions.length}`], ["Points", stats.points], ["Best streak", stats.bestStreak]].map(([label, score]) => <div key={label} className="rounded-2xl border border-pink-100 bg-white px-2 py-4"><dt className="text-[11px] text-neutral-500">{label}</dt><dd className="mt-1 text-2xl font-semibold text-pink-800">{score}</dd></div>)}</dl><p className="text-center text-xs text-pink-700">+{stats.points} XP added to your learning journey</p><KanjiSyncStatus />
          {missed.length > 0 && <button type="button" onClick={() => begin(missed)} className={`${button} w-full bg-pink-600 text-white`}>Practice {missed.length} missed {missed.length === 1 ? "word" : "words"} →</button>}
          <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => begin()} className={`${button} border border-pink-200 bg-white text-pink-700`}>Play again</button><button type="button" onClick={() => setStage("setup")} className={`${button} border border-pink-200 bg-white text-pink-700`}>Choose another lesson</button></div>
          <details className="rounded-2xl border border-neutral-200 bg-white"><summary className="min-h-12 cursor-pointer p-4 text-sm font-semibold">Review your {answers.length} words</summary><div className="divide-y divide-neutral-100 px-4">{answers.map(answer => <p key={answer.card.id} className="py-3"><span lang="ja">{answer.card.prompt} · {questions.find(item => item.card.id === answer.card.id)?.reading}</span><span className="block text-xs text-neutral-500">{answer.correct ? "Correct" : "Practice"} · {answer.card.meaning}</span></p>)}</div></details>
        </>}
        {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">{error}</p>}
      </div>
    </div>
  </dialog>;
}
