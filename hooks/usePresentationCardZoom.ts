import { useCallback, useEffect, useState } from "react";

export const PRESENTATION_ZOOM_MIN = 0.6;
export const PRESENTATION_ZOOM_MAX = 3;
export const PRESENTATION_ZOOM_DEFAULT = 1;

/** Counter-scale card chrome so toolbar icons stay a consistent size when zoomed in. */
export function compensatePresentationToolbarZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 1) return 1;
  return 1 / zoom;
}

function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return PRESENTATION_ZOOM_DEFAULT;
  return Math.min(PRESENTATION_ZOOM_MAX, Math.max(PRESENTATION_ZOOM_MIN, value));
}

function loadZoom(storageKey: string): number {
  if (typeof window === "undefined") return PRESENTATION_ZOOM_DEFAULT;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return PRESENTATION_ZOOM_DEFAULT;
    return clampZoom(parseFloat(raw));
  } catch {
    return PRESENTATION_ZOOM_DEFAULT;
  }
}

export function usePresentationCardZoom(storageKey: string) {
  const [zoom, setZoom] = useState(PRESENTATION_ZOOM_DEFAULT);

  useEffect(() => {
    setZoom(loadZoom(storageKey));
  }, [storageKey]);

  const setCardZoom = useCallback(
    (value: number) => {
      const next = clampZoom(value);
      setZoom(next);
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        /* ignore quota */
      }
    },
    [storageKey]
  );

  return { zoom, setCardZoom };
}
