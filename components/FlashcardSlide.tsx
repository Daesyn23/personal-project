"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FlashcardRow } from "@/lib/types";
import type { PresentationPhase } from "@/components/presentation-phase";
import { japaneseLine } from "@/components/presentation-phase";
import { cancelSpeechSynthesis, speakEnglishLine, speakJapaneseLine } from "@/lib/japanese-tts";
import { useSpeechActivationHandlers } from "@/lib/useSpeechActivationHandlers";

type Props = {
  card: FlashcardRow;
  /**
   * "word" = slide 1: Romaji → Kana (+ group) → context
   * "detail" = slide 2: same, then example + translation
   */
  phase?: PresentationPhase;
  className?: string;
};

/**
 * Romaji line: stem in textbook blue (#2196F3), polite suffix / last token in grey
 * (e.g. "sen ta ku shi" + "masu"). Uses space-separated tokens; single token uses last-char split.
 */
function PhoneticLines({ text }: { text: string | null }) {
  const t = text?.trim();
  if (!t) return null;

  const parts = t.split(/\s+/).filter(Boolean);
  const blueClass = "font-bold text-[color:var(--fc-romaji-blue)]";
  const greyClass = "font-bold text-[color:var(--fc-romaji-tail)]";

  if (parts.length === 1) {
    const w = parts[0];
    if (w.length <= 1) {
      return (
        <p className="text-center text-2xl font-bold tracking-wide sm:text-3xl">
          <span className={blueClass}>{w}</span>
        </p>
      );
    }
    const head = w.slice(0, -1);
    const lastChar = w.slice(-1);
    return (
      <p className="text-center text-2xl font-bold tracking-wide sm:text-3xl">
        <span className={blueClass}>{head}</span>
        <span className={greyClass}>{lastChar}</span>
      </p>
    );
  }

  const last = parts.pop()!;
  const head = parts.join(" ");
  return (
    <p className="text-center text-2xl font-bold tracking-wide sm:text-3xl">
      <span className={blueClass}>{head} </span>
      <span className={greyClass}>{last}</span>
    </p>
  );
}

/** English gloss + note — italic magenta/pink like textbook */
function ContextBlock({ card }: { card: FlashcardRow }) {
  const gloss = (card.definition ?? "").trim();
  const ctx = (card.context_note ?? "").trim();
  if (!gloss && !ctx) return null;
  return (
    <div className="space-y-2 text-center">
      {gloss && (
        <p
          className="text-lg italic leading-snug sm:text-xl"
          style={{ color: "var(--fc-gloss-pink)" }}
        >
          {gloss}
        </p>
      )}
      {ctx && (
        <p
          className="text-base italic leading-snug sm:text-lg"
          style={{ color: "var(--fc-gloss-pink)" }}
        >
          ({ctx})
        </p>
      )}
    </div>
  );
}

/**
 * Example romaji: sentence bold black; last word (verb) maroon with light outline
 * like “fuku o” + “sentakushimasu”
 */
function ExampleRomajiLine({ text }: { text: string }) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const verbStyle =
    "font-bold text-[color:var(--fc-example-verb)] [text-shadow:1px_0_0_#fff,-1px_0_0_#fff,0_1px_0_#fff,0_-1px_0_#fff,1px_1px_0_#fff,-1px_-1px_0_#fff]";

  if (parts.length === 1) {
    return (
      <p className="text-center text-base sm:text-lg">
        <span className={verbStyle}>{parts[0]}</span>
      </p>
    );
  }

  const last = parts.pop()!;
  const head = parts.join(" ");
  return (
    <p className="text-center text-base sm:text-lg">
      <span className="font-bold text-neutral-900">{head} </span>
      <span className={verbStyle}>{last}</span>
    </p>
  );
}

const speakBtnClass =
  "inline-flex min-h-[40px] items-center justify-center rounded-full border border-pink-200/90 bg-white px-4 text-xs font-semibold text-pink-800 shadow-sm transition hover:border-pink-300 hover:bg-pink-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400";

const stopSpeakBtnClass =
  "inline-flex min-h-[40px] items-center justify-center rounded-full border border-rose-300/90 bg-rose-50 px-4 text-xs font-semibold text-rose-900 shadow-sm transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400";

