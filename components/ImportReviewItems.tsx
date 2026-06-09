"use client";

import { useRef, useState } from "react";
import { HeadingWithInfo, InfoTip } from "@/components/InfoTip";
import {
  appendReviewItems,
  createReviewFolder,
} from "@/lib/review-repo";
import { jpFontClass } from "@/lib/workspace-translation";
import {
  looksLikeKotaeReviewPdf,
  parseKotaeReviewText,
  type KotaeReviewDraft,
} from "@/lib/parse-kotae-review-pdf";

type Props = {
  /** When set, cards are added to this folder. Otherwise a new folder is created on save. */
  folderId: string | null;
  defaultFolderName?: string;
  onImported: (folderId: string) => void;
};

type EditableRow = KotaeReviewDraft & { _key: string };

const BATCH_SIZE = 40;

function makeKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Math.random());
}

function nameFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/u, "").replace(/[_-]+/g, " ").trim() || "Imported deck";
}

export function ImportReviewItems({ folderId, defaultFolderName, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [folderName, setFolderName] = useState(defaultFolderName ?? "");
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generatingEnglish, setGeneratingEnglish] = useState(false);
  const [parseNote, setParseNote] = useState<string | null>(null);

  const closeModal = () => {
    setModalOpen(false);
    setRows([]);
    setFolderName(defaultFolderName ?? "");
    setError(null);
    setParseNote(null);
    setGeneratingEnglish(false);
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setParseNote(null);
    if (!folderName.trim()) {
      setFolderName(nameFromFilename(file.name));
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Review import supports KOTAE-style PDF files.");
      return;
    }

    try {
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
      const data = (await res.json()) as { text: string };
      const text = data.text ?? "";
      if (!looksLikeKotaeReviewPdf(text)) {
        throw new Error(
          "Could not find KOTAE-style rows (index, kanji, hiragana). Check that the PDF matches the 漢字試験 format."
        );
      }
      const drafts = parseKotaeReviewText(text);
      setRows(
        drafts.map((d) => ({
          ...d,
          _key: makeKey(),
        }))
      );
      setParseNote(
        `Parsed ${drafts.length} cards from PDF. English meanings are empty — use Generate English or fill manually before saving.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read PDF");
    }
  };

  const updateRow = (key: string, field: keyof KotaeReviewDraft, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r._key === key ? { ...r, [field]: value } : r))
    );
  };

  const generateEnglish = async (onlyEmpty: boolean) => {
    const targets = rows
      .map((r, index) => ({ row: r, index }))
      .filter(({ row }) => (onlyEmpty ? !row.definition.trim() : true));

    if (targets.length === 0) {
      setError(onlyEmpty ? "Every row already has English." : "No rows to translate.");
      return;
    }

    setGeneratingEnglish(true);
    setError(null);
    try {
      const updated = [...rows];
      for (let start = 0; start < targets.length; start += BATCH_SIZE) {
        const batch = targets.slice(start, start + BATCH_SIZE);
        const res = await fetch("/api/review/generate-english", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: batch.map(({ row }) => ({ kanji: row.kanji, kana: row.kana })),
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          definitions?: string[];
        } | null;
        if (!res.ok) {
          throw new Error(data?.error ?? `English generation failed (${res.status})`);
        }
        const defs = data?.definitions ?? [];
        batch.forEach(({ row, index }, i) => {
          const gloss = defs[i]?.trim() ?? "";
          if (gloss) {
            updated[index] = { ...updated[index], definition: gloss };
          }
        });
      }
      setRows(updated);
      setParseNote("English meanings generated. Review the table before saving.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "English generation failed");
    } finally {
      setGeneratingEnglish(false);
    }
  };

  const save = async () => {
    const name = folderName.trim();
    if (!folderId && !name) {
      setError("Enter a folder name.");
      return;
    }
    if (rows.length === 0) {
      setError("Import a PDF or add rows first.");
      return;
    }

    const payload = rows
      .map((r) => ({
        kana: r.kana.trim(),
        kanji: r.kanji.trim(),
        definition: r.definition.trim(),
      }))
      .filter((r) => r.kana && r.kanji && r.definition);

    if (payload.length === 0) {
      setError("Every row needs hiragana, kanji, and English. Use Generate English or fill manually.");
      return;
    }

    const missing = rows.length - payload.length;
    if (missing > 0 && !window.confirm(`${missing} incomplete row(s) will be skipped. Continue?`)) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      let targetFolderId = folderId;
      if (!targetFolderId) {
        targetFolderId = await createReviewFolder(name);
      }
      await appendReviewItems(targetFolderId, payload);
      closeModal();
      onImported(targetFolderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const emptyEnglishCount = rows.filter((r) => !r.definition.trim()).length;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setFolderName(defaultFolderName ?? folderName);
          setModalOpen(true);
        }}
        className="rounded-xl border border-pink-200/90 bg-white px-4 py-2.5 text-sm font-semibold text-pink-700 shadow-md shadow-pink-100/40 transition hover:border-pink-300 hover:bg-pink-50/90 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
      >
        Import PDF
      </button>

      {modalOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-review-title"
        >
          <div className="flex max-h-[90dvh] w-full min-w-0 max-w-5xl flex-col rounded-2xl bg-white shadow-xl ring-1 ring-pink-100">
            <div className="border-b border-pink-100 px-5 py-3 sm:py-4">
              <HeadingWithInfo
                align="center"
                infoLabel="Import KOTAE PDF"
                heading={
                  <h2 id="import-review-title" className="text-lg font-semibold text-neutral-900">
                    Import from PDF
                  </h2>
                }
              >
                <p>
                  Supports <strong className="font-medium text-neutral-800">KOTAE / 漢字試験</strong> PDFs with
                  numbered rows: kanji form + hiragana reading (no English). Use{" "}
                  <strong className="font-medium text-neutral-800">Generate English</strong> to fill meanings before
                  saving.
                </p>
              </HeadingWithInfo>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                {!folderId && (
                  <>
                    <label className="sr-only" htmlFor="review-folder-name">
                      Folder name
                    </label>
                    <input
                      id="review-folder-name"
                      type="text"
                      value={folderName}
                      onChange={(e) => setFolderName(e.target.value)}
                      placeholder="e.g. N4 KOTAE L26-32 SET A"
                      className="w-full rounded-lg border border-pink-200 bg-[#fffafc] px-3 py-2 text-sm outline-none ring-pink-300 focus:ring-2 sm:max-w-md"
                    />
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={onPickFile}
                />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="rounded-lg border border-pink-200 bg-white px-4 py-2 text-sm font-medium text-pink-800 hover:bg-pink-50"
                >
                  Choose PDF
                </button>
                <button
                  type="button"
                  disabled={generatingEnglish || rows.length === 0}
                  onClick={() => void generateEnglish(true)}
                  className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50"
                >
                  {generatingEnglish ? "Generating…" : "Generate English"}
                </button>
                {emptyEnglishCount > 0 && rows.length > 0 && (
                  <span className="text-xs text-neutral-500">
                    {emptyEnglishCount} row{emptyEnglishCount === 1 ? "" : "s"} without English
                  </span>
                )}
                <InfoTip label="Generate English help">
                  Uses the same AI keys as Translate. Fills empty English cells only. Review glosses before saving.
                </InfoTip>
              </div>

              {parseNote && (
                <div
                  className="mt-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950"
                  role="status"
                >
                  {parseNote}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-pink-100 text-neutral-500">
                    <th className="w-11 p-2 font-medium text-center">#</th>
                    <th className="p-2 font-medium">Kanji (front)</th>
                    <th className="p-2 font-medium">Hiragana (back)</th>
                    <th className="p-2 font-medium">English (back)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={r._key} className="border-b border-pink-50 align-top">
                      <td className="p-2 align-middle">
                        <span
                          className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-pink-50 text-xs font-bold tabular-nums text-pink-700 ring-1 ring-pink-100"
                          aria-label={`Row ${idx + 1}`}
                        >
                          {idx + 1}
                        </span>
                      </td>
                      <td className="p-2">
                        <textarea
                          lang="ja"
                          spellCheck={false}
                          className={`w-full min-w-[120px] rounded border border-pink-100 bg-[#fffafc] px-2 py-1 text-base leading-snug ${jpFontClass}`}
                          rows={2}
                          value={r.kanji}
                          onChange={(e) => updateRow(r._key, "kanji", e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <textarea
                          lang="ja"
                          spellCheck={false}
                          className={`w-full min-w-[120px] rounded border border-pink-100 bg-[#fffafc] px-2 py-1 text-base leading-snug ${jpFontClass}`}
                          rows={2}
                          value={r.kana}
                          onChange={(e) => updateRow(r._key, "kana", e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <textarea
                          className="w-full min-w-[140px] rounded border border-pink-100 bg-[#fffafc] px-2 py-1 text-xs"
                          rows={2}
                          placeholder="English meaning"
                          value={r.definition}
                          onChange={(e) => updateRow(r._key, "definition", e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && (
                <p className="py-8 text-center text-neutral-500">Choose a KOTAE-style PDF to fill the table.</p>
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
                disabled={busy || generatingEnglish || rows.length === 0 || (!folderId && !folderName.trim())}
                onClick={() => void save()}
                className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600 disabled:opacity-50"
              >
                {busy ? "Saving…" : folderId ? "Add to folder" : "Create folder & save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
