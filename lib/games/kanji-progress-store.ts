import { emptyProgress, parseProgress, recordRound, type PracticeRound } from "./kanji-progress";

export const PROGRESS_KEY = "kanji-game-progress-v1";
export const PROGRESS_EVENT = "kanji-progress-changed";
let memory = emptyProgress();
let memoryOnly = false;

export function newPracticeRoundId(): string {
  // Local-network mobile previews may not expose the secure-context UUID API.
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function loadKanjiProgress() {
  try {
    if (!memoryOnly) memory = parseProgress(window.localStorage.getItem(PROGRESS_KEY));
  } catch { memoryOnly = true; }
  return { progress: memory, persistent: !memoryOnly };
}

export function saveKanjiRound(round: PracticeRound): boolean {
  const { progress } = loadKanjiProgress();
  memory = recordRound(progress, round);
  try { window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(memory)); memoryOnly = false; }
  catch { memoryOnly = true; }
  window.dispatchEvent(new Event(PROGRESS_EVENT));
  return !memoryOnly;
}
