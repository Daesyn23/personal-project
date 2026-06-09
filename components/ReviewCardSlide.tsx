"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ReviewItemRow } from "@/lib/types";
import { jpFontClass } from "@/lib/workspace-translation";
import { cancelSpeechSynthesis, speakJapaneseLine } from "@/lib/japanese-tts";
import { useSpeechActivationHandlers } from "@/lib/useSpeechActivationHandlers";
import { ReviewStarIcon } from "@/components/ReviewStarIcon";
import { compensatePresentationToolbarZoom } from "@/hooks/usePresentationCardZoom";

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
  /** Parent presentation zoom; toolbar icons counter-scale when zoomed in. */
  presentationZoom?: number;
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
  toolbarZoom?: number;
};

function FaceToolbar({ speaking, starred, onSpeak, onStar, toolbarZoom = 1 }: FaceToolbarProps) {
  const speakerHandlers = useSpeechActivationHandlers(onSpeak);
  const toolbarStyle = toolbarZoom !== 1 ? { zoom: toolbarZoom } : undefined;

  return (
    <div
      className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-5 transition-[zoom] duration-150 ease-out motion-reduce:transition-none sm:px-6 sm:pt-6"
      style={toolbarStyle}
    >
      <button
        type="button"
        className={`rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 sm:p-2.5 ${
          speaking ? "text-blue-600" : ""
        }`}
        aria-label={speaking ? "Stop audio" : "Play pronunciation"}
        title={speaking ? "Stop" : "Listen"}
        {...speakerHandlers}
      >
        <SpeakerIcon className="h-5 w-5 sm:h-6 sm:w-6" />
      </button>
      <button
        type="button"
        onClick={onStar}
        className={`rounded-full p-2 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 sm:p-2.5 ${
          starred ? "text-amber-500" : "text-slate-500 hover:text-amber-500"
        }`}
        aria-label={starred ? "Remove star" : "Star card"}
        title={starred ? "Starred" : "Star"}
      >
        <ReviewStarIcon className="h-5 w-5 sm:h-6 sm:w-6" filled={starred} />
      </button>
    </div>
  );
}

const faceClass =
  "absolute inset-0 flex items-center justify-center rounded-3xl bg-white [backface-visibility:hidden]";

export const ReviewCardSlide = forwardRef<ReviewCardSlideHandle, Props>(function ReviewCardSlide(
  { item, phase, forceFront = false, onStarChange, className, presentationZoom = 1 },
  ref
) {
  const toolbarZoom = compensatePresentationToolbarZoom(presentationZoom);
  const [speaking, setSpeaking] = useState(false);
  const speakingRef = useRef(false);
  const speakLineRef = useRef(item.kanji);

  const textToSpeak = phase === "front" ? item.kanji : item.kana;
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
    <div className={`h-full w-full ${className ?? ""}`} style={{ perspective: "1200px" }}>
      <div
        className={`relative h-full w-full [transform-style:preserve-3d] ${
          forceFront
            ? "transition-none"
            : "transition-transform duration-500 ease-in-out motion-reduce:transition-none"
        } ${isFlipped ? "[transform:rotateY(180deg)]" : ""}`}
      >
        {/* Front — kanji */}
        <div className={faceClass} aria-hidden={isFlipped}>
          <FaceToolbar
            speaking={speaking && phase === "front"}
            starred={item.starred}
            toolbarZoom={toolbarZoom}
            onSpeak={() => {
              if (speakingRef.current) stopSpeaking();
              else speakLine(item.kanji);
            }}
            onStar={toggleStar}
          />
          <p className={`px-6 text-center text-4xl font-medium text-slate-800 sm:px-10 sm:text-5xl ${jpFontClass}`}>
            {item.kanji}
          </p>
        </div>

        {/* Back — hiragana + English */}
        <div className={`${faceClass} [transform:rotateY(180deg)]`} aria-hidden={!isFlipped}>
          <FaceToolbar
            speaking={speaking && phase === "back"}
            starred={item.starred}
            toolbarZoom={toolbarZoom}
            onSpeak={() => {
              if (speakingRef.current) stopSpeaking();
              else speakLine(item.kana);
            }}
            onStar={toggleStar}
          />
          <p className={`px-6 text-center text-2xl font-medium leading-relaxed text-slate-700 sm:px-10 sm:text-3xl ${jpFontClass}`}>
            <span>{item.kana}</span>
            <span className="text-slate-500"> ({item.definition})</span>
          </p>
        </div>
      </div>
    </div>
  );
});
