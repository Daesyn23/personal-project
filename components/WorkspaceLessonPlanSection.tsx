"use client";

import { useEffect, useState } from "react";
import { HeadingWithInfo } from "@/components/InfoTip";
import { listFlashcardsInSet } from "@/lib/flashcards-repo";
import type { FlashcardRow } from "@/lib/types";

type Props = {
  activeSetId: string | null;
  setTitle: string | null;
};

function cardHeadline(c: FlashcardRow): string {
  const k = (c.kana ?? "").trim();
  const d = (c.definition ?? "").trim();
  if (k && d) return `${k} — ${d}`;
  return k || d || "Untitled";
}

export function WorkspaceLessonPlanSection({ activeSetId, setTitle }: Props) {
  const [cards, setCards] = useState<FlashcardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeSetId) {
      setCards([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listFlashcardsInSet(activeSetId)
      .then((data) => {
        if (!cancelled) setCards(data);
      })
      .catch(() => {
        if (!cancelled) {
          setCards([]);
          setError("Could not load cards for this set.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSetId]);

  if (!activeSetId) {
    return (
      <div className="rounded-2xl border border-dashed border-pink-200 bg-pink-50/40 px-6 py-14 text-center text-sm text-neutral-600">
        <p className="font-medium text-neutral-800">No set selected</p>
        <p className="mt-2 text-neutral-500">Open the Flashcards tab and choose a set to see lesson prep notes here.</p>
      </div>
    );
  }

  return (
    <div className="lesson-plan-root space-y-6 print:space-y-4">
      <style>{`
        @media print {
          .lesson-plan-root .no-print { display: none !important; }
          .lesson-plan-root { max-width: none !important; }
        }
      `}</style>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-pink-100/90 bg-white/95 p-5 shadow-sm ring-1 ring-rose-50/60 print:border-neutral-300 print:shadow-none">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-pink-600/90">Lesson plan</p>
          <HeadingWithInfo
            className="no-print"
            infoLabel="Lesson plan"
            heading={
              <h2 className="mt-1 text-xl font-bold text-neutral-900 print:text-black">{setTitle ?? "Set"}</h2>
            }
          >
            Teacher research and notes are not shown on flashcard slides. Use this page to review or print before class.
          </HeadingWithInfo>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="no-print rounded-xl border border-pink-200 bg-pink-50 px-4 py-2 text-sm font-semibold text-pink-900 transition hover:bg-pink-100"
        >
          Print
        </button>
      </div>

      {loading && (
        <p className="text-sm text-neutral-500" aria-live="polite">
          Loading…
        </p>
      )}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && cards.length === 0 && (
        <p className="text-sm text-neutral-500">This set has no cards yet.</p>
      )}

      {!loading && cards.length > 0 && (
        <ul className="space-y-6 print:space-y-5">
          {cards.map((c) => {
            const research = (c.teacher_research ?? "").trim();
            return (
              <li
                key={c.id}
                className="rounded-2xl border border-pink-100/80 bg-white p-5 shadow-sm print:break-inside-avoid print:border-neutral-200"
              >
                <h3 className="text-base font-bold text-neutral-900 print:text-black">{cardHeadline(c)}</h3>
                {(c.phonetic_reading?.trim() || c.category_label?.trim()) && (
                  <p className="mt-1 text-xs text-neutral-500 print:text-neutral-700">
                    {[c.phonetic_reading?.trim(), c.category_label?.trim()].filter(Boolean).join(" · ")}
                  </p>
                )}
                {research ? (
                  <div className="mt-3 border-t border-violet-100 pt-3 text-sm leading-relaxed text-neutral-800 print:text-black">
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-700/90 print:text-neutral-900">
                      Teacher research
                    </p>
                    <p className="mt-2 whitespace-pre-wrap">{research}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-xs italic text-neutral-400">No teacher research saved for this item.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
