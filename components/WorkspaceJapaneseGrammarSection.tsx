"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cancelSpeechSynthesis, speakJapaneseLine } from "@/lib/japanese-tts";
import { HeadingWithInfo } from "@/components/InfoTip";
import { useSpeechActivationHandlers } from "@/lib/useSpeechActivationHandlers";

const MAX_INPUT = 2500;

const jpFontClass =
  "[font-family:ui-sans-serif,'Hiragino_Sans','Hiragino_Kaku_Gothic_ProN','Yu_Gothic_UI','Yu_Gothic',Meiryo,sans-serif]";

const proseEnglish = "font-[family-name:ui-serif,Georgia,Cambria,'Times_New_Roman',serif]";

const panelBase =
  "rounded-xl border border-stone-200/90 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04),0_8px_28px_rgba(15,23,42,0.06)]";

const btnPrimary =
  "inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-pink-600 to-rose-600 px-6 text-sm font-bold text-white shadow-md shadow-pink-300/35 transition hover:brightness-[1.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 sm:w-auto sm:min-w-[12rem]";

const btnGhost =
  "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-stone-50 px-4 py-2 text-xs font-semibold text-stone-800 shadow-sm transition hover:border-pink-300 hover:bg-pink-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/50 disabled:opacity-40";

const btnSpeak =
  "inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-pink-900 shadow-sm transition hover:border-pink-300 hover:bg-pink-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/50";

const btnStopSpeak =
  "inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900 shadow-sm transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400";

type GrammarIssue = { problem: string; whyWrong: string; fix: string };

type GrammarResult = {
  acceptable: boolean;
  severity: "ok" | "minor" | "incorrect";
  explanation: string;
  correctedJapanese: string;
  reading?: string | null;
  issues: GrammarIssue[];
};

