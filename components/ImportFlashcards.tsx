"use client";

import { useRef, useState } from "react";
import { parseImportFile } from "@/lib/parse-import";
import {
  looksLikeNumberedLessonPaste,
  parseLessonLinesPaste,
} from "@/lib/parse-pasted-lesson-lines";
import type { FlashcardDraft } from "@/lib/types";
import { addCardsToSet, createCardSet } from "@/lib/flashcards-repo";

type Props = {
  onImported: (newSetId?: string) => void;
};

type EditableRow = FlashcardDraft & { _key: string };

function makeKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Math.random());
}

function nameFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/u, "").replace(/[_-]+/g, " ").trim() || "New set";
}

export function ImportFlashcards({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [setName, setSetName] = useState("");
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [lessonPaste, setLessonPaste] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const closeModal = () => {
    setModalOpen(false);
    setRows([]);
    setLessonPaste("");
    setSetName("");
    setError(null);
  };

  const applyLessonPasteText = (raw: string) => {
    const drafts = parseLessonLinesPaste(raw);
    if (drafts.length === 0) {
      setError("Could not parse lines. Use numbered rows like: 1 to wash あらいます 洗います");
      return;
    }
    if (rows.length > 0) {
      if (!window.confirm("Replace the current table with these lines?")) {
        return;
      }
    }
    setRows(
      drafts.map((d) => ({
        ...d,
        _key: makeKey(),
      }))
    );
    setLessonPaste("");
    setError(null);
  };

  const onLessonPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (!looksLikeNumberedLessonPaste(text)) return;
    const drafts = parseLessonLinesPaste(text);
    if (drafts.length === 0) return;
    e.preventDefault();
    if (rows.length > 0 && !window.confirm("Replace the current table with pasted lesson lines?")) {
      setLessonPaste((prev) => prev + text);
      return;
    }
    setRows(
      drafts.map((d) => ({
        ...d,
        _key: makeKey(),
      }))
    );
    setLessonPaste("");
    setError(null);
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (!setName.trim()) {
      setSetName(nameFromFilename(file.name));
    }
    try {
      let text: string;
      if (file.name.toLowerCase().endsWith(".pdf")) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/extract-pdf", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(err?.error ?? `PDF extract failed (${res.status})`);
        }
        const data = (await res.json()) as {
          text: string;
          vocabulary?: FlashcardDraft[];
        };
        if (data.vocabulary?.length) {
          setRows(
            data.vocabulary.map((d) => ({
              ...d,
              _key: makeKey(),
            }))
          );
          return;
        }
        text = data.text;
      } else {
        text = await file.text();
      }
      const drafts = parseImportFile(file.name, text);
      setRows(
        drafts.map((d) => ({
          ...d,
          _key: makeKey(),
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read file");
    }
  };

  const updateRow = (key: string, field: keyof FlashcardDraft, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r._key === key ? { ...r, [field]: value || null } : r
      )
    );
  };

  const save = async () => {
    const name = setName.trim();
    if (!name) {
      setError("Enter a name for this set.");
      return;
    }
    if (rows.length === 0) {
      setError("Add at least one card (paste lesson lines, choose a file, or fill the table).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: FlashcardDraft[] = rows.map((r, i) => {
        const { _key, ...rest } = r;
        void _key;
        return { ...rest, position: i };
      });
      const setId = await createCardSet(name);
      await addCardsToSet(setId, payload);
      closeModal();
      onImported(setId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setModalOpen(true);
        }}
        className="rounded-xl border border-pink-200/90 bg-white px-4 py-2.5 text-sm font-semibold text-pink-700 shadow-md shadow-pink-100/40 transition hover:border-pink-300 hover:bg-pink-50/90 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
      >
        Import to a set
      </button>

      {error && !modalOpen && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-xl ring-1 ring-pink-100">
            <div className="border-b border-pink-100 px-5 py-4">
              <h2 id="import-title" className="text-lg font-semibold text-neutral-900">
                Import a set
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Name your set, then <strong>paste numbered lesson lines</strong> (English + reading + kanji) or choose a
                file. Pasted lines fill English and Kana; the <strong>kanji column is skipped</strong>. PDF import fills
                English and Kana when the layout matches a table.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="sr-only" htmlFor="set-name">
                  Set name
                </label>
                <input
                  id="set-name"
                  type="text"
                  value={setName}
                  onChange={(e) => setSetName(e.target.value)}
                  placeholder="e.g. Lesson 18 Vocabulary"
                  className="w-full rounded-lg border border-pink-200 bg-[#fffafc] px-3 py-2 text-sm outline-none ring-pink-300 focus:ring-2 sm:max-w-md"
                />
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.json,.pdf,text/csv,application/json,application/pdf"
                  className="hidden"
                  onChange={onPickFile}
                />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="rounded-lg border border-pink-200 bg-white px-4 py-2 text-sm font-medium text-pink-800 hover:bg-pink-50"
                >
                  Choose file
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-pink-100 bg-[#fffafc] p-3">
                <label htmlFor="lesson-paste" className="text-xs font-medium text-neutral-600">
                  Paste lesson lines (auto-fills table; kanji ignored)
                </label>
                <textarea
                  id="lesson-paste"
                  value={lessonPaste}
                  onChange={(e) => setLessonPaste(e.target.value)}
                  onPaste={onLessonPaste}
                  placeholder={
                    "1 to wash あらいます 洗います\n2 to play ひきます 弾きます\n11 piano ピアノ"
                  }
                  rows={5}
                  spellCheck={false}
                  className="mt-1 w-full resize-y rounded-lg border border-pink-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-neutral-800 outline-none ring-pink-300 focus:ring-2"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => applyLessonPasteText(lessonPaste)}
                    className="rounded-lg bg-pink-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-600"
                  >
                    Parse into table
                  </button>
                  <span className="text-xs text-neutral-500 self-center">
                    Pasting a numbered block here also fills the table automatically.
                  </span>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-pink-100 text-neutral-500">
                    <th className="p-2 font-medium">English</th>
                    <th className="p-2 font-medium">Kana</th>
                    <th className="p-2 font-medium">Example sentence</th>
                    <th className="p-2 font-medium">Example translation</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r._key} className="border-b border-pink-50 align-top">
                      <td className="p-2">
                        <textarea
                          className="w-full min-w-[140px] rounded border border-pink-100 bg-[#fffafc] px-2 py-1 text-xs"
                          rows={2}
                          placeholder="Meaning in English"
                          value={r.definition ?? ""}
                          onChange={(e) =>
                            updateRow(r._key, "definition", e.target.value)
                          }
                        />
                      </td>
                      <td className="p-2">
                        <textarea
                          lang="ja"
                          spellCheck={false}
                          autoComplete="off"
                          className="w-full min-w-[120px] rounded border border-pink-100 bg-[#fffafc] px-2 py-1 text-base leading-snug"
                          rows={2}
                          placeholder="ひらがな・カタカナ"
                          value={r.kana ?? ""}
                          onChange={(e) =>
                            updateRow(r._key, "kana", e.target.value)
                          }
                        />
                      </td>
                      <td className="p-2">
                        <textarea
                          className="w-full min-w-[140px] rounded border border-pink-200 bg-pink-50/50 px-2 py-1 text-xs"
                          rows={2}
                          placeholder="e.g. gitā o hikimasu"
                          value={r.example_sentence ?? ""}
                          onChange={(e) =>
                            updateRow(r._key, "example_sentence", e.target.value)
                          }
                        />
                      </td>
                      <td className="p-2">
                        <textarea
                          className="w-full min-w-[140px] rounded border border-pink-200 bg-pink-50/50 px-2 py-1 text-xs"
                          rows={2}
                          placeholder="e.g. play the guitar"
                          value={r.example_translation ?? ""}
                          onChange={(e) =>
                            updateRow(r._key, "example_translation", e.target.value)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && (
                <p className="py-8 text-center text-neutral-500">
                  Paste numbered lines above, or choose a CSV, JSON, or PDF file.
                </p>
              )}
            </div>

            {error && (
              <p className="px-5 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 border-t border-pink-100 px-5 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || rows.length === 0 || !setName.trim()}
                onClick={save}
                className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Create set & save cards"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
