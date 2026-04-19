"use client";

import { useState } from "react";
import { appendCardsToSet } from "@/lib/flashcards-repo";
import type { FlashcardDraft } from "@/lib/types";

type Props = {
  setId: string;
  onAdded: () => void;
  /** When true, panel starts open (e.g. empty set). */
  defaultExpanded?: boolean;
};

function emptyDraft(): FlashcardDraft {
  return {
    set_id: null,
    phonetic_reading: null,
    native_script: null,
    kana: null,
    kanji: null,
    category_label: null,
    definition: null,
    context_note: null,
    example_sentence: null,
    example_translation: null,
    position: 0,
  };
}

const inputClass =
  "mt-1 w-full rounded-xl border border-pink-100/90 bg-[#fffafc] px-3 py-2.5 text-sm text-neutral-800 shadow-inner shadow-pink-950/5 outline-none transition placeholder:text-neutral-400 focus:border-pink-300 focus:ring-2 focus:ring-pink-200/60";
const textareaClass =
  "mt-1 w-full rounded-xl border border-pink-100/90 bg-[#fffafc] px-3 py-2.5 text-sm text-neutral-800 shadow-inner shadow-pink-950/5 outline-none transition placeholder:text-neutral-400 focus:border-pink-300 focus:ring-2 focus:ring-pink-200/60";
const kanaTextareaClass =
  "mt-1 w-full rounded-xl border border-pink-100/90 bg-[#fffafc] px-3 py-2.5 text-base leading-snug text-neutral-900 shadow-inner shadow-pink-950/5 outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-200/60";
const exampleClass =
  "mt-1 w-full rounded-xl border border-pink-200/60 bg-gradient-to-b from-pink-50/80 to-white px-3 py-2.5 text-sm text-neutral-800 shadow-inner shadow-pink-950/5 outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-200/60";

export function AddCardForm({ setId, onAdded, defaultExpanded = false }: Props) {
  const [open, setOpen] = useState(defaultExpanded);
  const [phoneticReading, setPhoneticReading] = useState("");
  const [categoryLabel, setCategoryLabel] = useState("");
  const [definition, setDefinition] = useState("");
  const [contextNote, setContextNote] = useState("");
  const [kana, setKana] = useState("");
  const [exampleSentence, setExampleSentence] = useState("");
  const [exampleTranslation, setExampleTranslation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const panelId = "add-card-panel";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const def = definition.trim();
    const ka = kana.trim();
    if (!def && !ka) {
      setError("Enter English meaning and/or Japanese (kana).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const d = emptyDraft();
      d.phonetic_reading = phoneticReading.trim() || null;
      d.category_label = categoryLabel.trim() || null;
      d.definition = def || null;
      d.context_note = contextNote.trim() || null;
      d.kana = ka || null;
      d.kanji = null;
      d.example_sentence = exampleSentence.trim() || null;
      d.example_translation = exampleTranslation.trim() || null;
      await appendCardsToSet(setId, [d]);
      setPhoneticReading("");
      setCategoryLabel("");
      setDefinition("");
      setContextNote("");
      setKana("");
      setExampleSentence("");
      setExampleTranslation("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save card");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="overflow-hidden rounded-2xl border border-pink-100/90 bg-white shadow-md shadow-pink-100/40 ring-1 ring-pink-50"
      aria-label="Add a card"
    >
      <button
        type="button"
        id="add-card-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-pink-50/40 sm:px-5"
      >
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-neutral-900 sm:text-base">
            Add a card
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            {open
              ? "Slide 1: romaji · kana · group · Slide 2: gloss, context, examples"
              : "Expand to type a new card — English and/or kana required"}
          </p>
        </div>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-50 text-pink-600 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <form
            id={panelId}
            role="region"
            aria-labelledby="add-card-toggle"
            onSubmit={(e) => void submit(e)}
            className="border-t border-pink-100/80 bg-gradient-to-b from-white to-[#fffafc]/90 px-4 pb-5 pt-4 sm:px-5"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-neutral-600">
                Romaji
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Optional"
                  value={phoneticReading}
                  onChange={(e) => setPhoneticReading(e.target.value)}
                  spellCheck={false}
                />
              </label>
              <label className="block text-xs font-medium text-neutral-600">
                Group (e.g. I)
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Optional"
                  value={categoryLabel}
                  onChange={(e) => setCategoryLabel(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-neutral-600">
                English
                <textarea
                  className={textareaClass}
                  rows={2}
                  placeholder="Meaning"
                  value={definition}
                  onChange={(e) => setDefinition(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-neutral-600">
                Kana
                <textarea
                  lang="ja"
                  spellCheck={false}
                  autoComplete="off"
                  className={kanaTextareaClass}
                  rows={2}
                  placeholder="ひらがな・カタカナ"
                  value={kana}
                  onChange={(e) => setKana(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-neutral-600 sm:col-span-2">
                Context (parentheses on slide 2)
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Optional"
                  value={contextNote}
                  onChange={(e) => setContextNote(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-neutral-600 sm:col-span-1">
                Example (romaji)
                <textarea
                  className={exampleClass}
                  rows={2}
                  placeholder="Optional"
                  value={exampleSentence}
                  onChange={(e) => setExampleSentence(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-neutral-600 sm:col-span-1">
                Example translation
                <textarea
                  className={exampleClass}
                  rows={2}
                  placeholder="Optional"
                  value={exampleTranslation}
                  onChange={(e) => setExampleTranslation(e.target.value)}
                />
              </label>
            </div>
            {error && (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end border-t border-pink-100/60 pt-4">
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-gradient-to-b from-pink-500 to-pink-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-pink-500/25 transition hover:from-pink-600 hover:to-pink-700 hover:shadow-lg disabled:opacity-50"
              >
                {busy ? "Saving…" : "Add card"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
