/**
 * Client playback for practice tutor voice (OpenAI TTS MP3, browser fallback).
 */

import { speakEnglishLine, speakJapaneseLine, cancelSpeechSynthesis } from "@/lib/japanese-tts";
import { shouldSpeakAsJapanese } from "@/lib/detect-utterance-language";

let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;

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

export type PracticeSpeakCallbacks = {
  onEnd?: () => void;
  onError?: (code?: string) => void;
};

/** Play tutor line with OpenAI TTS (same voice every language). Returns true if played. */
export async function speakTutorLine(
  text: string,
  callbacks: PracticeSpeakCallbacks
): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) {
    callbacks.onEnd?.();
    return true;
  }

  cancelPracticeVoicePlayback();

  try {
    const res = await fetch("/api/japanese/practice-speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed }),
    });
    if (!res.ok) return false;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
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
    await audio.play();
    return true;
  } catch {
    cancelPracticeVoicePlayback();
    return false;
  }
}

/** Browser TTS fallback when OpenAI speech is unavailable. */
export function speakTutorLineBrowserFallback(text: string, callbacks: PracticeSpeakCallbacks): void {
  const useJapanese = shouldSpeakAsJapanese(text);
  if (useJapanese) speakJapaneseLine(text, "japanese", callbacks);
  else speakEnglishLine(text, callbacks);
}

export async function speakTutorLinePreferOpenAi(
  text: string,
  callbacks: PracticeSpeakCallbacks
): Promise<void> {
  const ok = await speakTutorLine(text, callbacks);
  if (!ok) speakTutorLineBrowserFallback(text, callbacks);
}

/** Instant playback for live voice chat (no TTS API round-trip). */
export function speakTutorLineImmediate(text: string, callbacks: PracticeSpeakCallbacks): void {
  speakTutorLineBrowserFallback(text, callbacks);
}
