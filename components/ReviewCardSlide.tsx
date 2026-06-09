"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ReviewItemRow } from "@/lib/types";
import { jpFontClass } from "@/lib/workspace-translation";
import { cancelSpeechSynthesis, speakJapaneseLine } from "@/lib/japanese-tts";
import { useSpeechActivationHandlers } from "@/lib/useSpeechActivationHandlers";
import { ReviewStarIcon } from "@/components/ReviewStarIcon";

export type ReviewCardPhase = "front" | "back";

export type ReviewCardSlideHandle = {
  toggleSpeak: () => void;
};

type Props = {
  item: ReviewItemRow;
  phase: ReviewCardPhase;
  /** Snap to front face with no flip animation (used while changing cards). */
  forceFront?: boolean;
  onStarChange?: (starred: boolean) => void;
  className?: string;
};

function SpeakerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H3v6h3l5 4V5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.54 8.46a5 5 0 010 7.07M17.66 6.34a8 8 0 010 11.32" />
    </svg>
  );
}

type FaceToolbarProps = {
  speaking: boolean;
  starred: boolean;
  onSpeak: () => void;
  onStar: () => void;
};

function FaceToolbar({ speaking, starred, onSpeak, onStar }: FaceToolbarProps) {
  const speakerHandlers = useSpeechActivationHandlers(onSpeak);

  return (
    <div className="flex items-center justify-between px-5 pt-5 sm:px-6 sm:pt-6">
      <button
        type="button"
        className={`rounded-full p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
          speaking ? "text-blue-600" : ""
        }`}
        aria-label={speaking ? "Stop audio" : "Play pronunciation"}
        title={speaking ? "Stop" : "Listen"}
        {...speakerHandlers}
      >
        <SpeakerIcon className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={onStar}
        className={`rounded-full p-2.5 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
          starred ? "text-amber-500" : "text-slate-500 hover:text-amber-500"
        }`}
        aria-label={starred ? "Remove star" : "Star card"}
        title={starred ? "Starred" : "Star"}
      >
        <ReviewStarIcon className="h-6 w-6" filled={starred} />
      </button>
    </div>
  );
}

const faceClass =
  "absolute inset-0 flex flex-col rounded-3xl bg-white shadow-lg shadow-slate-200/80 ring-1 ring-slate-100 [backface-visibility:hidden]";

export const ReviewCardSlide = forwardRef<ReviewCardSlideHandle, Props>(function ReviewCardSlide(
  { item, phase, forceFront = false, onStarChange, className },
  ref
) {
  const [speaking, setSpeaking] = useState(false);
  const speakingRef = useRef(false);
  const speakLineRef = useRef(item.kana);

  const textToSpeak = phase === "front" ? item.kana : item.kanji;
  speakLineRef.current = textToSpeak;

  const stopSpeaking = useCallback(() => {
    cancelSpeechSynthesis();
    speakingRef.current = false;
    setSpeaking(false);
  }, []);

  const speakLine = useCallback(
    (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      speakingRef.current = true;
      setSpeaking(true);
      speakJapaneseLine(trimmed, "japanese", {
        onEnd: () => {
          speakingRef.current = false;
          setSpeaking(false);
        },
        onError: () => {
          speakingRef.current = false;
          setSpeaking(false);
        },
      });
    },
    []
  );

  const toggleSpeak = useCallback(() => {
    if (speakingRef.current) {
      stopSpeaking();
      return;
    }
    speakLine(speakLineRef.current);
  }, [speakLine, stopSpeaking]);

  useImperativeHandle(ref, () => ({ toggleSpeak }), [toggleSpeak]);

  useEffect(() => {
    stopSpeaking();
  }, [phase, item.id, stopSpeaking]);

  const toggleStar = () => {
    onStarChange?.(!item.starred);
  };

  const isFlipped = !forceFront && phase === "back";

  return (
    <div className={`w-full ${className ?? ""}`} style={{ perspective: "1200px" }}>
      <div
        className={`relative min-h-[min(70vh,520px)] w-full [transform-style:preserve-3d] ${
          forceFront
            ? "transition-none"
            : "transition-transform duration-500 ease-in-out motion-reduce:transition-none"
        } ${isFlipped ? "[transform:rotateY(180deg)]" : ""}`}
      >
        {/* Front — hiragana + English */}
        <div className={faceClass} aria-hidden={isFlipped}>
          <FaceToolbar
            speaking={speaking && phase === "front"}
            starred={item.starred}
            onSpeak={() => {
              if (speakingRef.current) stopSpeaking();
              else speakLine(item.kana);
            }}
            onStar={toggleStar}
          />
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8 pt-2 sm:px-10">
            <p className={`text-center text-2xl font-medium leading-relaxed text-slate-700 sm:text-3xl ${jpFontClass}`}>
              <span>{item.kana}</span>
              <span className="text-slate-500"> ({item.definition})</span>
            </p>
          </div>
        </div>

        {/* Back — kanji */}
        <div className={`${faceClass} [transform:rotateY(180deg)]`} aria-hidden={!isFlipped}>
          <FaceToolbar
            speaking={speaking && phase === "back"}
            starred={item.starred}
            onSpeak={() => {
              if (speakingRef.current) stopSpeaking();
              else speakLine(item.kanji);
            }}
            onStar={toggleStar}
          />
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8 pt-2 sm:px-10">
            <p className={`text-center text-4xl font-medium text-slate-800 sm:text-5xl ${jpFontClass}`}>
              {item.kanji}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});
