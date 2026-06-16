/** Cross-widget navigation (e.g. dashboard → workspace tabs with context). */

import type { JlptPlaylistKey } from "@/lib/youtube-jlpt-playlists";

export type WorkspaceNavigateArea =
  | "dashboard"
  | "documents"
  | "flashcards"
  | "review"
  | "audioLesson"
  | "googleSheet"
  | "timer"
  | "translate"
  | "grammar"
  | "japanesePractice"
  | "youtube"
  | "lessonPlan";

export type WorkspaceNavigateDetail = {
  area: WorkspaceNavigateArea;
  /** Open Documents at this breadcrumb trail (level → lesson → …). */
  documentsTrail?: { id: string; name: string }[];
  /** Open Flashcards with this set selected. */
  flashcardSetId?: string | null;
  /** Open Video Lessons: JLPT folder + optional video. */
  youtube?: {
    jlptKey: JlptPlaylistKey;
    lessonNumber?: number;
    videoId?: string;
  };
};

const WORKSPACE_NAVIGATE = "workspace-navigate";

export function navigateWorkspace(area: WorkspaceNavigateArea) {
  navigateWorkspaceDetail({ area });
}

export function navigateWorkspaceDetail(detail: WorkspaceNavigateDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WorkspaceNavigateDetail>(WORKSPACE_NAVIGATE, {
      detail,
    })
  );
}

export function onWorkspaceNavigate(handler: (detail: WorkspaceNavigateDetail) => void) {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<WorkspaceNavigateDetail>).detail;
    if (detail?.area) handler(detail);
  };
  window.addEventListener(WORKSPACE_NAVIGATE, listener);
  return () => window.removeEventListener(WORKSPACE_NAVIGATE, listener);
}
