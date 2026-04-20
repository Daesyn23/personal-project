"use client";

import type { CSSProperties } from "react";
import type { WorkspaceFolderRow } from "@/lib/types";

type Props = {
  folder: WorkspaceFolderRow;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
};

function hashHue(id: string, name: string): number {
  let h = 0;
  const s = id + name;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 13)) % 360;
  return 320 + (h % 45);
}

function thumbnailStyle(id: string, name: string): CSSProperties {
  const h1 = hashHue(id, name);
  const h2 = (h1 + 18) % 360;
  return {
    background: `linear-gradient(145deg, hsl(${h1} 52% 88%) 0%, hsl(${h2} 48% 82%) 45%, hsl(${h1} 40% 78%) 100%)`,
  };
}

function levelDescription(name: string): string {
  const t = name.trim();
  if (/^N[1-5]$/i.test(t)) {
    return `Grammar, vocabulary, and lesson PDFs for JLPT ${t.toUpperCase()}. Open to browse lessons.`;
  }
  if (/jlpt/i.test(t)) {
    return "Grammar, vocabulary, and study files for this level. Open to browse lessons.";
  }
  return "Lessons and documents organized in this folder. Open to continue.";
}

function thumbLabel(name: string): string {
  const t = name.trim();
  if (t.length <= 6) return t;
  return t.slice(0, 5) + "…";
}

function StackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" opacity="0.9" />
    </svg>
  );
}

export function WorkspaceLevelCollectionCard({ folder, onOpen, onRename, onDelete }: Props) {
  const count = folder.item_count ?? 0;
  const desc = levelDescription(folder.name);

  return (
    <li className="list-none">
      <div className="group relative flex gap-4 overflow-hidden rounded-xl border border-neutral-200/90 bg-white p-3 shadow-sm shadow-pink-100/25 ring-1 ring-pink-50/40 transition hover:border-pink-200/90 hover:shadow-md hover:shadow-pink-100/40 sm:p-4">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
        >
          <div
            className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg sm:h-[7.25rem] sm:w-[7.25rem]"
            style={thumbnailStyle(folder.id, folder.name)}
          >
            <div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage: "radial-gradient(circle at 30% 20%, white 0%, transparent 55%)",
              }}
              aria-hidden
            />
            <span className="absolute inset-0 flex items-center justify-center font-semibold tracking-tight text-white/95 drop-shadow-sm">
              <span className="rounded-lg bg-white/25 px-2 py-1 text-lg backdrop-blur-[2px] sm:text-xl">
                {thumbLabel(folder.name)}
              </span>
            </span>
            <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-neutral-900/55 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
              <StackIcon className="h-3 w-3 opacity-95" />
              <span>{count}</span>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-0.5 pr-2">
            <h4 className="text-base font-bold leading-tight tracking-tight text-neutral-900 sm:text-lg">{folder.name}</h4>
            <p className="line-clamp-2 text-sm leading-snug text-neutral-600">{desc}</p>
          </div>
        </button>

        <div className="flex shrink-0 flex-col justify-center gap-1 border-l border-pink-100/80 pl-2 sm:pl-3">
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
    </li>
  );
}