export function WorkspaceJapaneseGrammarSection() {
  const textId = useId();
  const contextId = useId();
  const [geminiReady, setGeminiReady] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const [context, setContext] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [includeReading, setIncludeReading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GrammarResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [speaking, setSpeaking] = useState<"corrected" | "reading" | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/gemini/status");
        const data = (await res.json()) as { configured?: boolean };
        if (!cancelled) setGeminiReady(Boolean(data.configured));
      } catch {
        if (!cancelled) setGeminiReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setTtsSupported(true);
    const synth = window.speechSynthesis;
    const refresh = () => {
      synth.getVoices();
    };
    refresh();
    synth.addEventListener("voiceschanged", refresh);
    return () => {
      synth.removeEventListener("voiceschanged", refresh);
    };
  }, []);

  const charCount = text.length;
  const overLimit = charCount > MAX_INPUT;

  const runCheck = useCallback(async () => {
    const t = text.trim();
    if (!t) {
      setError("Enter Japanese text to check.");
      return;
    }
    if (t.length > MAX_INPUT) {
      setError(`Shorten to ${MAX_INPUT} characters or fewer.`);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);
    cancelSpeechSynthesis();
    setSpeaking(null);
    try {
      const res = await fetch("/api/japanese/grammar-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: t,
          context: context.trim() || undefined,
          includeReading,
        }),
      });
      const data = (await res.json()) as GrammarResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Check failed.");
      }
      setResult({
        acceptable: data.acceptable,
        severity: data.severity,
        explanation: data.explanation,
        correctedJapanese: data.correctedJapanese,
        reading: data.reading ?? null,
        issues: Array.isArray(data.issues) ? data.issues : [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [text, context, includeReading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        const el = document.activeElement;
        if (el === areaRef.current || el?.getAttribute("data-grammar-context") === "true") {
          e.preventDefault();
          void runCheck();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runCheck]);

  const copyCorrected = async () => {
    if (!result?.correctedJapanese) return;
    try {
      await navigator.clipboard.writeText(result.correctedJapanese);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to the clipboard.");
    }
  };

  const stopSpeak = useCallback(() => {
    cancelSpeechSynthesis();
    setSpeaking(null);
  }, []);

  const speakCorrected = useCallback(() => {
    if (!result?.correctedJapanese.trim() || typeof window === "undefined" || !window.speechSynthesis) return;
    setError(null);
    speakJapaneseLine(result.correctedJapanese, "japanese", {
      onEnd: () => setSpeaking(null),
      onError: (code) => {
        setSpeaking(null);
        if (code === "not-allowed") {
          setError("Speech was blocked. Allow sound for this site in your browser settings, then try again.");
          return;
        }
        const hint =
          code && code !== "no-api" && code !== "speak-threw" ? ` (${code})` : "";
        setError(`Could not play speech${hint}. Check volume, try again, or add a Japanese voice in system settings.`);
      },
    });
    setSpeaking("corrected");
  }, [result]);

  const speakReading = useCallback(() => {
    const r = result?.reading?.trim();
    if (!r || typeof window === "undefined" || !window.speechSynthesis) return;
    setError(null);
    speakJapaneseLine(r, "reading", {
      onEnd: () => setSpeaking(null),
      onError: (code) => {
        setSpeaking(null);
        if (code === "not-allowed") {
          setError("Speech was blocked. Allow sound for this site in your browser settings, then try again.");
          return;
        }
        const hint =
          code && code !== "no-api" && code !== "speak-threw" ? ` (${code})` : "";
        setError(`Could not play speech${hint}. Check volume, try again, or add a Japanese voice in system settings.`);
      },
    });
    setSpeaking("reading");
  }, [result]);

  const toggleCorrectedSpeak = useCallback(() => {
    if (!result) return;
    if (speaking === "corrected") stopSpeak();
    else speakCorrected();
  }, [result, speaking, stopSpeak, speakCorrected]);

  const toggleGrammarReadingSpeak = useCallback(() => {
    if (!result?.reading?.trim()) return;
    if (speaking === "reading") stopSpeak();
    else speakReading();
  }, [result, speaking, stopSpeak, speakReading]);

  const pressCorrected = useSpeechActivationHandlers(toggleCorrectedSpeak);
  const pressGrammarReading = useSpeechActivationHandlers(toggleGrammarReadingSpeak);

  const verdictBadge = () => {
    if (!result) return null;
    if (result.acceptable && result.severity === "ok") {
      return (
        <span className="inline-flex items-center gap-2 rounded-md border border-emerald-200/90 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-900">
          <span className="h-1.5 w-1.5 shrink-0 rounded-sm bg-emerald-500" aria-hidden />
          Grammar looks good
        </span>
      );
    }
    if (result.severity === "minor") {
      return (
        <span className="inline-flex items-center gap-2 rounded-md border border-amber-200/90 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-950">
          <span className="h-1.5 w-1.5 shrink-0 rounded-sm bg-amber-500" aria-hidden />
          Small issues — see below
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-rose-200/90 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-950">
        <span className="h-1.5 w-1.5 shrink-0 rounded-sm bg-rose-500" aria-hidden />
        Needs correction
      </span>
    );
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl space-y-8">
      {/* Intro — pink accent, stacked report layout */}
      <header className="border-l-4 border-pink-500 bg-gradient-to-r from-rose-50/80 via-stone-50/90 to-pink-50/50 px-4 py-5 sm:px-7 sm:py-7">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <span className="inline-flex rounded border border-pink-200 bg-pink-50/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-pink-800">
              Proofreader
            </span>
            <HeadingWithInfo
              className="mt-3"
              infoLabel="Grammar check"
              heading={
                <h2 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">Japanese grammar check</h2>
              }
            >
              <p className={proseEnglish}>
                Paste a sentence or phrase. You get a verdict, a plain-English rationale, margin-style notes when
                needed, and a corrected line to copy.
              </p>
            </HeadingWithInfo>
          </div>
        </div>
        {geminiReady === false && (
          <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm text-amber-950">
            Add <code className="rounded bg-amber-100 px-1">GEMINI_API_KEY</code>,{" "}
            <code className="rounded bg-amber-100 px-1">GROQ_API_KEY</code>, or{" "}
            <code className="rounded bg-amber-100 px-1">OPENAI_API_KEY</code> to{" "}
            <code className="rounded bg-amber-100 px-1">.env.local</code>, restart{" "}
            <code className="rounded bg-amber-100 px-1">npm run dev</code>, then refresh.
          </p>
        )}
      </header>

      {/* Draft — single column, stone field */}
      <section className={`${panelBase} overflow-hidden`} aria-labelledby="grammar-draft-title">
        <div className="flex items-center gap-3 border-b border-stone-200 bg-gradient-to-r from-pink-50/70 to-stone-100/50 px-5 py-3 sm:px-6">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-pink-600 to-rose-600 text-xs font-bold text-white shadow-sm"
            aria-hidden
          >
            1
          </span>
          <div>
            <h3 id="grammar-draft-title" className="text-sm font-bold text-stone-900">
              Draft
            </h3>
            <p className="text-xs text-stone-500">Your Japanese · up to {MAX_INPUT.toLocaleString()} characters · ⌘ Enter</p>
          </div>
        </div>
        <div className="space-y-4 p-5 sm:p-6">
          <button
            type="button"
            onClick={() => setContextOpen((o) => !o)}
            className="text-xs font-semibold text-pink-800 underline decoration-pink-300/80 underline-offset-2 hover:text-pink-950"
          >
            {contextOpen ? "Hide optional context" : "+ Optional context (who is speaking, medium, …)"}
          </button>
          {contextOpen && (
            <label className="block text-xs font-medium text-stone-600" htmlFor={contextId}>
              Disambiguates particles, keigo, and vague wording
              <textarea
                id={contextId}
                data-grammar-context="true"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={2}
                placeholder="e.g. Email to a professor; LINE message to a friend; poster headline…"
                className="mt-1.5 w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-inner outline-none focus:border-pink-400 focus:ring-1 focus:ring-pink-300/40"
              />
            </label>
          )}
          <label className="block text-sm font-semibold text-stone-800" htmlFor={textId}>
            Phrase or sentence
            <textarea
              ref={areaRef}
              id={textId}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              rows={9}
              placeholder="例：昨日、図書館で本を読みました。"
              spellCheck={false}
              lang="ja"
              className={`mt-2 min-h-[10.5rem] w-full resize-y rounded-lg border bg-white px-3 py-3 text-[15px] leading-relaxed text-stone-900 shadow-inner outline-none transition focus:ring-2 sm:min-h-[12rem] sm:text-base ${jpFontClass} ${
                overLimit
                  ? "border-red-400 focus:border-red-500 focus:ring-red-200"
                  : "border-stone-300 focus:border-pink-400 focus:ring-pink-200/60"
              }`}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200/80 pt-4">
            <span className={overLimit ? "text-xs font-semibold text-red-600" : "text-xs tabular-nums text-stone-500"}>
              {charCount.toLocaleString()} / {MAX_INPUT.toLocaleString()}
            </span>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={includeReading}
                  onChange={(e) => setIncludeReading(e.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 text-pink-600 focus:ring-pink-500"
                />
                Hiragana reading
              </label>
              <button
                type="button"
                onClick={() => {
                  setText("");
                  setContext("");
                  setResult(null);
                  setError(null);
                }}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={loading || geminiReady === false || overLimit || !text.trim()}
                onClick={() => void runCheck()}
                className={btnPrimary}
              >
                {loading ? (
                  <>
                    <span
                      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white"
                      aria-hidden
                    />
                    Checking…
                  </>
                ) : (
                  "Run check"
                )}
              </button>
            </div>
          </div>
          {error && (
            <p className="text-sm font-medium text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>

      {/* Report — full-width card below, numbered steps */}
      <section className={`${panelBase} overflow-hidden`} aria-labelledby="grammar-report-title">
        <div className="flex items-center gap-3 border-b border-stone-200 bg-gradient-to-r from-rose-50/50 to-pink-50/40 px-5 py-3 sm:px-6">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-pink-200 bg-pink-50 text-xs font-bold text-pink-900"
            aria-hidden
          >
            2
          </span>
          <div>
            <h3 id="grammar-report-title" className="text-sm font-bold text-stone-900">
              Report
            </h3>
            <p className="text-xs text-stone-500">Verdict → rationale → fixes → corrected line</p>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {!result && !loading && (
            <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50/50 px-4 py-12 text-center">
              <p className="text-sm font-semibold text-stone-700">Nothing to show yet</p>
              <p className={`mx-auto mt-2 max-w-md text-xs leading-relaxed text-stone-500 ${proseEnglish}`}>
                Run a check from the draft above. This panel fills with a verdict, explanation, optional bullet fixes, and
                a corrected Japanese line.
              </p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center gap-4 py-16" aria-live="polite">
              <span
                className="h-11 w-11 animate-spin rounded-full border-[3px] border-pink-100 border-t-pink-600"
                aria-hidden
              />
              <p className="text-sm font-semibold text-pink-900">Reviewing grammar…</p>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-8">
              <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 pb-5">{verdictBadge()}</div>

              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-widest text-pink-800/90">Rationale</h4>
                <div
                  className={`mt-3 rounded-lg border border-stone-200 bg-stone-50/80 px-4 py-4 text-[15px] leading-relaxed text-stone-800 ${proseEnglish}`}
                >
                  {result.explanation}
                </div>
              </div>

              {result.issues.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-pink-800/90">Margin notes</h4>
                  <ul className="mt-3 space-y-0 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
                    {result.issues.map((issue, i) => (
                      <li key={`${issue.problem}-${i}`} className="flex gap-4 px-4 py-4 sm:gap-5">
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-pink-100 text-xs font-bold text-pink-900"
                          aria-hidden
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1 text-sm">
                          <p className="font-semibold text-stone-900">{issue.problem}</p>
                          <p className={`mt-1.5 text-stone-600 ${proseEnglish}`}>{issue.whyWrong}</p>
                          <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-pink-800/80">
                            Suggested Japanese
                          </p>
                          <p className={`mt-1 text-base font-medium text-stone-900 ${jpFontClass}`}>{issue.fix}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-emerald-800/90">Corrected line</h4>
                  {ttsSupported && result.correctedJapanese.trim() ? (
                    <button
                      type="button"
                      onPointerDown={pressCorrected.onPointerDown}
                      onClick={pressCorrected.onClick}
                      className={speaking === "corrected" ? btnStopSpeak : btnSpeak}
                      aria-label={speaking === "corrected" ? "Stop speech" : "Speak corrected Japanese"}
                    >
                      {speaking === "corrected" ? "Stop" : "Speak"}
                    </button>
                  ) : null}
                </div>
                <p
                  className={`mt-3 whitespace-pre-wrap break-words rounded-lg border-2 border-emerald-300/90 bg-gradient-to-br from-emerald-50 to-green-50/80 px-4 py-4 text-lg font-semibold leading-snug text-stone-900 sm:text-xl ${jpFontClass}`}
                >
                  {result.correctedJapanese}
                </p>
                {includeReading && result.reading ? (
                  <div className="mt-4 rounded-lg border border-pink-200 bg-pink-50/40 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-pink-800/80">Reading</p>
                      {ttsSupported ? (
                        <button
                          type="button"
                          onPointerDown={pressGrammarReading.onPointerDown}
                          onClick={pressGrammarReading.onClick}
                          className={speaking === "reading" ? btnStopSpeak : btnSpeak}
                          aria-label={speaking === "reading" ? "Stop speech" : "Speak hiragana reading"}
                        >
                          {speaking === "reading" ? "Stop" : "Speak"}
                        </button>
                      ) : null}
                    </div>
                    <p className={`mt-1 whitespace-pre-wrap break-words text-base font-medium text-stone-900 ${jpFontClass}`}>
                      {result.reading}
                    </p>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className={btnGhost} onClick={() => void copyCorrected()}>
                    {copied ? "Copied" : "Copy corrected Japanese"}
                  </button>
                </div>
              </div>

              <p className={`border-t border-stone-200 pt-4 text-[11px] leading-relaxed text-stone-500 ${proseEnglish}`}>
                AI can miss nuance or rare patterns. For exams or publication, double-check with a teacher or native
                speaker.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
