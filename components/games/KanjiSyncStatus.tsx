"use client";

import { useKanjiProgress } from "@/hooks/useKanjiProgress";
import { progressSyncMessage, syncKanjiProgress } from "@/lib/games/kanji-progress-store";

export function KanjiSyncStatus() {
  const snapshot = useKanjiProgress();
  return <div className="text-center text-xs text-neutral-500"><p role="status">{progressSyncMessage(snapshot)}</p>{["error", "setup"].includes(snapshot.syncStatus) && <button type="button" onClick={() => void syncKanjiProgress()} className="min-h-11 px-3 font-semibold text-pink-700 underline underline-offset-4">Retry sync</button>}</div>;
}
