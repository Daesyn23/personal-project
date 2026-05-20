"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { FloatingPanelResizeGrip } from "@/components/FloatingPanelResizeGrip";
import { useWorkspaceTranslation } from "@/hooks/useWorkspaceTranslation";
import { useFloatingPanelSize } from "@/hooks/useFloatingPanelSize";
import {
  FAB_BOTTOM_PRIMARY,
  FAB_BOTTOM_STACKED,
  FLOATING_PANEL_ABOVE_ONE_FAB,
  onCloseFloatingPanels,
  onFloatingPanelOpen,
  publishFloatingPanelOpen,
  requestCloseFloatingPanels,
} from "@/lib/workspace-floating-panels";
import { navigateWorkspace } from "@/lib/workspace-nav";
import { jpFontClass } from "@/lib/workspace-translation";
import { useSpeechActivationHandlers } from "@/lib/useSpeechActivationHandlers";

const TRANSLATE_PANEL_SIZE = {
  storageKey: "workspace-floating-translate-panel-size-v1",
  minW: 280,
  minH: 200,
  defaultW: 320,
  defaultH: 340,
  maxW: 520,
  maxH: 640,
} as const;

function TranslateFabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 5h12M9 3v2m-4 8h12M15 13v2m-6.5 4.5L12 12m0 0l3.5 3.5M12 12l3.5-3.5M12 12L8.5 8.5"
      />
    </svg>
  );
}

function CloseFabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" d="M8 8l8 8M16 8l-8 8" />
    </svg>
  );
}

function SwapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4" />
    </svg>
  );
}

const segBtn = (active: boolean) =>
  `rounded-md px-2 py-1.5 text-[10px] font-semibold leading-none transition ${
    active ? "bg-white text-pink-950 shadow-sm ring-1 ring-pink-200/80" : "text-neutral-600 hover:text-pink-800"
  }`;

const chipBtn = (active?: boolean) =>
  `rounded-md border px-2 py-1 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/80 ${
    active
      ? "border-rose-300 bg-rose-50 text-rose-900"
      : "border-pink-200/90 bg-white text-pink-950 hover:bg-pink-50/90"
  }`;

