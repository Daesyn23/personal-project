"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cancelSpeechSynthesis, getJapaneseVoices } from "@/lib/japanese-tts";
import type { FlashcardRow } from "@/lib/types";
import { publishPresentationMode } from "@/lib/workspace-floating-panels";
import { FlashcardSlide, type FlashcardSlideHandle } from "@/components/FlashcardSlide";
import { InfoTip } from "@/components/InfoTip";
import { PresentationCardZoomSlider } from "@/components/PresentationCardZoomSlider";
import { usePresentationCardZoom } from "@/hooks/usePresentationCardZoom";
import {
  hasDetailPhase,
  type PresentationPhase,
} from "@/components/presentation-phase";

type Props = {
  cards: FlashcardRow[];
  index: number;
  open: boolean;
  onClose: () => void;
  onIndexChange: (i: number) => void;
};

const FLASHCARD_JAPANESE_VOICE_KEY = "workspace-flashcard-japanese-voice-v1";

type JapaneseVoiceOption = {
  voiceURI: string;
  name: string;
  lang: string;
};

export function PresentFlashcards({
  cards,
  index,
  open,
  onClose,
  onIndexChange,
}: Props) {
  const card = cards[index];
  const slideRef = useRef<FlashcardSlideHandle>(null);
  const [phase, setPhase] = useState<PresentationPhase>("word");
  const [japaneseVoices, setJapaneseVoices] = useState<JapaneseVoiceOption[]>([]);
  const [japaneseVoiceURI, setJapaneseVoiceURI] = useState("");
  const { zoom, setCardZoom } = usePresentationCardZoom("workspace-flashcard-present-zoom-v1");

  useEffect(() => {
    if (open) setPhase("word");
  }, [open]);

  useEffect(() => {
    if (open && cards.length === 0) onClose();
  }, [open, cards.length, onClose]);

  useEffect(() => {
    if (!open) cancelSpeechSynthesis();
  }, [open]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;

    const refresh = () => {
      const stored = window.localStorage.getItem(FLASHCARD_JAPANESE_VOICE_KEY) ?? "";
      const next = getJapaneseVoices().map((voice) => ({
        voiceURI: voice.voiceURI,
        name: voice.name,
        lang: voice.lang,
      }));
      setJapaneseVoices(next);
      setJapaneseVoiceURI((current) => {
        const preferred = current || stored;
        return preferred && next.some((voice) => voice.voiceURI === preferred)
          ? preferred
          : "";
      });
    };

    refresh();
    synth.addEventListener("voiceschanged", refresh);
    return () => synth.removeEventListener("voiceschanged", refresh);
  }, []);

  const changeJapaneseVoice = useCallback((voiceURI: string) => {
    cancelSpeechSynthesis();
    setJapaneseVoiceURI(voiceURI);
    if (voiceURI) window.localStorage.setItem(FLASHCARD_JAPANESE_VOICE_KEY, voiceURI);
    else window.localStorage.removeItem(FLASHCARD_JAPANESE_VOICE_KEY);
  }, []);

  useEffect(() => {
    if (!open) return;
    publishPresentationMode(true);
    return () => publishPresentationMode(false);
  }, [open]);

  const advance = useCallback(() => {
    const n = cards.length;
    if (n === 0 || !card) return;
    if (phase === "word" && hasDetailPhase(card)) {
      setPhase("detail");
      return;
    }
    onIndexChange((index + 1) % n);
    setPhase("word");
  }, [cards.length, card, index, onIndexChange, phase]);

  const back = useCallback(() => {
    const n = cards.length;
    if (n === 0 || !card) return;
    if (phase === "detail") {
      setPhase("word");
      return;
    }
    const pi = (index - 1 + n) % n;
    onIndexChange(pi);
    const prevCard = cards[pi];
    setPhase(hasDetailPhase(prevCard) ? "detail" : "word");
  }, [cards, card, index, onIndexChange, phase]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;

      // Toggle speech with Ctrl or Shift (same as speaker button)
      if (!e.repeat && (e.key === "Control" || e.key === "Shift")) {
        e.preventDefault();
        slideRef.current?.toggleSpeak();
        return;
      }

      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        advance();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, advance, back, onClose]);

  if (!open || !card) return null;

  const phaseLabel =
    phase === "word"
      ? "Romaji · Kana · context"
      : "Romaji · Kana · context · example";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#fffafc]/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Presentation"
    >
      <header className="grid gap-3 border-b border-pink-100 px-3 py-3 [grid-template-columns:minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-4">
        <button
          type="button"
          onClick={onClose}
          className="col-start-1 row-start-1 justify-self-start rounded-lg px-3 py-1.5 text-sm font-medium text-pink-600 hover:bg-pink-50"
        >
          Close
        </button>
        <div className="col-start-2 row-start-1 flex shrink-0 justify-end gap-2 sm:col-start-3 sm:justify-self-end">
          <button
            type="button"
            onClick={back}
            className="rounded-lg border border-pink-200 bg-white px-3 py-1.5 text-sm text-pink-700 hover:bg-pink-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={advance}
            className="rounded-lg bg-pink-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-600"
          >
            {phase === "word" && hasDetailPhase(card) ? "Next slide" : "Next card"}
          </button>
        </div>
        <span className="relative col-span-full row-start-2 min-w-0 px-2 pr-9 text-center text-sm text-neutral-500 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:px-2 sm:pr-10">
          <InfoTip
            label="Presentation shortcuts"
            placement="below-end"
            className="absolute right-0 top-0 sm:right-0"
          >
            <p>Ctrl or Shift — listen</p>
            <p className="mt-1">Space / → next · ← back · Esc close</p>
          </InfoTip>
          <span className="block tabular-nums">
            Card {index + 1} / {cards.length}
          </span>
          <span className="mt-0.5 block text-xs text-pink-600">{phaseLabel}</span>
          {japaneseVoices.length > 0 ? (
            <label className="mx-auto mt-1.5 flex w-fit max-w-full items-center gap-1.5 text-xs text-neutral-500">
              <span className="shrink-0">Voice</span>
              <select
                value={japaneseVoiceURI}
                onChange={(e) => changeJapaneseVoice(e.target.value)}
                className="min-w-0 max-w-[13rem] rounded-md border border-pink-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-200/60"
                aria-label="Japanese pronunciation voice"
                title="Choose the Japanese voice used for flashcards"
              >
                <option value="">Automatic</option>
                {japaneseVoices.map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto p-4 sm:p-6">
        <div className="w-full max-w-3xl">
          <div
            className="origin-center transition-[zoom] duration-150 ease-out motion-reduce:transition-none"
            style={{ zoom }}
          >
            <div key={card.id} className="flashcard-enter">
              <FlashcardSlide
                ref={slideRef}
                card={card}
                phase={phase}
                japaneseVoiceURI={japaneseVoiceURI || null}
              />
            </div>
          </div>
        </div>
        <PresentationCardZoomSlider
          zoom={zoom}
          onChange={setCardZoom}
          className="mt-4 w-full max-w-md shrink-0 sm:max-w-lg"
        />
      </div>
    </div>
  );
}
