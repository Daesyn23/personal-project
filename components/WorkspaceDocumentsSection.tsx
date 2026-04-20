"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addImmediateChildCounts,
  createWorkspaceFolder,
  deleteWorkspaceFile,
  deleteWorkspaceFolder,
  getWorkspaceFileViewUrl,
  listWorkspaceFiles,
  listWorkspaceFolders,
  updateWorkspaceFolderName,
  uploadWorkspaceFile,
} from "@/lib/documents-repo";
import { usingLocalStorage } from "@/lib/flashcards-repo";
import { WorkspaceLessonFolderCard } from "@/components/WorkspaceLessonFolderCard";
import { WorkspaceLevelCollectionCard } from "@/components/WorkspaceLevelCollectionCard";
import type { WorkspaceFileRow, WorkspaceFolderRow } from "@/lib/types";

const MAX_BYTES = 50 * 1024 * 1024;

function formatBytes(n: number | null) {
  if (n == null || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
      />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

/** Files from clipboard (some browsers only populate `items`, not `files`). */
function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const fromFiles = data.files;
  if (fromFiles?.length) return Array.from(fromFiles);
  const out: File[] = [];
  for (const item of data.items) {
    if (item.kind !== "file") continue;
    const f = item.getAsFile();
    if (f) out.push(f);
  }
  return out;
}

/** Depth 0 = levels (N5, N4…), 1 = lessons, 2+ = lesson contents (files) or extra subfolders */
function formatStepLabel(depth: number): string {
  if (depth === 0) return "Level";
  if (depth === 1) return "Lesson";
  return "Folder";
}

function newFolderPlaceholder(depth: number): string {
  if (depth === 0) return "e.g. N5 or N4";
  if (depth === 1) return "e.g. Lesson 1";
  return "e.g. Grammar drills";
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const el = target.closest("input, textarea, [contenteditable='true'], select");
  if (!el) return false;
  if (el instanceof HTMLInputElement) {
    const t = el.type;
    if (["button", "checkbox", "radio", "submit", "reset", "file", "hidden", "image"].includes(t)) {
      return false;
    }
    return true;
  }
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return true;
  return (el as HTMLElement).isContentEditable;
}

export function WorkspaceDocumentsSection() {
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([]);
  const folderId = trail.length ? trail[trail.length - 1].id : null;

  const [folders, setFolders] = useState<WorkspaceFolderRow[]>([]);
  const [files, setFiles] = useState<WorkspaceFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renaming, setRenaming] = useState<WorkspaceFolderRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileDragActive, setFileDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    let f = await listWorkspaceFolders(folderId);
    if (f.length > 0) {
      f = await addImmediateChildCounts(f);
    }
    const g = await listWorkspaceFiles(folderId);
    setFolders(f);
    setFiles(g);
    setLoading(false);
  }, [folderId]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  const parentId = folderId;

  const onCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await createWorkspaceFolder(name, parentId);
      setNewFolderName("");
      setNewFolderOpen(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create folder.");
    } finally {
      setBusy(false);
    }
  };

  const uploadFileList = useCallback(
    async (list: File[]) => {
      if (!list.length) return;
      const oversized = list.filter((f) => f.size > MAX_BYTES);
      const toUpload = list.filter((f) => f.size <= MAX_BYTES);
      if (oversized.length > 0) {
        setError(
          oversized.length === 1
            ? `“${oversized[0].name}” is over 50 MB.`
            : `${oversized.length} files are over 50 MB and were skipped.`
        );
      }
      if (toUpload.length === 0) {
        if (inputRef.current) inputRef.current.value = "";
        return;
      }

      setBusy(true);
      setError(null);
      try {
        for (let i = 0; i < toUpload.length; i++) {
          const file = toUpload[i];
          setUploadStatus({ current: i + 1, total: toUpload.length, fileName: file.name });
          await uploadWorkspaceFile(parentId, file);
        }
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setUploadStatus(null);
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [parentId, reload]
  );

  const onUpload = useCallback(
    async (list: FileList | null) => {
      if (!list?.length) return;
      await uploadFileList(Array.from(list));
    },
    [uploadFileList]
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const pasted = filesFromClipboard(e.clipboardData);
      if (pasted.length === 0) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      void uploadFileList(pasted);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [uploadFileList]);

  useEffect(() => {
    const onDragEnd = () => setFileDragActive(false);
    window.addEventListener("dragend", onDragEnd);
    return () => window.removeEventListener("dragend", onDragEnd);
  }, []);

  const onOpenFile = async (row: WorkspaceFileRow) => {
    setError(null);
    try {
      const url = await getWorkspaceFileViewUrl(row);
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (url.startsWith("blob:")) {
        window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      }
      if (!w) setError("Pop-up blocked — allow pop-ups to view the file.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open file.");
    }
  };

  const onDeleteFile = async (row: WorkspaceFileRow) => {
    if (!window.confirm(`Delete “${row.filename}”?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteWorkspaceFile(row);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete file.");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteFolder = async (row: WorkspaceFolderRow) => {
    if (!window.confirm(`Delete folder “${row.name}” and everything inside?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteWorkspaceFolder(row.id);
      if (trail.some((t) => t.id === row.id)) {
        const idx = trail.findIndex((t) => t.id === row.id);
        setTrail((t) => t.slice(0, idx));
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete folder.");
    } finally {
      setBusy(false);
    }
  };

  const startRename = (row: WorkspaceFolderRow) => {
    setRenaming(row);
    setRenameValue(row.name);
  };

  const applyRename = async () => {
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await updateWorkspaceFolderName(renaming.id, name);
      setTrail((t) => t.map((x) => (x.id === renaming.id ? { ...x, name } : x)));
      setRenaming(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename.");
    } finally {
      setBusy(false);
    }
  };

  const enterFolder = (row: WorkspaceFolderRow) => {
    setTrail((t) => [...t, { id: row.id, name: row.name }]);
  };

  const goCrumb = (index: number) => {
    if (index < 0) setTrail([]);
    else setTrail((t) => t.slice(0, index + 1));
  };

  const localOnly = usingLocalStorage();
  const depth = trail.length;

  const isFileDragEvent = (e: React.DragEvent) =>
    e.dataTransfer.types.includes("Files") ||
    [...e.dataTransfer.items].some((item) => item.kind === "file");

  const onPanelDragEnter = (e: React.DragEvent) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const root = e.currentTarget as HTMLElement;
    const from = e.relatedTarget;
    if (from instanceof Node && root.contains(from)) return;
    setFileDragActive(true);
  };

  const onPanelDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const root = e.currentTarget as HTMLElement;
    const next = e.relatedTarget;
    if (next instanceof Node && root.contains(next)) return;
    setFileDragActive(false);
  };

  const onPanelDragOver = (e: React.DragEvent) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const onPanelDrop = (e: React.DragEvent) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setFileDragActive(false);
    void onUpload(e.dataTransfer.files);
  };

  return (
    <section className="space-y-6" aria-label="Documents and PDFs">
      <div
        className="relative rounded-2xl border border-pink-100/90 bg-white/95 p-4 shadow-sm shadow-pink-100/35 sm:p-6"
        onDragEnter={onPanelDragEnter}
        onDragLeave={onPanelDragLeave}
        onDragOver={onPanelDragOver}
        onDrop={onPanelDrop}
      >
        {fileDragActive && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-pink-400 bg-rose-50/95 p-6 text-center shadow-inner backdrop-blur-[2px]"
            aria-live="polite"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDrop={onPanelDrop}
          >
            <p className="text-lg font-semibold text-pink-900">Drop files to upload</p>
            <p className="text-sm text-pink-800/80">Release to add them to this folder</p>
          </div>
        )}
        <div className={fileDragActive ? "pointer-events-none select-none" : undefined}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Documents</h2>
            {localOnly && (
              <p className="mt-2 text-xs text-amber-700">
                Without Supabase, files stay in this browser only (IndexedDB + local storage).
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setNewFolderOpen(true);
                setNewFolderName("");
              }}
              className="rounded-xl border border-pink-200/90 bg-gradient-to-b from-rose-50 to-pink-50/90 px-4 py-2 text-sm font-semibold text-pink-900 shadow-sm shadow-pink-100/50 transition hover:border-pink-300 hover:from-rose-50 hover:to-pink-50 disabled:opacity-50"
            >
              New folder
            </button>
            <label className="cursor-pointer rounded-xl border border-pink-300/90 bg-gradient-to-b from-pink-500 to-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-pink-200/40 transition hover:from-pink-600 hover:to-rose-600 disabled:opacity-50">
              Upload files
              <input
                ref={inputRef}
                type="file"
                multiple
                className="sr-only"
                disabled={busy}
                onChange={(e) => void onUpload(e.target.files)}
              />
            </label>
          </div>
        </div>

        {uploadStatus && (
          <div
            className="mt-4 flex items-center gap-3 rounded-xl border border-pink-200/90 bg-gradient-to-r from-rose-50 to-pink-50/80 px-4 py-3 shadow-sm shadow-pink-100/50"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <span
              className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-pink-200 border-t-pink-600"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-pink-950">
                Uploading {uploadStatus.current} of {uploadStatus.total}
              </p>
              <p className="truncate text-xs text-pink-900/75">{uploadStatus.fileName}</p>
            </div>
          </div>
        )}

        <nav className="mt-5 flex flex-wrap items-center gap-1 text-sm" aria-label="Folder path">
          <button
            type="button"
            onClick={() => goCrumb(-1)}
            className="rounded-full px-2 py-1 font-medium text-pink-700 transition hover:bg-pink-50"
          >
            All documents
          </button>
          {trail.map((seg, i) => (
            <span key={seg.id} className="flex items-center gap-1">
              <span className="text-pink-200">/</span>
              <button
                type="button"
                onClick={() => goCrumb(i)}
                className="max-w-[12rem] truncate rounded-full px-2 py-1 font-medium text-neutral-800 transition hover:bg-pink-50"
              >
                <span className="sr-only">{formatStepLabel(i)}: </span>
                {seg.name}
              </button>
            </span>
          ))}
        </nav>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}

        {newFolderOpen && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-pink-100 bg-gradient-to-br from-rose-50/50 to-pink-50/30 p-4 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="new-folder-name" className="text-xs font-medium text-neutral-600">
                New {formatStepLabel(depth).toLowerCase()} folder
              </label>
              <input
                id="new-folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onCreateFolder();
                  if (e.key === "Escape") setNewFolderOpen(false);
                }}
                placeholder={newFolderPlaceholder(depth)}
                className="mt-1 w-full rounded-lg border border-pink-200 bg-white px-3 py-2 text-sm outline-none ring-pink-300/80 focus:ring-2"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !newFolderName.trim()}
                onClick={() => void onCreateFolder()}
                className="rounded-lg bg-gradient-to-r from-pink-600 to-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-pink-200/50 hover:from-pink-700 hover:to-rose-600 disabled:opacity-50"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setNewFolderOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-neutral-500">
            <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-pink-200" aria-hidden />
            Loading…
          </p>
        ) : (
          <div className="mt-6 space-y-6">
            {folders.length > 0 && (
              <div>
                {depth === 0 ? (
                  <>
                    <h3 className="mb-1 text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">Collections</h3>
                    <p className="mb-4 text-sm text-neutral-500">Choose a level to open lessons and files.</p>
                    <ul className="grid gap-4 sm:grid-cols-2">
                      {folders.map((f) => (
                        <WorkspaceLevelCollectionCard
                          key={f.id}
                          folder={f}
                          onOpen={() => enterFolder(f)}
                          onRename={() => startRename(f)}
                          onDelete={() => void onDeleteFolder(f)}
                        />
                      ))}
                    </ul>
                  </>
                ) : depth === 1 ? (
                  <>
                    <h3 className="mb-1 text-lg font-bold tracking-tight text-neutral-900">Lessons</h3>
                    <p className="mb-4 text-sm text-neutral-500">Open a lesson to add PDFs and materials.</p>
                    <ul className="grid gap-4 sm:grid-cols-2">
                      {folders.map((f) => (
                        <WorkspaceLessonFolderCard
                          key={f.id}
                          folder={f}
                          onOpen={() => enterFolder(f)}
                          onRename={() => startRename(f)}
                          onDelete={() => void onDeleteFolder(f)}
                        />
                      ))}
                    </ul>
                  </>
                ) : (
                  <>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-pink-600/80">Folders</h3>
                    <p className="mb-3 text-xs text-neutral-400">Optional subfolders inside this lesson</p>
                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {folders.map((f) => (
                        <li
                          key={f.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-pink-100/90 bg-white p-3 shadow-sm shadow-pink-100/30"
                        >
                          <button
                            type="button"
                            onClick={() => enterFolder(f)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left transition hover:text-pink-700"
                          >
                            <FolderIcon className="h-8 w-8 shrink-0 text-pink-400" />
                            <span className="truncate font-medium text-neutral-900">{f.name}</span>
                          </button>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => startRename(f)}
                              className="rounded-lg p-2 text-neutral-400 hover:bg-pink-50 hover:text-pink-700"
                              title="Rename"
                              aria-label={`Rename ${f.name}`}
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                                />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => void onDeleteFolder(f)}
                              className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                              title="Delete folder"
                              aria-label={`Delete ${f.name}`}
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {files.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-pink-600/80">
                  {depth >= 2 ? "Lesson files" : "Files"}
                </h3>
                <p className="mb-3 text-xs text-neutral-400">
                  {depth >= 2 ? "PDFs and handouts for this lesson" : "Documents in this folder"}
                </p>
                <ul className="divide-y divide-pink-100 rounded-xl border border-pink-100/90 bg-white shadow-sm shadow-pink-100/20">
                  {files.map((file) => (
                    <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <FileIcon className="h-6 w-6 shrink-0 text-pink-400" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-neutral-900">{file.filename}</p>
                          <p className="text-xs tabular-nums text-neutral-400">{formatBytes(file.byte_size)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void onOpenFile(file)}
                          className="rounded-lg border border-pink-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-pink-900 hover:bg-pink-50"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteFile(file)}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!loading && folders.length === 0 && files.length === 0 && (
              <p className="text-center text-sm text-neutral-500">
                {depth === 0 && "Start with a level folder (N5, N4…), or upload only if you prefer a flat list."}
                {depth === 1 && "Add lesson folders (Lesson 1, 2…), then open one to add PDFs."}
                {depth >= 2 && "No files yet — upload PDFs or paste from the clipboard (⌘V / Ctrl+V)."}
              </p>
            )}
          </div>
        )}
        </div>
      </div>

      {renaming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-folder-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-pink-100 bg-white p-6 shadow-xl shadow-pink-100/40">
            <h3 id="rename-folder-title" className="text-lg font-semibold text-neutral-900">
              Rename folder
            </h3>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void applyRename();
                if (e.key === "Escape") setRenaming(null);
              }}
              className="mt-4 w-full rounded-lg border border-pink-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-300"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRenaming(null)} className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !renameValue.trim()}
                onClick={() => void applyRename()}
                className="rounded-lg bg-gradient-to-r from-pink-600 to-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-pink-700 hover:to-rose-600 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
