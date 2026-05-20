"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type FloatingPanelSizeConfig = {
  storageKey: string;
  minW: number;
  minH: number;
  defaultW: number;
  defaultH: number;
  maxW?: number;
  maxH?: number;
};

function clampPanelSize(
  w: number,
  h: number,
  { minW, minH, maxW, maxH }: FloatingPanelSizeConfig
): { w: number; h: number } {
  if (typeof window === "undefined") {
    const capW = maxW ?? 720;
    const capH = maxH ?? 800;
    return {
      w: Math.round(Math.max(minW, Math.min(capW, w))),
      h: Math.round(Math.max(minH, Math.min(capH, h))),
    };
  }
  const viewportMaxW = Math.min(window.innerWidth - 32, maxW ?? 720);
  const viewportMaxH = Math.min(window.innerHeight * 0.88, maxH ?? 800);
  return {
    w: Math.round(Math.max(minW, Math.min(viewportMaxW, w))),
    h: Math.round(Math.max(minH, Math.min(viewportMaxH, h))),
  };
}

function loadPanelSize(config: FloatingPanelSizeConfig): { w: number; h: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(config.storageKey);
    if (!raw) return null;
    const p = JSON.parse(raw) as { w?: unknown; h?: unknown };
    if (typeof p.w !== "number" || typeof p.h !== "number") return null;
    return clampPanelSize(p.w, p.h, config);
  } catch {
    return null;
  }
}

function persistPanelSize(storageKey: string, size: { w: number; h: number }) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(size));
  } catch {
    /* ignore */
  }
}

export function useFloatingPanelSize(config: FloatingPanelSizeConfig, open: boolean) {
  const [panelSize, setPanelSize] = useState<{ w: number; h: number }>({
    w: config.defaultW,
    h: config.defaultH,
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const panelSizeRef = useRef(panelSize);
  const hydratedRef = useRef(false);

  panelSizeRef.current = panelSize;

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const saved = loadPanelSize(config);
    if (saved) {
      setPanelSize(saved);
      panelSizeRef.current = saved;
    }
  }, [config]);

  useEffect(() => {
    if (!open) return;
    const onWin = () => {
      const n = clampPanelSize(panelSizeRef.current.w, panelSizeRef.current.h, config);
      panelSizeRef.current = n;
      persistPanelSize(config.storageKey, n);
      setPanelSize(n);
    };
    window.addEventListener("resize", onWin);
    return () => window.removeEventListener("resize", onWin);
  }, [open, config]);

  useLayoutEffect(() => {
    if (!open) return;
    setPanelSize((s) => {
      const n = clampPanelSize(s.w, s.h, config);
      if (n.w === s.w && n.h === s.h) return s;
      panelSizeRef.current = n;
      persistPanelSize(config.storageKey, n);
      return n;
    });
  }, [open, config]);

  const onResizeHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = panelSizeRef.current.w;
      const startH = panelSizeRef.current.h;

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        const next = clampPanelSize(startW - (ev.clientX - startX), startH - (ev.clientY - startY), config);
        panelSizeRef.current = next;
        setPanelSize(next);
      };

      const cleanup = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        try {
          handle.releasePointerCapture(ev.pointerId);
        } catch {
          /* already released */
        }
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", cleanup);
        handle.removeEventListener("pointercancel", cleanup);
        persistPanelSize(config.storageKey, panelSizeRef.current);
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", cleanup);
      handle.addEventListener("pointercancel", cleanup);
    },
    [config]
  );

  const panelStyle = {
    width: panelSize.w,
    height: panelSize.h,
    minWidth: config.minW,
    minHeight: config.minH,
    maxWidth: `min(calc(100vw - 2rem), ${config.maxW ?? 720}px)`,
    maxHeight: `min(88dvh, ${config.maxH ?? 800}px)`,
  } as const;

  return { panelRef, panelSize, panelStyle, onResizeHandlePointerDown };
}
