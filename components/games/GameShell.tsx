"use client";

import { useEffect, type ReactNode } from "react";
import { publishPresentationMode } from "@/lib/workspace-floating-panels";

type Props = {
  title: string;
  subtitle?: string;
  status?: ReactNode;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function GameShell({ title, subtitle, status, open, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    publishPresentationMode(true);
    return () => publishPresentationMode(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#fffafc]/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="grid gap-3 border-b border-pink-100 px-3 py-3 [grid-template-columns:minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-4">
        <button
          type="button"
          onClick={onClose}
          className="col-start-1 row-start-1 justify-self-start rounded-lg px-3 py-1.5 text-sm font-medium text-pink-600 hover:bg-pink-50"
        >
          Close
        </button>
        <div className="col-span-full row-start-2 min-w-0 px-2 text-center sm:col-span-1 sm:col-start-2 sm:row-start-1">
          <p className="text-sm font-semibold text-neutral-800">{title}</p>
          {subtitle ? <p className="mt-0.5 text-xs text-pink-600">{subtitle}</p> : null}
        </div>
        <div className="col-start-2 row-start-1 flex min-w-0 justify-end sm:col-start-3">
          {status ? (
            <div className="truncate text-right text-sm tabular-nums text-neutral-600">{status}</div>
          ) : null}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4 sm:p-6">{children}</div>
    </div>
  );
}
