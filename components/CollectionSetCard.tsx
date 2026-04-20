"use client";

import type { CardSetRow } from "@/lib/types";

type Props = {
  collection: CardSetRow;
  onOpen: () => void;
  onRename: () => void;
};

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

/** Stable 0–5 index from id — used only for accent variety in the pink family */
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

function DeckStackDecoration({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <div className="flex flex-col items-end gap-[3px]">
        <span className="h-[3px] w-7 rounded-full bg-gradient-to-l from-pink-300/90 to-pink-200/40" />
        <span className="h-[3px] w-5 rounded-full bg-gradient-to-l from-rose-300/80 to-rose-200/35" />
        <span className="h-[3px] w-6 rounded-full bg-gradient-to-l from-fuchsia-300/70 to-fuchsia-200/30" />
      </div>
    </div>
  );
}

export function CollectionSetCard({ collection, onOpen, onRename }: Props) {
  const count = collection.card_count ?? 0;
  const accent = accentIndex(collection.id);
  const glow = ACCENT_GLOWS[accent];

  return (
    <article className="group relative flex h-full min-h-[10.5rem] flex-col overflow-hidden rounded-2xl border border-pink-100/85 bg-white shadow-md shadow-pink-100/25 ring-1 ring-pink-50/50 transition hover:-translate-y-0.5 hover:border-pink-200/90 hover:shadow-lg hover:shadow-pink-200/20">
      {/* Soft color wash — varies slightly per set */}
      <div
        className={`pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-bl ${glow} blur-2xl`}
        aria-hidden
      />
      {/* Light dot texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4] mix-blend-multiply"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgb(236 72 153 / 0.12) 1px, transparent 0)",
          backgroundSize: "14px 14px",
        }}
        aria-hidden
      />
      {/* Bottom edge shimmer */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-pink-300/35 to-transparent"
        aria-hidden
      />

      <div className="relative flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 flex-1 rounded-lg text-left transition hover:bg-pink-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/90"
          >
            <h3 className="text-lg font-semibold leading-snug tracking-tight text-neutral-900 line-clamp-2 group-hover:text-pink-700">
              {collection.name}
            </h3>
            <p className="mt-1.5 text-sm text-neutral-500">Tap to open this set</p>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRename();
            }}
            className="shrink-0 rounded-lg p-2 text-pink-500/90 transition hover:bg-pink-50 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
            title="Rename collection"
            aria-label={`Rename collection ${collection.name}`}
          >
            <PencilIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-pink-100/80 pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <DeckStackDecoration className="hidden shrink-0 sm:block" />
            <span className="inline-flex items-center rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold tabular-nums text-pink-800 ring-1 ring-pink-100/90">
              {count} card{count === 1 ? "" : "s"}
            </span>
          </div>
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
