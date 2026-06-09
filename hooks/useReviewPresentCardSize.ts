"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const STORAGE_KEY = "workspace-review-present-card-size-v1";
const DEFAULT_W = 622; // 32rem + 110px
const DEFAULT_H = 520;
const MIN_W = 360;
const MIN_H = 320;
/** Space for review header + footer controls when computing max drag height. */
const CHROME_RESERVE_Y = 148;

function maxCardSize(): { w: number; h: number } {
  if (typeof window === "undefined") {
    return { w: 1200, h: 800 };
  }
  return {
    w: window.innerWidth - 32,
    h: window.innerHeight - CHROME_RESERVE_Y,
  };
}

function clampCardSize(w: number, h: number): { w: number; h: number } {
  const { w: maxW, h: maxH } = maxCardSize();
  return {
    w: Math.round(Math.max(MIN_W, Math.min(maxW, w))),
    h: Math.round(Math.max(MIN_H, Math.min(maxH, h))),
  };
}

function defaultCardSize(): { w: number; h: number } {
  if (typeof window === "undefined") return { w: DEFAULT_W, h: DEFAULT_H };
  return clampCardSize(DEFAULT_W, Math.min(window.innerHeight * 0.7, DEFAULT_H));
}

function loadCardSize(): { w: number; h: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { w?: unknown; h?: unknown };
    if (typeof p.w !== "number" || typeof p.h !== "number") return null;
    return clampCardSize(p.w, p.h);
  } catch {
    return null;
  }
}

function persistCardSize(size: { w: number; h: number }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(size));
  } catch {
    /* ignore */
  }
}

export function useReviewPresentCardSize(open: boolean) {
  const [cardSize, setCardSize] = useState(defaultCardSize);
  const cardSizeRef = useRef(cardSize);
  const hydratedRef = useRef(false);

  cardSizeRef.current = cardSize;

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const saved = loadCardSize();
    if (saved) {
      setCardSize(saved);
      cardSizeRef.current = saved;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onWin = () => {
      const n = clampCardSize(cardSizeRef.current.w, cardSizeRef.current.h);
      cardSizeRef.current = n;
      persistCardSize(n);
      setCardSize(n);
    };
    window.addEventListener("resize", onWin);
    return () => window.removeEventListener("resize", onWin);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    setCardSize((s) => {
      const n = clampCardSize(s.w, s.h);
      if (n.w === s.w && n.h === s.h) return s;
      cardSizeRef.current = n;
      persistCardSize(n);
      return n;
    });
  }, [open]);

  const onResizeHandlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = cardSizeRef.current.w;
    const startH = cardSizeRef.current.h;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const next = clampCardSize(startW + (ev.clientX - startX), startH + (ev.clientY - startY));
      cardSizeRef.current = next;
      setCardSize(next);
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
      persistCardSize(cardSizeRef.current);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", cleanup);
    handle.addEventListener("pointercancel", cleanup);
  }, []);

  return { cardSize, onResizeHandlePointerDown };
}
