"use client";
import { useEffect, useRef, useState } from 'react';
import material from '@/data/kanji-lessons.json';
import { buildQuestDeck, questStats, type QuestAnswer } from '@/lib/games/kanji-quest';
import { buildListeningQuestions, type ListeningQuestion } from '@/lib/games/kanji-listening';
import { cancelSpeechSynthesis, getJapaneseVoices, speakJapaneseLine } from '@/lib/japanese-tts';
import { newPracticeRoundId, saveKanjiRound } from '@/lib/games/kanji-progress-store';
import { KanjiSyncStatus } from './KanjiSyncStatus';
const button='min-h-12 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-40';
export function KanjiListening({initialLesson,onClose}:{initialLesson:number;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null), round=useRef(''), locked=useRef(false), heading=useRef<HTMLHeadingElement>(null);
 const [lesson,setLesson]=useState(initialLesson),[questions,setQuestions]=useState<ListeningQuestion[]>([]),[index,setIndex]=useState(0),[stage,setStage]=useState<'setup'|'play'|'results'>('setup');
 const [answers,setAnswers]=useState<QuestAnswer[]>([]),[feedback,setFeedback]=useState<QuestAnswer|null>(null),[heard,setHeard]=useState(false),[error,setError]=useState(''),[speaking,setSpeaking]=useState(false),[confirmExit,setConfirmExit]=useState(false);
 const question=questions[index],stats=questStats(answers);
 useEffect(()=>{const trigger=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;const element=dialog.current;getJapaneseVoices();element?.showModal();document.body.style.overflow='hidden';return()=>{cancelSpeechSynthesis();element?.close();document.body.style.overflow=overflow;trigger?.focus();};},[]);
 useEffect(()=>{heading.current?.focus();},[stage,index]);
 function play(slow=false) {
  setError('');
  if(!getJapaneseVoices().length) {setError('No Japanese voice is available yet. Enable a Japanese voice in your device’s speech settings, then try Replay.');return;}
  setSpeaking(true);
  speakJapaneseLine(question.reading,'reading',{rate:slow?0.6:0.9,onEnd:()=>{setSpeaking(false);setHeard(true);},onError:()=>{setSpeaking(false);setError('Audio couldn’t play. Tap Replay to try again.');}});
 }
 function begin() {const deck=buildListeningQuestions(buildQuestDeck(material.lessons.find(item=>item.number===lesson)!,'vocabulary'));setQuestions(deck);if(!deck.length){setError('This lesson needs more distinct vocabulary for listening. Choose another lesson.');return;}round.current=newPracticeRoundId();setIndex(0);setAnswers([]);setFeedback(null);setHeard(false);setError('');locked.current=false;setStage('play');}
 function choose(id:string) {if(locked.current||!heard)return;locked.current=true;const selected=question.choices.find(item=>item.id===id)!;const answer={card:question.card,answer:selected.prompt,correct:id===question.card.id,hinted:false};setAnswers(previous=>[...previous,answer]);setFeedback(answer);cancelSpeechSynthesis();setSpeaking(false);}
 function save() {saveKanjiRound({id:round.current,lesson,mode:'vocabulary',completed:answers.length===questions.length,answers});}
 function advance() {cancelSpeechSynthesis();setSpeaking(false);if(index+1===questions.length){save();setStage('results');}else{setIndex(previous=>previous+1);setFeedback(null);setHeard(false);setError('');locked.current=false;}}
 function close() {cancelSpeechSynthesis();setSpeaking(false);if(stage==='play')setConfirmExit(true);else onClose();}
 return <dialog ref={dialog} aria-labelledby="listening-title" onCancel={event=>{event.preventDefault();close();}} className="m-0 h-dvh max-h-dvh w-full max-w-none overflow-hidden border-0 bg-[#fffaf7] p-0 text-neutral-900 backdrop:bg-neutral-950/50 sm:m-auto sm:h-[min(850px,92dvh)] sm:w-[calc(100%-2rem)] sm:max-w-2xl sm:rounded-3xl"><div className="flex h-full flex-col">
  <header className="flex shrink-0 items-center justify-between border-b border-pink-100 bg-white p-4 pt-[max(1rem,env(safe-area-inset-top))]"><h2 id="listening-title" className="text-xl font-semibold">Listening Quest</h2><button type="button" aria-label="Close Listening Quest" onClick={close} className="h-11 w-11 rounded-full border border-pink-200 text-2xl">×</button></header>
  <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
   {confirmExit?<div className="space-y-4"><h3 className="text-2xl font-semibold">Finish for now?</h3><p>Your checked answers will be saved.</p><button type="button" autoFocus onClick={()=>setConfirmExit(false)} className={`${button} w-full bg-pink-600 text-white`}>Keep listening</button><button type="button" onClick={()=>{save();onClose();}} className={`${button} w-full border border-pink-200`}>Save and leave</button></div>:stage==='setup'?<>
    <div className="rounded-3xl bg-indigo-50 px-5 py-8 text-center"><span lang="ja" className="font-serif text-6xl text-indigo-800">聞</span><h3 ref={heading} tabIndex={-1} className="mt-4 text-2xl font-semibold">Listen. Picture it. Choose.</h3><p className="mt-3 text-sm leading-6">Hear a word from your lesson and choose its written form. Eight questions, no timer, and as many replays as you need.</p></div>
    <label htmlFor="listening-lesson" className="block text-sm font-semibold">Choose your lesson</label><select id="listening-lesson" value={lesson} onChange={event=>setLesson(Number(event.target.value))} className="min-h-12 w-full rounded-xl border border-pink-200 bg-white px-3 text-base">{material.lessons.map(item=><option key={item.number} value={item.number}>Lesson {item.number}</option>)}</select>
    <p className="text-xs leading-5 text-neutral-500">Use your device’s Japanese voice. Replay normally or slowly. Each correct word earns 10 XP; vocabulary practice does not mark individual kanji as mastered.</p><button type="button" onClick={begin} className={`${button} w-full bg-indigo-700 text-white`}>Start listening →</button>
   </>:stage==='play'&&question?<>
    <p className="text-xs font-semibold text-neutral-500">Word {index+1} / {questions.length} · {stats.points} XP</p><progress className="h-2 w-full accent-indigo-600" max={questions.length} value={index}/>
    <h3 ref={heading} tabIndex={-1} className="text-center text-2xl font-semibold outline-none">Which word did you hear?</h3><div className="grid grid-cols-2 gap-3"><button type="button" onClick={()=>play()} className={`${button} bg-indigo-700 text-white`}>{speaking?'Play again':'Replay audio'}</button><button type="button" onClick={()=>play(true)} className={`${button} border border-indigo-200 bg-white text-indigo-800`}>Slow playback</button></div>
    {!heard&&!feedback&&<p className="text-center text-xs text-neutral-500">Listen to the audio before choosing.</p>}
    <div className="grid grid-cols-2 gap-3">{question.choices.map(choice=><button key={choice.id} type="button" disabled={!heard||!!feedback} onClick={()=>choose(choice.id)} className={`${button} min-h-24 break-words border bg-white text-2xl ${feedback&&choice.id===question.card.id?'border-emerald-400 bg-emerald-50':'border-pink-200'}`} lang="ja">{choice.prompt}</button>)}</div>
    {feedback&&<div role="status" className="space-y-3 rounded-2xl bg-white p-4"><h4 className="font-semibold">{feedback.correct?'You caught it! +10 XP':'A new sound to remember.'}</h4><p><span lang="ja" className="text-2xl">{question.card.prompt} · {question.reading}</span><span className="mt-2 block text-sm text-neutral-600">{question.card.meaning}</span></p><button type="button" autoFocus onClick={advance} className={`${button} w-full bg-pink-600 text-white`}>{index+1===questions.length?'See my results →':'Next word →'}</button></div>}
   </>:<div className="space-y-5 text-center"><h3 ref={heading} tabIndex={-1} className="text-3xl font-semibold">Your ears are learning.</h3><p className="text-xl">{stats.correct} / {questions.length} correct · {stats.points} XP</p><KanjiSyncStatus/><div className="space-y-2 text-left">{answers.filter(answer=>!answer.correct).map(answer=><p key={answer.card.id} className="rounded-xl bg-white p-3"><span lang="ja">{answer.card.prompt} · {answer.card.answers[0]}</span><span className="block text-xs text-neutral-500">{answer.card.meaning}</span></p>)}</div><button type="button" onClick={()=>setStage('setup')} className={`${button} w-full bg-indigo-700 text-white`}>Choose another lesson</button></div>}
   {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
  </div></div></dialog>;
}
