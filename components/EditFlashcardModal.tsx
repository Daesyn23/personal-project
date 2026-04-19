"use client";

import { useEffect, useState } from "react";
import { deleteFlashcard, updateFlashcard } from "@/lib/flashcards-repo";
import type { FlashcardRow } from "@/lib/types";

type Props = {
  card: FlashcardRow | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: (id: string) => void;
};

export function EditFlashcardModal({ card, onClose, onSaved, onDeleted }: Props) {
  const [phoneticReading, setPhoneticReading] = useState("");
  const [categoryLabel, setCategoryLabel] = useState("");
  const [definition, setDefinition] = useState("");
  const [contextNote, setContextNote] = useState("");
  const [kana, setKana] = useState("");
  const [exampleSentence, setExampleSentence] = useState("");
  const [exampleTranslation, setExampleTranslation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!card) return;
    setPhoneticReading(card.phonetic_reading ?? "");
    setCategoryLabel(card.category_label ?? "");
    setDefinition(card.definition ?? "");
    setContextNote(card.context_note ?? "");
    setKana(card.kana ?? "");
    setExampleSentence(card.example_sentence ?? "");
    setExampleTranslation(card.example_translation ?? "");
    setError(null);
  }, [card]);

  if (!card) return null;

  const save = async () => {
    const def = definition.trim();
    const ka = kana.trim();
    if (!def && !ka) {
      setError("Enter English meaning and/or kana.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateFlashcard(card.id, {
        phonetic_reading: phoneticReading.trim() || null,
        category_label: categoryLabel.trim() || null,
        definition: def || null,
        context_note: contextNote.trim() || null,
        kana: ka || null,
        kanji: null,
        example_sentence: exampleSentence.trim() || null,
        example_translation: exampleTranslation.trim() || null,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!card || !window.confirm("Delete this card? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteFlashcard(card.id);
      onDeleted?.(card.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-card-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl ring-1 ring-pink-100">
        <div className="border-b border-pink-100 px-5 py-4">
          <h2 id="edit-card-title" className="text-lg font-semibold text-neutral-900">
            Edit card
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Slide 1: romaji + kana (+ group). Slide 2: English, note, examples.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          <div className="grid gap-3">
            <label className="block text-xs font-medium text-neutral-600">
              Romaji (e.g. hi ki masu)
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-pink-100 bg-[#fffafc] px-3 py-2 text-sm"
                value={phoneticReading}
                onChange={(e) => setPhoneticReading(e.target.value)}
                placeholder="hiki masu"
                spellCheck={false}
              />
            </label>
            <label className="block text-xs font-medium text-neutral-600">
              Verb group / label (e.g. I)
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-pink-100 bg-[#fffafc] px-3 py-2 text-sm"
                value={categoryLabel}
                onChange={(e) => setCategoryLabel(e.target.value)}
                placeholder="I"
              />
            </label>
            <label className="block text-xs font-medium text-neutral-600">
              Kana / word
              <textarea
                lang="ja"
                spellCheck={false}
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-pink-100 bg-[#fffafc] px-3 py-2 text-base leading-snug"
                rows={2}
                value={kana}
                onChange={(e) => setKana(e.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-neutral-600">
              English gloss
              <textarea
                className="mt-1 w-full rounded-lg border border-pink-100 bg-[#fffafc] px-3 py-2 text-sm"
                rows={2}
                value={definition}
                onChange={(e) => setDefinition(e.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-neutral-600">
              Context (shown in parentheses)
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-pink-100 bg-[#fffafc] px-3 py-2 text-sm"
                value={contextNote}
                onChange={(e) => setContextNote(e.target.value)}
                placeholder="a string instrument or the piano"
              />
            </label>
            <label className="block text-xs font-medium text-neutral-600">
              Example (romaji — last word styled in pink in slideshow)
              <textarea
                className="mt-1 w-full rounded-lg border border-pink-200/80 bg-pink-50/50 px-3 py-2 text-sm"
                rows={2}
                value={exampleSentence}
                onChange={(e) => setExampleSentence(e.target.value)}
                placeholder="gitā o hikimasu"
                spellCheck={false}
              />
            </label>
            <label className="block text-xs font-medium text-neutral-600">
              Example translation
              <textarea
                className="mt-1 w-full rounded-lg border border-pink-200/80 bg-pink-50/50 px-3 py-2 text-sm"
                rows={2}
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
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-pink-100 px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Delete card
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
