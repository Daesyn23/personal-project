/**
 * Browser Web Speech API (SpeechRecognition) for hands-free practice chat.
 */

import { classifyPhraseEnd } from "@/lib/utterance-phrase-end";

export type SpeechInputLang = "ja-JP" | "en-US" | "fil-PH";

const DEFAULT_SILENCE_MS = 700;
const DEFAULT_SILENCE_AFTER_FINAL_MS = 380;
const DEFAULT_SILENCE_INCOMPLETE_MS = 1150;
const DEFAULT_SILENCE_INCOMPLETE_AFTER_FINAL_MS = 1350;
const DEFAULT_MAX_INCOMPLETE_WAIT_MS = 3400;
const MIN_UTTERANCE_CHARS = 1;

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: (audioTrack?: MediaStreamTrack) => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
};

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isBrowserSpeechInputSupported(): boolean {
  return getSpeechRecognitionCtor() != null;
}

export type UtteranceRecognitionSession = {
  stop: () => void;
  abort: () => void;
};

export type StartUtteranceRecognitionOptions = {
  lang: SpeechInputLang;
  /** Noise-cancelled mic track from `acquirePracticeMic` (Chrome/Edge). */
  audioTrack?: MediaStreamTrack;
  /** Ms of silence while interim results are updating (default 700). */
  silenceMs?: number;
  /** Shorter silence after a final transcript chunk when the phrase looks complete (default 380). */
  silenceMsAfterFinal?: number;
  /** Longer silence when the phrase looks mid-sentence (default 1150). */
  silenceMsIncomplete?: number;
  silenceMsIncompleteAfterFinal?: number;
  /** Force-submit after this much wait while the phrase still looks incomplete (default 3400). */
  maxIncompleteWaitMs?: number;
  onInterim?: (text: string) => void;
  /** Fired when we detect a mid-sentence pause and are waiting for more speech. */
  onPhraseIncomplete?: () => void;
  /** Fired when the engine hears any speech (for UI). */
  onSpeechActivity?: () => void;
  /** Fired once when silence is detected or the engine ends with transcript. */
  onUtteranceComplete: (text: string) => void;
  /** Fired when listening ended but nothing usable was captured. */
  onEmpty?: () => void;
  onListening?: () => void;
  /** Fired after utterance handling; use for restarting mic. */
  onEnd?: () => void;
  onError?: (code: string) => void;
};

/**
 * Listen for one utterance; auto-stops after `silenceMs` without new speech (hands-free).
 */
export function startUtteranceRecognition(
  options: StartUtteranceRecognitionOptions
): UtteranceRecognitionSession | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  const rec = new Ctor();
  const silenceMs = options.silenceMs ?? DEFAULT_SILENCE_MS;
  const silenceMsAfterFinal = options.silenceMsAfterFinal ?? DEFAULT_SILENCE_AFTER_FINAL_MS;
  const silenceMsIncomplete = options.silenceMsIncomplete ?? DEFAULT_SILENCE_INCOMPLETE_MS;
  const silenceMsIncompleteAfterFinal =
    options.silenceMsIncompleteAfterFinal ?? DEFAULT_SILENCE_INCOMPLETE_AFTER_FINAL_MS;
  const maxIncompleteWaitMs = options.maxIncompleteWaitMs ?? DEFAULT_MAX_INCOMPLETE_WAIT_MS;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let finalParts: string[] = [];
  let latestInterim = "";
  let completed = false;
  let stoppedByUser = false;
  let incompleteWaitAccum = 0;

  const clearSilenceTimer = () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  };

  const flushComplete = () => {
    if (completed) return;
    completed = true;
    clearSilenceTimer();
    const text = [...finalParts, latestInterim].filter(Boolean).join(" ").trim();
    finalParts = [];
    latestInterim = "";
    if (text.length >= MIN_UTTERANCE_CHARS) {
      options.onUtteranceComplete(text);
    } else {
      options.onEmpty?.();
    }
  };

  const currentTranscript = () => [...finalParts, latestInterim].filter(Boolean).join(" ").trim();

  const scheduleSilenceEnd = (afterFinal = false) => {
    clearSilenceTimer();
    const text = currentTranscript();
    const endKind = classifyPhraseEnd(text);
    const phraseComplete = endKind === "complete" || endKind === "empty";

    let delay: number;
    if (phraseComplete) {
      incompleteWaitAccum = 0;
      delay = afterFinal && !latestInterim ? silenceMsAfterFinal : silenceMs;
    } else {
      options.onPhraseIncomplete?.();
      delay = afterFinal && !latestInterim ? silenceMsIncompleteAfterFinal : silenceMsIncomplete;
      incompleteWaitAccum += delay;
      if (incompleteWaitAccum >= maxIncompleteWaitMs) {
        incompleteWaitAccum = 0;
        delay = Math.min(silenceMsAfterFinal, 280);
      }
    }

    silenceTimer = setTimeout(() => {
      try {
        rec.stop();
      } catch {
        flushComplete();
      }
    }, delay);
  };

  rec.lang = options.lang;
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onstart = () => {
    options.onListening?.();
  };

  rec.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const row = ev.results[i];
      if (!row) continue;
      const t = row[0]?.transcript?.trim() ?? "";
      if (!t) continue;
      options.onSpeechActivity?.();
      incompleteWaitAccum = 0;
      if (row.isFinal) {
        finalParts.push(t);
        latestInterim = "";
        options.onInterim?.(finalParts.join(" ").trim());
        scheduleSilenceEnd(true);
      } else {
        interim += (interim ? " " : "") + t;
      }
    }
    if (interim) {
      latestInterim = interim;
      options.onInterim?.([...finalParts, interim].filter(Boolean).join(" ").trim());
      scheduleSilenceEnd(false);
    } else if (finalParts.length > 0) {
      options.onInterim?.(finalParts.join(" ").trim());
      scheduleSilenceEnd(true);
    }
  };

  rec.onerror = (ev) => {
    const code = ev?.error ?? "unknown";
    if (code === "aborted") return;
    if (code === "no-speech") {
      scheduleSilenceEnd();
      return;
    }
    clearSilenceTimer();
    options.onError?.(code);
  };

  rec.onend = () => {
    clearSilenceTimer();
    if (!stoppedByUser) flushComplete();
    options.onEnd?.();
  };

  const startRecognition = () => {
    const track = options.audioTrack;
    if (track?.kind === "audio" && track.readyState === "live") {
      try {
        rec.start(track);
        return;
      } catch {
        /* fall through to default mic */
      }
    }
    rec.start();
  };

  try {
    startRecognition();
  } catch {
    options.onError?.("start-failed");
    return null;
  }

  return {
    stop: () => {
      stoppedByUser = true;
      clearSilenceTimer();
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    },
    abort: () => {
      stoppedByUser = true;
      completed = true;
      clearSilenceTimer();
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    },
  };
}

/** @deprecated Use startUtteranceRecognition for hands-free practice. */
export type SpeechRecognitionSession = UtteranceRecognitionSession;

/** @deprecated Use startUtteranceRecognition for hands-free practice. */
export function startSpeechRecognition(options: {
  lang: SpeechInputLang;
  onResult: (text: string, isFinal: boolean) => void;
  onEnd?: () => void;
  onError?: (code: string) => void;
}): UtteranceRecognitionSession | null {
  return startUtteranceRecognition({
    lang: options.lang,
    onInterim: (text) => options.onResult(text, false),
    onUtteranceComplete: (text) => options.onResult(text, true),
    onEnd: options.onEnd,
    onError: options.onError,
  });
}
