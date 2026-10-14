"use client";

import { useEffect, useState } from "react";
import { emptyProgress } from "@/lib/games/kanji-progress";
import { loadKanjiProgress, watchKanjiProgress } from "@/lib/games/kanji-progress-store";

export function useKanjiProgress() {
  const [snapshot, setSnapshot] = useState<ReturnType<typeof loadKanjiProgress>>({
    progress: emptyProgress(), persistent: true, syncStatus: "connecting", pendingCount: 0, lastSyncedAt: null, accountId: null, accountEmail: null,
  });
  useEffect(() => watchKanjiProgress(() => setSnapshot(loadKanjiProgress())), []);
  return snapshot;
}
