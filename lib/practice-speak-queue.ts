/**
 * Queue tutor speech for practice — OpenAI TTS first (natural), browser fallback.
 */

import type { PracticeTtsRegister } from "@/lib/openai-tts";
import { segmentTextForTutorTts } from "@/lib/openai-tts";
import {
  prefetchTutorLine,
  speakTutorLine,
  speakTutorLineBrowserFallback,
  type PracticeSpeakCallbacks,
} from "@/lib/practice-voice-playback";

type QueuedLine = { text: string; register: PracticeTtsRegister };

let queue: QueuedLine[] = [];
let draining = false;
let sessionCallbacks: PracticeSpeakCallbacks | null = null;
let defaultRegister: PracticeTtsRegister = "polite";

function mergeSessionCallbacks(callbacks?: PracticeSpeakCallbacks): void {
  if (!callbacks) return;
  if (!sessionCallbacks) {
    sessionCallbacks = callbacks;
    return;
  }
  if (callbacks.onEnd) {
    const prevEnd = sessionCallbacks.onEnd;
    sessionCallbacks = {
      ...sessionCallbacks,
      onEnd: () => {
        prevEnd?.();
        callbacks.onEnd?.();
      },
    };
  }
  if (callbacks.onError) {
    const prevErr = sessionCallbacks.onError;
    sessionCallbacks = {
      ...sessionCallbacks,
      onError: (code) => {
        prevErr?.(code);
        callbacks.onError?.(code);
      },
    };
  }
}

function drain(): void {
  if (draining || queue.length === 0) {
    if (!draining && queue.length === 0) {
      sessionCallbacks?.onEnd?.();
      sessionCallbacks = null;
    }
    return;
  }

  draining = true;
  const { text, register } = queue.shift()!;
  const speakOpts = { speechRegister: register };

  if (queue.length > 0) {
    prefetchTutorLine(queue[0]!.text, { speechRegister: queue[0]!.register });
    if (queue.length > 1) {
      prefetchTutorLine(queue[1]!.text, { speechRegister: queue[1]!.register });
    }
  }

  void (async () => {
    const played = await speakTutorLine(text, {
      onEnd: () => {
        draining = false;
        drain();
      },
      onError: (code) => {
        sessionCallbacks?.onError?.(code);
        draining = false;
        drain();
      },
    }, speakOpts);

    if (!played) {
      speakTutorLineBrowserFallback(text, {
        onEnd: () => {
          draining = false;
          drain();
        },
        onError: (code) => {
          sessionCallbacks?.onError?.(code);
          draining = false;
          drain();
        },
      });
    }
  })();
}

/** Append lines to speak; `onEnd` fires when the whole queue finishes. */
export function enqueuePracticeSpeech(
  lines: string[],
  callbacks?: PracticeSpeakCallbacks,
  options?: { speechRegister?: PracticeTtsRegister }
): void {
  const register = options?.speechRegister === "casual" ? "casual" : defaultRegister;
  const trimmed = lines.map((l) => l.trim()).filter(Boolean);
  if (trimmed.length === 0) {
    callbacks?.onEnd?.();
    return;
  }

  mergeSessionCallbacks(callbacks);

  const combined = trimmed.join(" ");
  for (const segment of segmentTextForTutorTts(combined)) {
    queue.push({ text: segment, register });
  }

  if (!draining && queue.length > 0) {
    prefetchTutorLine(queue[0]!.text, { speechRegister: queue[0]!.register });
  }
  if (!draining) drain();
}

export function setPracticeSpeakRegister(register: PracticeTtsRegister): void {
  defaultRegister = register === "casual" ? "casual" : "polite";
}

export function cancelPracticeSpeakQueue(): void {
  queue = [];
  draining = false;
  sessionCallbacks = null;
}

export function practiceSpeakQueueActive(): boolean {
  return draining || queue.length > 0;
}

/** Run `fn` when the queue is empty and nothing is playing. */
export function whenPracticeSpeakQueueIdle(fn: () => void): void {
  if (!practiceSpeakQueueActive()) {
    fn();
    return;
  }
  const tick = () => {
    if (!practiceSpeakQueueActive()) fn();
    else window.setTimeout(tick, 40);
  };
  tick();
}
