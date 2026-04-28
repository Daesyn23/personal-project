/**
 * Browser speech synthesis helpers for Japanese / English lines in the workspace.
 */

/** Invalidates in-flight deferred speak() when the user stops or a new line starts. */
let utteranceEpoch = 0;

export function cancelSpeechSynthesis(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  utteranceEpoch += 1;
  const synth = window.speechSynthesis;
  synth.cancel();
  prepareSpeechSynthesis(synth);
}

/** Wake queue after cancel (Chrome often leaves synthesis paused, which drops audio). */
function prepareSpeechSynthesis(synth: SpeechSynthesis): void {
  void synth.getVoices();
  try {
    synth.resume();
  } catch {
    /* resume missing on some engines */
  }
}

/**
 * Chromium-based browsers (desktop Chrome, iOS Chrome `CriOS`, Chromium; not desktop Edge),
 * where assigning `utterance.voice` often yields silence or errors.
 */
function isChromiumChrome(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const chromium = /\bChrome\b/.test(ua) || /\bCriOS\b/.test(ua) || /\bChromium\b/.test(ua);
  return chromium && !/\bEdg\b/.test(ua);
}

/** Cancel current speech and bump epoch so pending deferred speaks are dropped. */
function beginNewUtterance(synth: SpeechSynthesis): number {
  utteranceEpoch++;
  // Always clear the queue first — fixes Chrome “stuck” / ghost-pending states before the next speak().
  synth.cancel();
  prepareSpeechSynthesis(synth);
  return utteranceEpoch;
}

/** Unpause, speak, then unpause again (Chrome often leaves `speechSynthesis` paused). */
function speakAndResume(synth: SpeechSynthesis, u: SpeechSynthesisUtterance): void {
  try {
    synth.resume();
  } catch {
    /* ignore */
  }
  synth.speak(u);
  try {
    synth.resume();
  } catch {
    /* ignore */
  }
}

/**
 * Chrome (especially on real HTTPS origins) only allows `speechSynthesis.speak()` inside the
 * same synchronous user-activation turn as the click. `queueMicrotask`, `requestAnimationFrame`,
 * or `setTimeout` between click and `speak()` often yields silence or `not-allowed` — while
 * `localhost` can appear to work anyway.
 *
 * We still call `getVoices()` here (side effect: some engines populate the list); then run
 * `speak` immediately. Lang-only utterances work even when the voice list is still empty.
 */
function runSpeakInUserGestureTurn(synth: SpeechSynthesis, epoch: number, fn: () => void): void {
  void synth.getVoices();
  if (epoch !== utteranceEpoch) return;
  fn();
}

export function getBestJapaneseVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === "undefined") return undefined;
  const list = window.speechSynthesis.getVoices();
  return (
    list.find((v) => v.lang.replace("_", "-").toLowerCase().startsWith("ja")) ||
    list.find((v) => /Japanese|日本語|Kyoto|Otoya|Hattori/i.test(v.name))
  );
}

export function getBestEnglishVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === "undefined") return undefined;
  const list = window.speechSynthesis.getVoices();
  return (
    list.find((v) => v.lang.replace("_", "-").toLowerCase().startsWith("en")) ||
    list.find((v) => /English|Samantha|Alex|Google US English|Daniel/i.test(v.name))
  );
}

export type SpeakCallbacks = {
  onEnd?: () => void;
  /** Browser error code when available, e.g. "not-allowed", "synthesis-failed". */
  onError?: (code?: string) => void;
};

/** Replacing or canceling an utterance fires these — not user-facing failures. */
const BENIGN_SYNTH_ERRORS = new Set(["canceled", "interrupted"]);

/** Picking a concrete voice can fail on some Safari / mobile builds; lang-only retry often works. */
const VOICE_RETRY_ERRORS = new Set([
  "voice-unavailable",
  "language-unavailable",
  "synthesis-failed",
]);