export function FloatingTranslateWidget() {
  const sourceId = useId();
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const t = useWorkspaceTranslation();
  const { panelRef, panelStyle, onResizeHandlePointerDown } = useFloatingPanelSize(TRANSLATE_PANEL_SIZE, open);

  const fabShell =
    "flex h-12 w-12 items-center justify-center rounded-full border bg-white/90 shadow-sm shadow-neutral-900/[0.04] backdrop-blur-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/70 focus-visible:ring-offset-2";

  const toggleOpen = useCallback(() => {
    setOpen((v) => {
      const next = !v;
      if (next) requestCloseFloatingPanels("translate");
      return next;
    });
  }, []);

  useEffect(() => {
    return onCloseFloatingPanels((except) => {
      if (except !== "translate") setOpen(false);
    });
  }, []);

  useEffect(() => {
    publishFloatingPanelOpen("translate", open);
  }, [open]);

  useEffect(() => {
    return onFloatingPanelOpen((id, isOpen) => {
      if (id === "chat") setChatOpen(isOpen);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && document.activeElement === t.areaRef.current) {
        e.preventDefault();
        void t.translate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, t.translate, t.areaRef]);

  const pressJp = useSpeechActivationHandlers(() => {
    if (!t.result || t.result.direction !== "en-ja") return;
    if (t.speaking === "japanese") t.stopSpeak();
    else t.speakLine(t.result.japanese, "japanese");
  });

  const pressRead = useSpeechActivationHandlers(() => {
    if (!t.result || t.result.direction !== "en-ja" || !t.result.reading) return;
    if (t.speaking === "reading") t.stopSpeak();
    else t.speakLine(t.result.reading, "reading");
  });

  const pressEn = useSpeechActivationHandlers(() => {
    if (!t.result || t.result.direction !== "ja-en") return;
    if (t.speaking === "english") t.stopSpeak();
    else t.speakEnglish(t.result.english);
  });

  const mainCopyText =
    t.result?.direction === "en-ja"
      ? t.result.japanese
      : t.result?.direction === "ja-en"
        ? t.result.english
        : null;
  const mainCopyLabel = t.result?.direction === "en-ja" ? "jp" : t.result?.direction === "ja-en" ? "en" : null;

  return (
    <>
      {!chatOpen ? (
        <button
          type="button"
          onClick={toggleOpen}
          className={`fixed z-[100] ${open ? FAB_BOTTOM_PRIMARY : FAB_BOTTOM_STACKED} ${fabShell} ${
            open
              ? "border-pink-300/90 text-neutral-600 ring-2 ring-pink-200/60 hover:border-neutral-300 hover:bg-neutral-50/95"
              : "border-neutral-200/90 text-pink-600 hover:border-pink-200/70 hover:bg-pink-50/30 hover:text-pink-700"
          }`}
          aria-expanded={open}
          aria-controls="floating-translate-panel"
          aria-label={open ? "Close translation" : "Open translation"}
        >
          {open ? <CloseFabIcon className="h-5 w-5" /> : <TranslateFabIcon className="h-5 w-5" />}
        </button>
      ) : null}

      {open && (
        <div
          ref={panelRef}
          id="floating-translate-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="floating-translate-title"
          className={`${FLOATING_PANEL_ABOVE_ONE_FAB} flex flex-col overflow-hidden rounded-2xl border border-pink-200/70 bg-white shadow-[0_20px_50px_-12px_rgba(236,72,153,0.28),0_8px_24px_-6px_rgba(0,0,0,0.08)] ring-1 ring-pink-100/40`}
          style={panelStyle}
        >
          <button
            type="button"
            onPointerDown={onResizeHandlePointerDown}
            className="absolute left-0 top-0 z-20 flex h-10 w-10 touch-none cursor-nwse-resize items-end justify-end rounded-tl-2xl p-1 text-neutral-400 transition hover:bg-pink-50/80 hover:text-pink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-400/80"
            aria-label="Resize translation panel"
            title="Drag to resize"
          >
            <FloatingPanelResizeGrip className="h-4 w-4" />
          </button>

          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-pink-100/90 bg-gradient-to-r from-pink-50/90 via-white to-rose-50/30 py-2 pl-10 pr-2">
            <div className="min-w-0">
              <h2 id="floating-translate-title" className="text-sm font-bold text-neutral-900">
                Translate
              </h2>
              <p className="text-[10px] text-neutral-500">
                {t.direction === "en-ja" ? "EN → JP" : "JP → EN"} · drag corner to expand
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 rounded-full p-1.5 text-neutral-400 hover:bg-white/90 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/80"
              aria-label="Close"
            >
              <CloseFabIcon className="h-4 w-4" />
            </button>
          </div>

          {t.geminiReady === false && (
            <p className="shrink-0 border-b border-amber-200/80 bg-amber-50/95 px-2.5 py-1.5 text-[10px] text-amber-950">
              API key needed in <code className="font-mono">.env.local</code>
            </p>
          )}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 space-y-2 px-2.5 py-2">
              <div className="flex gap-1">
                <div
                  className="grid min-w-0 flex-1 grid-cols-2 gap-0.5 rounded-lg bg-pink-50/90 p-0.5 ring-1 ring-pink-100/90"
                  role="group"
                  aria-label="Direction"
                >
                  <button type="button" className={segBtn(t.direction === "en-ja")} onClick={() => t.pickDirection("en-ja")}>
                    EN → JP
                  </button>
                  <button type="button" className={segBtn(t.direction === "ja-en")} onClick={() => t.pickDirection("ja-en")}>
                    JP → EN
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => t.pickDirection(t.direction === "en-ja" ? "ja-en" : "en-ja")}
                  className="flex h-auto shrink-0 items-center justify-center rounded-lg border border-pink-200/80 bg-white px-2 text-pink-600 hover:bg-pink-50"
                  title="Swap direction"
                  aria-label="Swap direction"
                >
                  <SwapIcon className="h-3.5 w-3.5" />
                </button>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label htmlFor={sourceId} className="text-[10px] font-semibold text-neutral-700">
                    {t.direction === "en-ja" ? "English" : "Japanese"}
                  </label>
                  <span className={`text-[10px] tabular-nums ${t.overLimit ? "font-bold text-red-600" : "text-neutral-400"}`}>
                    {t.charCount.toLocaleString()}/4k
                  </span>
                </div>
                <textarea
                  ref={t.areaRef}
                  id={sourceId}
                  value={t.source}
                  onChange={(e) => {
                    t.setSource(e.target.value);
                    t.setError(null);
                  }}
                  rows={2}
                  placeholder={t.direction === "en-ja" ? "Paste text…" : "貼り付け…"}
                  lang={t.direction === "ja-en" ? "ja" : undefined}
                  className={`w-full resize-none rounded-lg border px-2.5 py-2 text-[13px] leading-snug outline-none focus:ring-2 ${
                    t.direction === "ja-en" ? jpFontClass : ""
                  } ${
                    t.overLimit
                      ? "border-red-300 focus:ring-red-200/80"
                      : "border-pink-100 bg-neutral-50/40 focus:border-pink-300 focus:ring-pink-200/70"
                  }`}
                />
              </div>

              <details className="group rounded-lg border border-pink-100/80 bg-pink-50/20">
                <summary className="cursor-pointer list-none px-2 py-1.5 text-[10px] font-semibold text-pink-800 marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-2">
                    Options
                    <span className="text-neutral-400 group-open:rotate-180 transition">▾</span>
                  </span>
                </summary>
                <div className="space-y-2 border-t border-pink-100/60 px-2 pb-2 pt-1.5">
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Tone">
                    {(["neutral", "polite", "casual"] as const).map((tone) => (
                      <button
                        key={tone}
                        type="button"
                        onClick={() => t.setTone(tone)}
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          t.tone === tone
                            ? "border-pink-400 bg-pink-50 text-pink-950"
                            : "border-neutral-200/90 bg-white text-neutral-600"
                        }`}
                      >
                        {tone === "polite" ? "Polite" : tone === "casual" ? "Casual" : "Neutral"}
                      </button>
                    ))}
                  </div>
                  {t.direction === "en-ja" ? (
                    <label className="flex cursor-pointer items-center gap-2 text-[10px] font-medium text-neutral-800">
                      <input
                        type="checkbox"
                        checked={t.includeReading}
                        onChange={(e) => t.setIncludeReading(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-pink-300 text-pink-600"
                      />
                      Hiragana reading
                    </label>
                  ) : null}
                </div>
              </details>

              <button
                type="button"
                disabled={t.loading || t.geminiReady === false || t.overLimit || !t.source.trim()}
                onClick={() => void t.translate()}
                className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-pink-600 to-rose-600 text-xs font-bold text-white shadow-md shadow-pink-300/25 transition hover:brightness-[1.03] disabled:opacity-45"
              >
                {t.loading ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                    …
                  </>
                ) : (
                  "Translate"
                )}
              </button>

              {t.error ? (
                <p className="rounded-md bg-red-50 px-2 py-1 text-[10px] font-medium text-red-800" role="alert">
                  {t.error}
                </p>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-2.5 pb-2">
              <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-pink-100/90 bg-white">
                <p className="shrink-0 border-b border-pink-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-pink-500">
                  Result
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {!t.result && !t.loading && (
                    <p className="py-3 text-center text-[10px] text-neutral-400">Result shows here</p>
                  )}
                  {t.loading && (
                    <div className="flex items-center justify-center gap-1.5 py-4 text-[10px] font-medium text-pink-800">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-pink-200 border-t-pink-600" aria-hidden />
                      Working…
                    </div>
                  )}
                  {t.result && !t.loading && t.result.direction === "en-ja" && (
                    <div lang="ja" className="space-y-1.5">
                      <p className={`text-base font-semibold leading-snug text-neutral-900 ${jpFontClass}`}>
                        {t.result.japanese}
                      </p>
                      {t.includeReading && t.result.reading ? (
                        <p className={`rounded bg-rose-50/80 px-1.5 py-1 text-xs text-rose-950 ${jpFontClass}`}>
                          {t.result.reading}
                        </p>
                      ) : null}
                      {t.result.nuance ? (
                        <p className="text-[10px] leading-snug text-neutral-600">
                          <span className="font-semibold">Note · </span>
                          {t.result.nuance}
                        </p>
                      ) : null}
                    </div>
                  )}
                  {t.result && !t.loading && t.result.direction === "ja-en" && (
                    <div lang="en">
                      <p className="text-base font-semibold leading-snug text-neutral-900">{t.result.english}</p>
                      {t.result.nuance ? (
                        <p className="mt-1 text-[10px] leading-snug text-neutral-600">
                          <span className="font-semibold">Note · </span>
                          {t.result.nuance}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              {t.result && !t.loading ? (
                <div className="mt-1.5 flex shrink-0 flex-wrap gap-1">
                  {mainCopyLabel && mainCopyText ? (
                    <button type="button" className={chipBtn()} onClick={() => void t.copyText(mainCopyLabel, mainCopyText)}>
                      {t.copied === mainCopyLabel ? "Copied" : "Copy"}
                    </button>
                  ) : null}
                  {t.result.direction === "en-ja" && t.result.reading ? (
                    <button
                      type="button"
                      className={chipBtn()}
                      onClick={() => void t.copyText("read", t.result!.direction === "en-ja" ? t.result!.reading! : "")}
                    >
                      {t.copied === "read" ? "Copied" : "Reading"}
                    </button>
                  ) : null}
                  {t.ttsSupported && t.result.direction === "en-ja" ? (
                    <>
                      <button
                        type="button"
                        className={chipBtn(t.speaking === "japanese")}
                        onPointerDown={pressJp.onPointerDown}
                        onClick={pressJp.onClick}
                      >
                        {t.speaking === "japanese" ? "Stop JP" : "JP"}
                      </button>
                      {t.result.reading ? (
                        <button
                          type="button"
                          className={chipBtn(t.speaking === "reading")}
                          onPointerDown={pressRead.onPointerDown}
                          onClick={pressRead.onClick}
                        >
                          {t.speaking === "reading" ? "Stop" : "Read"}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {t.ttsSupported && t.result.direction === "ja-en" ? (
                    <button
                      type="button"
                      className={chipBtn(t.speaking === "english")}
                      onPointerDown={pressEn.onPointerDown}
                      onClick={pressEn.onClick}
                    >
                      {t.speaking === "english" ? "Stop EN" : "EN"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {t.history.length > 0 ? (
                <details className="mt-1.5 shrink-0 rounded-lg border border-pink-100/70 bg-white/80">
                  <summary className="cursor-pointer px-2 py-1.5 text-[10px] font-semibold text-pink-700 marker:content-none [&::-webkit-details-marker]:hidden">
                    Recent ({Math.min(5, t.history.length)})
                  </summary>
                  <ul className="max-h-24 space-y-1 overflow-y-auto border-t border-pink-50 px-1.5 py-1">
                    {t.history.slice(0, 5).map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => t.applyHistory(h)}
                          className="w-full rounded-md px-1.5 py-1 text-left hover:bg-pink-50/80"
                        >
                          <span className="line-clamp-1 text-[10px] text-neutral-500">{h.source}</span>
                          <span
                            className={`line-clamp-1 text-[11px] font-semibold text-pink-950 ${
                              h.direction === "en-ja" ? jpFontClass : ""
                            }`}
                          >
                            {h.translation}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-pink-100/80 bg-neutral-50/40 px-2.5 py-1.5">
              <button
                type="button"
                onClick={() => {
                  navigateWorkspace("translate");
                  setOpen(false);
                }}
                className="text-[10px] font-bold text-pink-700 hover:text-pink-900"
              >
                Full page →
              </button>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-neutral-400">⌘↵</span>
                <button
                  type="button"
                  onClick={t.clearAll}
                  className="text-[10px] font-medium text-neutral-500 hover:text-pink-700"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
