/** Cross-widget navigation (e.g. AI chat → workspace tabs). */

export type WorkspaceNavigateArea =
  | "documents"
  | "flashcards"
  | "audioLesson"
  | "googleSheet"
  | "timer"
  | "translate"
  | "grammar"
  | "youtube"
  | "lessonPlan";

const WORKSPACE_NAVIGATE = "workspace-navigate";

export function navigateWorkspace(area: WorkspaceNavigateArea) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<{ area: WorkspaceNavigateArea }>(WORKSPACE_NAVIGATE, {
      detail: { area },
    })
  );
}

export function onWorkspaceNavigate(handler: (area: WorkspaceNavigateArea) => void) {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<{ area?: WorkspaceNavigateArea }>).detail;
    if (detail?.area) handler(detail.area);
  };
  window.addEventListener(WORKSPACE_NAVIGATE, listener);
  return () => window.removeEventListener(WORKSPACE_NAVIGATE, listener);
}
