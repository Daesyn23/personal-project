"use client";

import { LessonNotesMarkdown } from "@/components/LessonNotesMarkdown";
import { useEffect } from "react";

type Props = {
  open: boolean;
  videoTitle: string;
  markdown: string;
  metaLine?: string | null;
  onClose: () => void;
  onCopy?: () => void;
  onEdit?: () => void;
};

export function LessonNotesFullscreen(props: Props) {
  const { open, videoTitle, markdown, metaLine, onClose, onCopy, onEdit } = props;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-gradient-to-b from-violet-50 via-white to-pink-50/40"
      role="dialog"
      aria-modal="true"
      aria-label="Teaching write-up fullscreen"
    >
      <header className="shrink-0 border-b border-violet-200/80 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-sm sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">Teaching write-up</p>
            <h3 className="mt-1 text-base font-semibold leading-snug text-neutral-900 sm:text-lg">{videoTitle}</h3>
            {metaLine ? <p className="mt-1 text-xs text-neutral-500">{metaLine}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-full border border-violet-200 bg-white px-3.5 py-2 text-xs font-semibold text-violet-900 shadow-sm transition hover:bg-violet-50"
              >
                Edit
              </button>
            ) : null}
            {onCopy ? (
              <button
                type="button"
                onClick={onCopy}
                className="rounded-full border border-violet-200 bg-white px-3.5 py-2 text-xs font-semibold text-violet-900 shadow-sm transition hover:bg-violet-50"
              >
                Copy notes
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-violet-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-violet-800"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Exit fullscreen
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-violet-100/90 bg-white/90 px-5 py-6 shadow-lg ring-1 ring-violet-50 sm:px-8 sm:py-8">
          <LessonNotesMarkdown markdown={markdown} />
        </div>
      </div>
    </div>
  );
}
