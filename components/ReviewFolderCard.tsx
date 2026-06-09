"use client";

import type { ReviewFolderRow } from "@/lib/types";

type Props = {
  folder: ReviewFolderRow;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
};

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  );
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

function accentIndex(id: string): number {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n + id.charCodeAt(i) * (i + 17)) % 1000;
  return n % 6;
}

const ACCENT_GLOWS = [
  "from-pink-300/30 via-rose-200/15 to-transparent",
  "from-rose-300/28 via-fuchsia-200/12 to-transparent",
  "from-fuchsia-300/26 via-pink-200/14 to-transparent",
  "from-pink-400/22 via-rose-300/10 to-transparent",
  "from-rose-400/24 via-pink-200/12 to-transparent",
  "from-fuchsia-400/20 via-rose-200/10 to-transparent",
] as const;

export function ReviewFolderCard({ folder, onOpen, onRename, onDelete }: Props) {
  const count = folder.item_count ?? 0;
  const glow = ACCENT_GLOWS[accentIndex(folder.id)];

  return (
    <article className="group relative flex h-full min-h-[10.5rem] flex-col overflow-hidden rounded-2xl border border-pink-100/85 bg-white shadow-md shadow-pink-100/25 ring-1 ring-pink-50/50 transition hover:-translate-y-0.5 hover:border-pink-200/90 hover:shadow-lg hover:shadow-pink-200/20">
      <div
        className={`pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-bl ${glow} blur-2xl`}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4] mix-blend-multiply"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgb(236 72 153 / 0.12) 1px, transparent 0)",
          backgroundSize: "14px 14px",
        }}
        aria-hidden
      />

      <div className="relative flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 flex-1 rounded-lg text-left transition hover:bg-pink-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/90"
          >
            <div className="flex items-center gap-2">
              <FolderIcon className="h-5 w-5 shrink-0 text-pink-400" />
              <h3 className="text-lg font-semibold leading-snug tracking-tight text-neutral-900 line-clamp-2 group-hover:text-pink-700">
                {folder.name}
              </h3>
            </div>
            <p className="mt-1.5 text-sm text-neutral-500">Tap to open and add cards</p>
          </button>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRename();
              }}
              className="rounded-lg p-2 text-pink-500/90 transition hover:bg-pink-50 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
              title="Rename folder"
              aria-label={`Rename folder ${folder.name}`}
            >
              <PencilIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }}
              className="rounded-lg p-2 text-rose-500/90 transition hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              title="Delete folder"
              aria-label={`Delete folder ${folder.name}`}
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-pink-100/80 pt-4">
          <span className="inline-flex items-center rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold tabular-nums text-pink-800 ring-1 ring-pink-100/90">
            {count} card{count === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={onOpen}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-pink-600 opacity-0 transition group-hover:opacity-100 hover:bg-pink-50 hover:text-pink-700 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
          >
            Open →
          </button>
        </div>
      </div>
    </article>
  );
}
