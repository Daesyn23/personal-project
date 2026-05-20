"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type InfoTipPlacement = "below-start" | "below-end" | "above-start" | "above-end";

type Props = {
  /** Accessible name for the info button (e.g. "How import works"). */
  label: string;
  children: ReactNode;
  /** Preferred placement; flips above if there is not enough room below. */
  placement?: InfoTipPlacement;
  size?: "sm" | "md";
  className?: string;
};

const TOOLTIP_Z = 9999;
const VIEWPORT_PAD = 8;
const GAP = 6;

const sizeClass = {
  sm: {
    btn: "h-7 w-7",
    icon: "h-4 w-4",
  },
  md: {
    btn: "h-8 w-8",
    icon: "h-5 w-5",
  },
} as const;

function resolvePlacement(
  preferred: InfoTipPlacement,
  anchor: DOMRect,
  tipW: number,
  tipH: number
): { top: number; left: number; resolved: InfoTipPlacement } {
  const preferBelow = preferred.startsWith("below");
  const preferEnd = preferred.endsWith("end");
  const spaceBelow = window.innerHeight - anchor.bottom;
  const spaceAbove = anchor.top;
  const below = preferBelow ? spaceBelow >= tipH + GAP + VIEWPORT_PAD : false;
  const above = !below && (preferBelow ? spaceAbove >= tipH + GAP + VIEWPORT_PAD : true);

  const resolved: InfoTipPlacement = below
    ? preferEnd
      ? "below-end"
      : "below-start"
    : above
      ? preferEnd
        ? "above-end"
        : "above-start"
      : spaceBelow >= spaceAbove
        ? preferEnd
          ? "below-end"
          : "below-start"
        : preferEnd
          ? "above-end"
          : "above-start";

  let top =
    resolved.startsWith("below") ? anchor.bottom + GAP : anchor.top - tipH - GAP;
  let left = resolved.endsWith("end") ? anchor.right - tipW : anchor.left;

  left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - tipW - VIEWPORT_PAD));
  top = Math.max(VIEWPORT_PAD, Math.min(top, window.innerHeight - tipH - VIEWPORT_PAD));

  return { top, left, resolved };
}

export function InfoTip({ label, children, placement = "below-start", size = "sm", className = "" }: Props) {
  const s = sizeClass[size];
  const tipId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    const btn = btnRef.current;
    const tip = tipRef.current;
    if (!btn || !tip) return;
    const anchor = btn.getBoundingClientRect();
    const tipW = tip.offsetWidth;
    const tipH = tip.offsetHeight;
    const next = resolvePlacement(placement, anchor, tipW, tipH);
    setPos({ top: next.top, left: next.left });
  }, [placement]);

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => {
    setOpen(false);
    setPos(null);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePosition]);

  const tooltip =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={tipRef}
            id={tipId}
            role="tooltip"
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              zIndex: TOOLTIP_Z,
              visibility: pos ? "visible" : "hidden",
            }}
            className="w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-pink-200 bg-white p-3 text-left text-xs leading-relaxed text-neutral-600 shadow-xl ring-1 ring-pink-100"
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            {children}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`inline-flex shrink-0 align-middle ${s.btn} items-center justify-center rounded-full text-neutral-400 transition hover:bg-pink-50 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 ${className}`}
        aria-label={label}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={s.icon}
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.25-3.75a.75.75 0 0 0-1.5 0v.375a.75.75 0 0 0 1.5 0Zm-.75 11.25h.008v.008H9.75v-.008Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {tooltip}
    </>
  );
}

type HeadingWithInfoProps = {
  /** Heading element (h1–h3) with its own classes. */
  heading: ReactNode;
  infoLabel: string;
  children: ReactNode;
  /** `start` aligns icon with first line of multi-line/large titles; `center` for single-line modal titles. */
  align?: "start" | "center";
  placement?: InfoTipPlacement;
  className?: string;
};

/** Title row with a compact info icon aligned to the heading cap height. */
export function HeadingWithInfo({
  heading,
  infoLabel,
  children,
  align = "start",
  placement = "below-start",
  className = "",
}: HeadingWithInfoProps) {
  return (
    <div
      className={`flex gap-1 ${align === "center" ? "items-center" : "items-start"} ${className}`}
    >
      <div className="min-w-0">{heading}</div>
      <InfoTip
        label={infoLabel}
        placement={placement}
        size="sm"
        className={align === "start" ? "mt-0.5" : ""}
      >
        {children}
      </InfoTip>
    </div>
  );
}
