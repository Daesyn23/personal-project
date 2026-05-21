/**
 * Browser Web Speech API (SpeechRecognition) for hands-free practice chat.
 */

export type SpeechInputLang = "ja-JP" | "en-US" | "fil-PH";

const DEFAULT_SILENCE_MS = 1400;
const MIN_UTTERANCE_CHARS = 2;

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
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
  /** Ms of silence after last heard speech before auto-submit (default 1400). */
  silenceMs?: number;
  onInterim?: (text: string) => void;
  /** Fired once when silence is detected or the engine ends with transcript. */
  onUtteranceComplete: (text: string) => void;
  onListening?: () => void;
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
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let finalParts: string[] = [];
  let latestInterim = "";
  let completed = false;
  let stoppedByUser = false;

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
    }
  };

  const scheduleSilenceEnd = () => {
    clearSilenceTimer();
    silenceTimer = setTimeout(() => {
      try {
        rec.stop();
      } catch {
        flushComplete();
      }
    }, silenceMs);
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
      if (row.isFinal) {
        finalParts.push(t);
        latestInterim = "";
      } else {
        interim += (interim ? " " : "") + t;
      }
    }
    if (interim) {
      latestInterim = interim;
      options.onInterim?.([...finalParts, interim].filter(Boolean).join(" ").trim());
      scheduleSilenceEnd();
    } else if (finalParts.length > 0) {
      options.onInterim?.(finalParts.join(" ").trim());
      scheduleSilenceEnd();
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
    options.onEnd?.();
    if (!stoppedByUser) flushComplete();
  };

  try {
    rec.start();
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
