"use client";

import type { WorkspaceFolderRow } from "@/lib/types";

type Props = {
  folder: WorkspaceFolderRow;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
};

/** Prefer a number from the folder name (e.g. Lesson 12 → 12). */
function lessonNumberDisplay(name: string, id: string): string {
  const m = name.match(/(\d+)/);
  if (m) return m[1];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 3)) % 90;
  return String(h + 10);
}

export function WorkspaceLessonFolderCard({ folder, onOpen, onRename, onDelete }: Props) {
  const count = folder.item_count ?? 0;
  const num = lessonNumberDisplay(folder.name, folder.id);

  return (
    <li className="list-none">
      <div className="relative overflow-hidden rounded-2xl border border-pink-200/75 bg-gradient-to-br from-white via-rose-50/40 to-pink-50/50 shadow-md shadow-pink-100/45 ring-1 ring-pink-100/70 transition hover:-translate-y-1 hover:border-pink-300/90 hover:shadow-xl hover:shadow-pink-200/35">
        <div
          className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-pink-400 via-rose-400 to-fuchsia-400"
          aria-hidden
        />
        <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-to-br from-pink-200/40 to-rose-200/20 blur-2xl" aria-hidden />
        <div className="absolute bottom-0 right-6 h-16 w-24 rounded-full bg-rose-100/30 blur-xl" aria-hidden />

        <div className="relative flex gap-3 p-4 pl-5 sm:gap-4 sm:p-5">
          <button
            type="button"
            onClick={onOpen}
            className="flex h-[4.25rem] w-[4.25rem] shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 via-rose-500 to-pink-600 text-white shadow-lg shadow-pink-400/40 transition hover:brightness-105 hover:shadow-xl hover:shadow-pink-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 active:scale-[0.98] sm:h-[4.75rem] sm:w-[4.75rem]"
            aria-label={`Open ${folder.name}`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/85">Lesson</span>
            <span className="mt-0.5 text-2xl font-bold tabular-nums leading-none tracking-tight sm:text-[1.75rem]">{num}</span>
          </button>

          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <button
              type="button"
              onClick={onOpen}
              className="group/main text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
            >
              <span className="line-clamp-2 text-lg font-bold leading-snug tracking-tight text-neutral-900">{folder.name}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                <span className="inline-flex items-center rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-medium tabular-nums text-pink-800 ring-1 ring-pink-100/90 shadow-sm">
                  {count === 0 ? "Empty" : `${count} item${count === 1 ? "" : "s"}`}
                </span>
                <span className="text-pink-600/90 opacity-0 transition group-hover/main:opacity-100">Open →</span>
              </span>
            </button>
          </div>

          <div className="flex shrink-0 flex-col justify-center gap-1 border-l border-pink-100/90 pl-2 sm:pl-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRename();
              }}
              className="rounded-lg p-2 text-neutral-400 transition hover:bg-pink-50 hover:text-pink-700"
              title="Rename"
              aria-label={`Rename ${folder.name}`}
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
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="rounded-lg p-2 text-neutral-400 transition hover:bg-red-50 hover:text-red-600"
              title="Delete folder"
              aria-label={`Delete ${folder.name}`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}
