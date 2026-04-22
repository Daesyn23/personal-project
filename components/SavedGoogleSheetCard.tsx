"use client";

import type { SavedGoogleSheetLink } from "@/lib/google-sheets-links";
import { parseSpreadsheetId } from "@/lib/parse-spreadsheet-url";
import { normalizeSheetsA1Range } from "@/lib/sheets-a1";

type Props = {
  link: SavedGoogleSheetLink;
  onOpen: () => void;
  onConfigure: () => void;
  onRename: () => void;
  onRemove: () => void;
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

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
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

function GridDecoration({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <div
        className="h-10 w-10 rounded-lg border border-pink-200/60 bg-gradient-to-br from-white to-pink-50/80 p-1 shadow-sm"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(244 114 182 / 0.15) 1px, transparent 1px), linear-gradient(to bottom, rgb(244 114 182 / 0.15) 1px, transparent 1px)",
          backgroundSize: "4px 4px",
        }}
      />
    </div>
  );
}

export function SavedGoogleSheetCard({ link, onOpen, onConfigure, onRename, onRemove }: Props) {
  const accent = accentIndex(link.id);
  const glow = ACCENT_GLOWS[accent];
  const sid = parseSpreadsheetId(link.spreadsheetInput);
  const norm = normalizeSheetsA1Range(link.range);
  const rangeTail = norm.includes("!") ? (norm.split("!")[1] ?? norm) : norm;

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
            <h3 className="line-clamp-2 text-lg font-semibold leading-snug tracking-tight text-neutral-900 group-hover:text-pink-700">
              {link.label}
            </h3>
            <p className="mt-1.5 line-clamp-2 font-mono text-[11px] text-neutral-500 sm:text-xs">
              {sid ? (
                <>
                  <span className="text-pink-800/90">{sid.slice(0, 12)}</span>
                  {sid.length > 12 ? "…" : ""}
                  <span className="text-neutral-400"> · </span>
                </>
              ) : (
                <span className="text-amber-700">No spreadsheet ID · </span>
              )}
              <span>{rangeTail}</span>
            </p>
            <p className="mt-1 text-sm text-neutral-500">Tap to open this link</p>
          </button>
          <div className="flex shrink-0 flex-col gap-0.5 sm:flex-row sm:items-start">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRename();
              }}
              className="rounded-lg p-2 text-pink-500/90 transition hover:bg-pink-50 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
              title="Rename"
              aria-label={`Rename ${link.label}`}
            >
              <PencilIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove();
              }}
              className="rounded-lg p-2 text-neutral-400 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
              title="Remove saved link"
              aria-label={`Remove ${link.label}`}
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-pink-100/80 pt-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <GridDecoration className="hidden shrink-0 sm:block" />
            <span className="inline-flex max-w-[min(100%,12rem)] truncate rounded-full bg-pink-50 px-3 py-1 text-xs font-medium text-pink-900/90 ring-1 ring-pink-100/90 sm:max-w-[14rem]">
              Google Sheet
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onConfigure();
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-pink-200/90 bg-white text-pink-600 shadow-sm transition hover:border-pink-300 hover:bg-pink-50 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
              title="Connection settings"
              aria-label={`Connection settings for ${link.label}`}
            >
              <GearIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpen();
              }}
              className="rounded-xl border border-pink-200/90 bg-gradient-to-r from-pink-600 to-rose-600 px-3 py-2 text-xs font-bold text-white shadow-sm shadow-pink-200/30 transition hover:from-pink-700 hover:to-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
            >
              Open
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
