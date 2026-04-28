"use client";

import { useCallback, useRef } from "react";

/**
 * Chrome ties Web Speech to user activation; starting audio on `pointerdown` (mouse/pen/touch)
 * is more reliable than waiting for the synthetic `click`. We run once on pointerdown and skip
 * the redundant click. Keyboard / assistive tech still use `click` only.
 */
export function useSpeechActivationHandlers(onActivate: () => void) {
  const skipNextClick = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const pt = e.pointerType;
      if (pt !== "mouse" && pt !== "pen" && pt !== "touch") return;
      skipNextClick.current = true;
      onActivate();
    },
    [onActivate],
  );

  const onClick = useCallback(() => {
    if (skipNextClick.current) {
      skipNextClick.current = false;
      return;
    }
    onActivate();
  }, [onActivate]);

  return { onPointerDown, onClick };
}