export function FlashcardSlide({ card, phase = "word", className = "" }: Props) {
  const jpLine = japaneseLine(card);
  const cat = card.category_label?.trim();
  const def = (card.definition ?? "").trim();
  const ex1 = (card.example_sentence ?? "").trim();
  const ex2 = (card.example_translation ?? "").trim();

  const showExamples = phase === "detail" && !!(ex1 || ex2);

  const contextCard: FlashcardRow =
    jpLine || !def ? card : { ...card, definition: null };

  const [speaking, setSpeaking] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [ttsHint, setTtsHint] = useState<string | null>(null);
  const lastSpeakKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setTtsSupported(true);
    const synth = window.speechSynthesis;
    const refresh = () => {
      synth.getVoices();
    };
    refresh();
    synth.addEventListener("voiceschanged", refresh);
    return () => {
      synth.removeEventListener("voiceschanged", refresh);
    };
  }, []);

  useEffect(() => {
    const key = `${card.id}:${phase}`;
    if (lastSpeakKeyRef.current !== null && lastSpeakKeyRef.current !== key) {
      cancelSpeechSynthesis();
      setSpeaking(false);
      setTtsHint(null);
    }
    lastSpeakKeyRef.current = key;
  }, [card.id, phase]);

  const canSpeak = Boolean(
    ttsSupported && (jpLine?.trim() || card.phonetic_reading?.trim() || (card.definition ?? "").trim())
  );

  const startSpeak = useCallback(() => {
    const jp = jpLine?.trim();
    const romaji = card.phonetic_reading?.trim();
    const gloss = (card.definition ?? "").trim();
    setTtsHint(null);
    const onErr = (code?: string) => {
      setSpeaking(false);
      const suffix =
        code && code !== "not-allowed" && code !== "no-api" && code !== "speak-threw" ? ` (${code})` : "";
      const msg =
        code === "not-allowed"
          ? "Speech blocked — allow sound for this site in browser settings."
          : `Could not play speech${suffix}. Try again or check system volume.`;
      setTtsHint(msg);
      window.setTimeout(() => setTtsHint(null), 5000);
    };
    if (jp) {
      speakJapaneseLine(jp, "japanese", {
        onEnd: () => setSpeaking(false),
        onError: onErr,
      });
      setSpeaking(true);
    } else if (romaji) {
      speakEnglishLine(romaji, {
        onEnd: () => setSpeaking(false),
        onError: onErr,
      });
      setSpeaking(true);
    } else if (gloss) {
      speakEnglishLine(gloss, {
        onEnd: () => setSpeaking(false),
        onError: onErr,
      });
      setSpeaking(true);
    } else {
      setSpeaking(false);
    }
  }, [card.definition, card.phonetic_reading, jpLine]);

  const handleSpeakToggle = useCallback(() => {
    if (speaking) {
      cancelSpeechSynthesis();
      setSpeaking(false);
      return;
    }
    startSpeak();
  }, [speaking, startSpeak]);

  const speakPress = useSpeechActivationHandlers(handleSpeakToggle);

  return (
    <div
      className={`relative flex min-h-[380px] flex-col items-stretch justify-center gap-0 rounded-2xl bg-white px-6 py-12 shadow-lg shadow-pink-100/80 ring-1 ring-pink-100/80 transition-shadow duration-300 sm:px-10 ${className}`}
    >
      {canSpeak ? (
        <div className="absolute right-3 top-3 max-w-[min(100%,12rem)] text-right sm:right-4 sm:top-4">
          <button
            type="button"
            onPointerDown={speakPress.onPointerDown}
            onClick={speakPress.onClick}
            className={speaking ? stopSpeakBtnClass : speakBtnClass}
            aria-label={speaking ? "Stop speech" : "Speak card"}
          >
            {speaking ? "Stop" : "Speak"}
          </button>
          {ttsHint ? <p className="mt-1.5 text-[10px] leading-snug text-rose-700">{ttsHint}</p> : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-10 sm:gap-12">
        {/* 1 — Romaji (top, textbook order) */}
        {card.phonetic_reading?.trim() ? (
          <section className="min-h-0" aria-label="Romaji">
            <PhoneticLines text={card.phonetic_reading} />
          </section>
        ) : null}

        {/* 2 — Kana + verb group (large, subtle depth) */}
        <section className="text-center" aria-label="Kana">
          {jpLine ? (
            <div className="flex flex-wrap items-baseline justify-center gap-3">
              <span
                className="text-5xl font-normal leading-[1.15] tracking-tight text-neutral-900 sm:text-6xl sm:leading-[1.1]"
                style={{
                  textShadow:
                    "0 2px 4px rgba(0,0,0,0.14), 0 1px 0 rgba(255,255,255,0.9), 0 0 1px rgba(0,0,0,0.08)",
                }}
              >
                {jpLine}
              </span>
              {cat && (
                <span
                  className="align-top font-serif text-4xl font-normal leading-none text-neutral-400 sm:text-5xl lg:text-6xl"
                  aria-label={`Verb group ${cat}`}
                >
                  {cat}
                </span>
              )}
            </div>
          ) : def ? (
            <p
              className="text-4xl font-semibold leading-tight text-neutral-900 sm:text-5xl"
              style={{
                textShadow: "0 2px 4px rgba(0,0,0,0.12)",
              }}
            >
              {def}
            </p>
          ) : null}
        </section>

        {/* 3 — Gloss / context */}
        <section aria-label="Meaning">
          <ContextBlock card={contextCard} />
        </section>

        {showExamples && (
          <div className="flex flex-col gap-5 border-t border-neutral-200/80 pt-10">
            {ex1 && (
              <section aria-label="Example">
                <ExampleRomajiLine text={ex1} />
              </section>
            )}
            {ex2 && (
              <section className="text-center" aria-label="Translation">
                <p className="text-sm font-normal text-neutral-900 sm:text-base">{ex2}</p>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
