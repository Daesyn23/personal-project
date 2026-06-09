/**
 * Client playback for practice tutor voice (OpenAI TTS MP3, browser fallback).
 */

import type { PracticeTtsRegister } from "@/lib/openai-tts";
import { speakEnglishLine, speakJapaneseLine, cancelSpeechSynthesis } from "@/lib/japanese-tts";
import { shouldSpeakAsJapanese } from "@/lib/detect-utterance-language";

let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;

/** Prefetched MP3 object URLs keyed by trimmed speak text. */
const prefetchCache = new Map<string, string>();
const prefetchInFlight = new Map<string, Promise<string | null>>();

export function cancelPracticeVoicePlayback(): void {
  cancelSpeechSynthesis();
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
}

export function clearPracticeTtsPrefetch(): void {
  for (const url of prefetchCache.values()) {
    URL.revokeObjectURL(url);
  }
  prefetchCache.clear();
  prefetchInFlight.clear();
}

export type PracticeSpeakCallbacks = {
  onEnd?: () => void;
  onError?: (code?: string) => void;
};

export type PracticeSpeakOptions = {
  speechRegister?: PracticeTtsRegister;
};

function cacheKey(text: string, register: PracticeTtsRegister): string {
  return `${register}\0${text.trim()}`;
}

async function fetchTutorMp3Url(
  text: string,
  register: PracticeTtsRegister
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const key = cacheKey(trimmed, register);
  const cached = prefetchCache.get(key);
  if (cached) {
    prefetchCache.delete(key);
    return cached;
  }

  const inflight = prefetchInFlight.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const res = await fetch("/api/japanese/practice-speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, speechRegister: register }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch {
      return null;
    } finally {
      prefetchInFlight.delete(key);
    }
  })();

  prefetchInFlight.set(key, promise);
  return promise;
}

/** Warm the next line while the current one plays. */
export function prefetchTutorLine(text: string, options?: PracticeSpeakOptions): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const register = options?.speechRegister === "casual" ? "casual" : "polite";
  const key = cacheKey(trimmed, register);
  if (prefetchCache.has(key) || prefetchInFlight.has(key)) return;

  void fetchTutorMp3Url(trimmed, register).then((url) => {
    if (url) prefetchCache.set(key, url);
  });
}

function playMp3Url(url: string, callbacks: PracticeSpeakCallbacks): void {
  cancelPracticeVoicePlayback();
  activeObjectUrl = url;
  const audio = new Audio(url);
  activeAudio = audio;
  audio.onended = () => {
    cancelPracticeVoicePlayback();
    callbacks.onEnd?.();
  };
  audio.onerror = () => {
    cancelPracticeVoicePlayback();
    callbacks.onError?.("audio-play-failed");
  };
  void audio.play().catch(() => {
    cancelPracticeVoicePlayback();
    callbacks.onError?.("audio-play-failed");
  });
}

/** Play tutor line with OpenAI TTS. Returns true if audio started. */
export async function speakTutorLine(
  text: string,
  callbacks: PracticeSpeakCallbacks,
  options?: PracticeSpeakOptions
): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) {
    callbacks.onEnd?.();
    return true;
  }

  const register = options?.speechRegister === "casual" ? "casual" : "polite";
  const url = await fetchTutorMp3Url(trimmed, register);
  if (!url) return false;

  playMp3Url(url, callbacks);
  return true;
}

/** Browser TTS fallback when OpenAI speech is unavailable. */
export function speakTutorLineBrowserFallback(text: string, callbacks: PracticeSpeakCallbacks): void {
  const useJapanese = shouldSpeakAsJapanese(text);
  if (useJapanese) speakJapaneseLine(text, "practice", callbacks);
  else speakEnglishLine(text, callbacks, "practice");
}

export async function speakTutorLinePreferOpenAi(
  text: string,
  callbacks: PracticeSpeakCallbacks,
  options?: PracticeSpeakOptions
): Promise<void> {
  const ok = await speakTutorLine(text, callbacks, options);
  if (!ok) speakTutorLineBrowserFallback(text, callbacks);
}
