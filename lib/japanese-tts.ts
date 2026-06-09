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

/** True when Chrome is unlikely to have a Japanese engine unless the OS installed one (common on Windows). */
export function chromeLikelyMissingJapaneseVoice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (!("speechSynthesis" in window) || !isChromiumChrome()) return false;
  const ua = navigator.userAgent;
  if (/\bMac OS X\b/.test(ua) || /\biPhone OS\b/.test(ua) || /\biPad\b/.test(ua)) return false;
  void window.speechSynthesis.getVoices();
  return !getBestJapaneseVoice();
}

export type SpeakCallbacks = {
  onEnd?: () => void;
  /** Browser error code when available, e.g. "not-allowed", "synthesis-failed". */
  onError?: (code?: string) => void;
};

const BENIGN_SYNTH_ERRORS = new Set(["canceled", "interrupted"]);

const VOICE_RETRY_ERRORS = new Set([
  "voice-unavailable",
  "language-unavailable",
  "synthesis-failed",
]);

/**
 * Speak Japanese (or kana-heavy) text with a Japanese voice when available.
 * @param kind "reading" = slower; "practice" = conversational tutor pace.
 */
export function speakJapaneseLine(
  text: string,
  kind: "japanese" | "reading" | "practice",
  callbacks: SpeakCallbacks
): void {
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

    const speakOnce = (langOnly: boolean, shortJa: boolean) => {
      if (epoch !== utteranceEpoch) return;
      const voice = langOnly || isChromiumChrome() ? undefined : getBestJapaneseVoice();
      const u = new SpeechSynthesisUtterance(trimmed);
      u.volume = 1;
      if (voice && !langOnly) {
        const vl = (voice.lang ?? "").replace("_", "-").toLowerCase();
        u.lang = vl.startsWith("ja") && voice.lang ? voice.lang : "ja-JP";
        u.voice = voice;
      } else {
        u.lang = shortJa ? "ja" : "ja-JP";
      }
      u.rate = Math.min(1, kind === "reading" ? 0.88 : kind === "practice" ? 0.96 : 0.9);
      u.pitch = kind === "practice" ? 1.04 : 1;
      u.onend = () => callbacks.onEnd?.();
      u.onerror = (ev) => {
        const e = ev as SpeechSynthesisErrorEvent;
        const code = e?.error ?? "speech-synthesis-error";
        if (BENIGN_SYNTH_ERRORS.has(code)) return;
        if (!langOnly && VOICE_RETRY_ERRORS.has(code)) {
          speakOnce(true, false);
          return;
        }
        if (langOnly && !shortJa && VOICE_RETRY_ERRORS.has(code)) {
          speakOnce(true, true);
          return;
        }
        callbacks.onError?.(code);
      };

      if (epoch !== utteranceEpoch) return;

      try {
        speakAndResume(synth, u);
      } catch {
        if (!langOnly) {
          speakOnce(true, false);
          return;
        }
        if (!shortJa) {
          speakOnce(true, true);
          return;
        }
        callbacks.onError?.("speak-threw");
      }
    };

    speakOnce(false, false);
  });
}

/** Speak Latin-script lines (romaji, English gloss) with an English voice when available. */
export function speakEnglishLine(
  text: string,
  callbacks: SpeakCallbacks,
  kind: "default" | "practice" = "default"
): void {
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
      u.rate = Math.min(1, kind === "practice" ? 0.96 : 0.9);
      u.pitch = kind === "practice" ? 1.03 : 1;
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
