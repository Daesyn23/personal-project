/** Keep only one floating panel (chat / translate) open at a time. */

export const CLOSE_FLOATING_PANELS = "workspace-close-floating-panels";

export type FloatingPanelId = "chat" | "translate";

export function requestCloseFloatingPanels(except: FloatingPanelId) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<{ except: FloatingPanelId }>(CLOSE_FLOATING_PANELS, { detail: { except } })
  );
}

export function onCloseFloatingPanels(handler: (except: FloatingPanelId) => void) {
  const listener = (e: Event) => {
    const except = (e as CustomEvent<{ except?: FloatingPanelId }>).detail?.except;
    if (except) handler(except);
  };
  window.addEventListener(CLOSE_FLOATING_PANELS, listener);
  return () => window.removeEventListener(CLOSE_FLOATING_PANELS, listener);
}

/** Panel sits above stacked chat + translate FABs. */
export const FLOATING_PANEL_ABOVE_TWO_FABS =
  "fixed bottom-[max(8.5rem,calc(env(safe-area-inset-bottom,0px)+8.5rem))] right-[max(1rem,env(safe-area-inset-right,0px))] z-[100] sm:bottom-[8.5rem] sm:right-5";

/** Panel sits above a single FAB. */
export const FLOATING_PANEL_ABOVE_ONE_FAB =
  "fixed bottom-[max(4.5rem,calc(env(safe-area-inset-bottom,0px)+4.5rem))] right-[max(1rem,env(safe-area-inset-right,0px))] z-[100] sm:bottom-[4.5rem] sm:right-5";

/** @deprecated Use FLOATING_PANEL_ABOVE_TWO_FABS */
export const FLOATING_PANEL_ABOVE_FABS = FLOATING_PANEL_ABOVE_TWO_FABS;

export const FAB_BOTTOM_PRIMARY =
  "max-sm:bottom-[max(1rem,env(safe-area-inset-bottom,0px))] max-sm:right-[max(1rem,env(safe-area-inset-right,0px))] sm:bottom-5 sm:right-5";

export const FAB_BOTTOM_STACKED =
  "max-sm:bottom-[max(4.75rem,calc(env(safe-area-inset-bottom,0px)+4.75rem))] max-sm:right-[max(1rem,env(safe-area-inset-right,0px))] sm:bottom-[5rem] sm:right-5";

export const FLOATING_PANEL_OPEN_STATE = "workspace-floating-panel-open-state";

export function publishFloatingPanelOpen(id: FloatingPanelId, open: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<{ id: FloatingPanelId; open: boolean }>(FLOATING_PANEL_OPEN_STATE, {
      detail: { id, open },
    })
  );
}

export function onFloatingPanelOpen(handler: (id: FloatingPanelId, open: boolean) => void) {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<{ id?: FloatingPanelId; open?: boolean }>).detail;
    if (detail?.id && typeof detail.open === "boolean") handler(detail.id, detail.open);
  };
  window.addEventListener(FLOATING_PANEL_OPEN_STATE, listener);
  return () => window.removeEventListener(FLOATING_PANEL_OPEN_STATE, listener);
}

export const PRESENTATION_MODE_STATE = "workspace-presentation-mode-state";

export function publishPresentationMode(active: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<{ active: boolean }>(PRESENTATION_MODE_STATE, { detail: { active } })
  );
}

export function onPresentationMode(handler: (active: boolean) => void) {
  const listener = (e: Event) => {
    const active = (e as CustomEvent<{ active?: boolean }>).detail?.active;
    if (typeof active === "boolean") handler(active);
  };
  window.addEventListener(PRESENTATION_MODE_STATE, listener);
  return () => window.removeEventListener(PRESENTATION_MODE_STATE, listener);
}