/**
 * Speak Japanese (or kana-heavy) text with a Japanese voice when available.
 * @param kind "reading" uses a slightly slower rate (matches translation UI).
 */
export function speakJapaneseLine(text: string, kind: "japanese" | "reading", callbacks: SpeakCallbacks): void {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  if (!synth) {
    callbacks.onError?.("no-api");
    return;
  }
  const trimmed = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (!trimmed) {
    callbacks.onEnd?.();
    return;
  }

  const epoch = beginNewUtterance(synth);

  runSpeakInUserGestureTurn(synth, epoch, () => {
    if (epoch !== utteranceEpoch) return;

    const speakOnce = (langOnly: boolean) => {
      if (epoch !== utteranceEpoch) return;
      const voice = langOnly || isChromiumChrome() ? undefined : getBestJapaneseVoice();
      const u = new SpeechSynthesisUtterance(trimmed);
      u.volume = 1;
      if (voice && !langOnly) {
        const vl = (voice.lang ?? "").replace("_", "-").toLowerCase();
        u.lang = vl.startsWith("ja") && voice.lang ? voice.lang : "ja-JP";
        u.voice = voice;
      } else {
        u.lang = "ja-JP";
      }
      u.rate = Math.min(1, kind === "reading" ? 0.88 : 0.9);
      u.pitch = 1;
      u.onend = () => callbacks.onEnd?.();
      u.onerror = (ev) => {
        const e = ev as SpeechSynthesisErrorEvent;
        const code = e?.error ?? "speech-synthesis-error";
        if (BENIGN_SYNTH_ERRORS.has(code)) return;
        if (!langOnly && VOICE_RETRY_ERRORS.has(code)) {
          speakOnce(true);
          return;
        }
        callbacks.onError?.(code);
      };

      if (epoch !== utteranceEpoch) return;

      try {
        speakAndResume(synth, u);
      } catch {
        if (!langOnly) {
          speakOnce(true);
          return;
        }
        callbacks.onError?.("speak-threw");
      }
    };

    speakOnce(false);
  });
}

/** Speak Latin-script lines (romaji, English gloss) with an English voice when available. */
export function speakEnglishLine(text: string, callbacks: SpeakCallbacks): void {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  if (!synth) {
    callbacks.onError?.("no-api");
    return;
  }
  const trimmed = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (!trimmed) {
    callbacks.onEnd?.();
    return;
  }

  const epoch = beginNewUtterance(synth);

  runSpeakInUserGestureTurn(synth, epoch, () => {
    if (epoch !== utteranceEpoch) return;

    const speakOnce = (langOnly: boolean) => {
      if (epoch !== utteranceEpoch) return;
      const voice = langOnly || isChromiumChrome() ? undefined : getBestEnglishVoice();
      const u = new SpeechSynthesisUtterance(trimmed);
      u.volume = 1;
      if (voice && !langOnly) {
        const vl = (voice.lang ?? "").replace("_", "-").toLowerCase();
        u.lang = vl.startsWith("en") && voice.lang ? voice.lang : "en-US";
        u.voice = voice;
      } else {
        u.lang = "en-US";
      }
      u.rate = Math.min(1, 0.9);
      u.pitch = 1;
      u.onend = () => callbacks.onEnd?.();
      u.onerror = (ev) => {
        const e = ev as SpeechSynthesisErrorEvent;
        const code = e?.error ?? "speech-synthesis-error";
        if (BENIGN_SYNTH_ERRORS.has(code)) return;
        if (!langOnly && VOICE_RETRY_ERRORS.has(code)) {
          speakOnce(true);
          return;
        }
        callbacks.onError?.(code);
      };

      if (epoch !== utteranceEpoch) return;

      try {
        speakAndResume(synth, u);
      } catch {
        if (!langOnly) {
          speakOnce(true);
          return;
        }
        callbacks.onError?.("speak-threw");
      }
    };

    speakOnce(false);
  });
}
