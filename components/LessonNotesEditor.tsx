"use client";

import { useEffect, useId, useRef } from "react";

type Props = {
  open: boolean;
  initialValue: string;
  saving: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function LessonNotesEditor(props: Props) {
  const { open, initialValue, saving, error, onChange, onSave, onCancel } = props;
  const textareaId = useId();
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => areaRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  return (
    <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-pink-200/90 bg-white shadow-md ring-1 ring-pink-100/70">
      <div className="border-b border-pink-100/90 bg-gradient-to-r from-pink-50/80 to-violet-50/50 px-4 py-3 sm:px-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-pink-800">Add lesson notes</p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-600">
          Paste or type your teaching write-up. Markdown works — use <code className="rounded bg-white px-1 py-0.5 text-[11px]">##</code>{" "}
          headings, bullet lists, and tables. Saved notes sync across your devices.
        </p>
      </div>
      <div className="p-4 sm:p-5">
        <label htmlFor={textareaId} className="sr-only">
          Lesson notes
        </label>
        <textarea
          ref={areaRef}
          id={textareaId}
          value={initialValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`## Lesson overview\nLesson 34 vocabulary — JLPT N4\n\n## Vocabulary items\n| Japanese | Romaji | English |\n| ... | ... | ... |`}
          rows={14}
          className="w-full resize-y rounded-xl border-2 border-pink-200/90 bg-white px-4 py-3 font-[family-name:ui-serif,Georgia,Cambria,'Times_New_Roman',serif] text-sm leading-relaxed text-neutral-800 shadow-inner outline-none transition placeholder:text-neutral-400 focus:border-pink-400 focus:ring-4 focus:ring-pink-200/40"
        />
        {error ? (
          <p className="mt-3 text-sm text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !initialValue.trim()}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-5 text-sm font-bold text-white shadow-md shadow-pink-300/30 transition hover:brightness-[1.05] disabled:pointer-events-none disabled:opacity-45"
          >
            {saving ? "Saving…" : "Save notes"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-pink-200 bg-white px-5 text-sm font-semibold text-neutral-800 shadow-sm transition hover:bg-pink-50 disabled:opacity-45"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
