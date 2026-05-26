/**
 * Queue browser TTS lines for practice — starts the next line when the previous ends.
 */

import { speakTutorLineBrowserFallback, type PracticeSpeakCallbacks } from "@/lib/practice-voice-playback";

let queue: string[] = [];
let draining = false;
let sessionCallbacks: PracticeSpeakCallbacks | null = null;

function drain(): void {
  if (draining || queue.length === 0) {
    if (!draining && queue.length === 0) {
      sessionCallbacks?.onEnd?.();
      sessionCallbacks = null;
    }
    return;
  }

  draining = true;
  const line = queue.shift()!;
  speakTutorLineBrowserFallback(line, {
    onEnd: () => {
      draining = false;
      drain();
    },
    onError: (code) => {
      draining = false;
      sessionCallbacks?.onError?.(code);
      drain();
    },
  });
}

/** Append lines to speak; `onEnd` fires when the whole queue finishes. */
export function enqueuePracticeSpeech(lines: string[], callbacks?: PracticeSpeakCallbacks): void {
  const trimmed = lines.map((l) => l.trim()).filter(Boolean);
  if (trimmed.length === 0) {
    callbacks?.onEnd?.();
    return;
  }

  if (!sessionCallbacks && callbacks) {
    sessionCallbacks = callbacks;
  } else if (callbacks?.onEnd) {
    const prevEnd = sessionCallbacks?.onEnd;
    sessionCallbacks = {
      ...sessionCallbacks,
      onEnd: () => {
        prevEnd?.();
        callbacks.onEnd?.();
      },
    };
  }

  queue.push(...trimmed);
  if (!draining) drain();
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
