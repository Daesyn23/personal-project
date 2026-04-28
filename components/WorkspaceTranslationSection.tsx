"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

const STORAGE_HISTORY = "workspace-en-ja-translation-history-v1";
const MAX_HISTORY = 24;
const MAX_SOURCE = 4000;

type Tone = "neutral" | "polite" | "casual";

type HistoryRow = {
  id: string;
  at: number;
  source: string;
  japanese: string;
  reading: string | null;
  tone: Tone;
};

type TranslateResponse = {
  japanese: string;
  reading: string | null;
  nuance: string | null;
  error?: string;
};

function loadHistory(): HistoryRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    const out: HistoryRow[] = [];
    for (const row of p) {
      if (!row || typeof row !== "object") continue;
      const id = (row as { id?: unknown }).id;
      const at = (row as { at?: unknown }).at;
      const source = (row as { source?: unknown }).source;
      const japanese = (row as { japanese?: unknown }).japanese;
      const reading = (row as { reading?: unknown }).reading;
      const tone = (row as { tone?: unknown }).tone;
      if (typeof id !== "string" || typeof at !== "number") continue;
      if (typeof source !== "string" || typeof japanese !== "string") continue;
      if (tone !== "neutral" && tone !== "polite" && tone !== "casual") continue;
      const r = reading === null || typeof reading === "string" ? reading : null;
      out.push({ id, at, source, japanese, reading: r, tone });
    }
    return out.slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function saveHistory(rows: HistoryRow[]) {
  try {
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(rows.slice(0, MAX_HISTORY)));
  } catch {
    /* quota */
  }
}

/** System Japanese stack (no extra font download). */
const jpFontClass =
  "[font-family:ui-sans-serif,'Hiragino_Sans','Hiragino_Kaku_Gothic_ProN','Yu_Gothic_UI','Yu_Gothic',Meiryo,sans-serif]";

const cardShell =
  "relative overflow-hidden rounded-2xl border border-pink-100/90 bg-white/95 shadow-lg shadow-pink-100/25 ring-1 ring-rose-50/70";

const gradientBar =
  "pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-rose-400 via-pink-400 to-fuchsia-400 opacity-90";

const btnPrimary =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-600 via-rose-600 to-fuchsia-600 px-6 text-sm font-bold text-white shadow-lg shadow-pink-300/35 transition hover:brightness-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45";

const btnGhost =
  "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-pink-200/90 bg-white px-3 py-2 text-xs font-semibold text-pink-950 shadow-sm transition hover:border-pink-300 hover:bg-pink-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 disabled:opacity-40";

const btnStopSpeak =
  "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-rose-300/90 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900 shadow-sm transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-40";

/** Even wrapping for copy + speech controls */
const actionGrid =
  "grid w-full gap-2 [grid-template-columns:repeat(auto-fill,minmax(10.75rem,1fr))]";

const toneBtn = (active: boolean) =>
  `rounded-xl border px-3 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm ${
    active
      ? "border-pink-400 bg-pink-50 text-pink-950 shadow-sm ring-1 ring-pink-200"
      : "border-neutral-200/90 bg-white text-neutral-600 hover:border-pink-200 hover:bg-pink-50/50"
  }`;

function getBestJapaneseVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === "undefined") return undefined;
  const list = window.speechSynthesis.getVoices();
  return (
    list.find((v) => v.lang.replace("_", "-").toLowerCase().startsWith("ja")) ||
    list.find((v) => /Japanese|日本語|Kyoto|Otoya|Hattori/i.test(v.name))
  );
}

function stopSpeechSynthesis() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function WorkspaceTranslationSection() {
  const sourceId = useId();
  const contextId = useId();
  const [geminiReady, setGeminiReady] = useState<boolean | null>(null);
  const [source, setSource] = useState("");
  const [context, setContext] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [tone, setTone] = useState<Tone>("neutral");
  const [includeReading, setIncludeReading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Pick<TranslateResponse, "japanese" | "reading" | "nuance"> | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  /** null = idle, otherwise which line is playing */
  const [speaking, setSpeaking] = useState<"japanese" | "reading" | null>(null);
  const [ttsSupported, setTtsSupported] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setHistory(loadHistory());
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
      synth.cancel();
    };
  }, []);

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

  const charCount = source.length;
  const overLimit = charCount > MAX_SOURCE;

  const pushHistory = useCallback((row: Omit<HistoryRow, "id" | "at"> & { id?: string; at?: number }) => {
    const entry: HistoryRow = {
      id: row.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      at: row.at ?? Date.now(),
      source: row.source,
      japanese: row.japanese,
      reading: row.reading,
      tone: row.tone,
    };
    setHistory((prev) => {
      const next = [entry, ...prev.filter((h) => h.source !== entry.source || h.japanese !== entry.japanese)].slice(
        0,
        MAX_HISTORY
      );
      saveHistory(next);
      return next;
    });
  }, []);

  const translate = useCallback(async () => {
    const t = source.trim();
    if (!t) {
      setError("Type or paste English above, then translate.");
      return;
    }
    if (t.length > MAX_SOURCE) {
      setError(`Shorten the text to ${MAX_SOURCE} characters or fewer.`);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    stopSpeechSynthesis();
    setSpeaking(null);
    try {
      const res = await fetch("/api/translate/en-ja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: t,
          style: tone,
          includeReading,
          context: context.trim() || undefined,
        }),
      });
      const data = (await res.json()) as TranslateResponse;
      if (!res.ok) {
        throw new Error(data.error || "Translation failed.");
      }
      setResult({
        japanese: data.japanese,
        reading: data.reading,
        nuance: data.nuance,
      });
      pushHistory({
        source: t,
        japanese: data.japanese,
        reading: data.reading,
        tone,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [source, tone, includeReading, context, pushHistory]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        const el = document.activeElement;
        if (el === areaRef.current || el?.getAttribute("data-translation-context") === "true") {
          e.preventDefault();
          void translate();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [translate]);

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not copy to the clipboard.");
    }
  };

  const clearAll = () => {
    stopSpeechSynthesis();
    setSpeaking(null);
    setSource("");
    setContext("");
    setResult(null);
    setError(null);
  };

  const stopSpeak = useCallback(() => {
    stopSpeechSynthesis();
    setSpeaking(null);
  }, []);

  const speakLine = useCallback((text: string, kind: "japanese" | "reading") => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setError("Speech is not supported in this browser.");
      return;
    }
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!trimmed) return;

    setError(null);
    stopSpeechSynthesis();

    const run = () => {
      const voice = getBestJapaneseVoice();
      const u = new SpeechSynthesisUtterance(trimmed);
      u.lang = voice?.lang?.toLowerCase().startsWith("ja") ? voice.lang : "ja-JP";
      if (voice) u.voice = voice;
      u.rate = kind === "reading" ? 0.88 : 0.9;
      u.pitch = 1;
      u.onend = () => setSpeaking(null);
      u.onerror = () => {
        setSpeaking(null);
        setError("Could not play speech (check browser permissions or try again).");
      };
      setSpeaking(kind);
      window.speechSynthesis.speak(u);
    };

    if (window.speechSynthesis.getVoices().length === 0) {
      let ran = false;
      const finish = () => {
        if (ran) return;
        ran = true;
        window.speechSynthesis.removeEventListener("voiceschanged", finish);
        run();
      };
      window.speechSynthesis.addEventListener("voiceschanged", finish);
      window.setTimeout(finish, 1600);
      return;
    }
    run();
  }, []);

  const applyHistory = (h: HistoryRow) => {
    stopSpeechSynthesis();
    setSpeaking(null);
    setSource(h.source);
    setTone(h.tone);
    setResult({
      japanese: h.japanese,
      reading: h.reading,
      nuance: null,
    });
    setError(null);
    areaRef.current?.focus();
  };

  const tips = useMemo(
    () => [
      "Lesson titles and rubric lines",
      "Short dialogues for class",
      "App buttons and form labels",
      "Vocabulary with extra context in the optional box",
    ],
    []
  );

  return (
    <div className="w-full min-w-0 max-w-full space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-pink-100/80 bg-gradient-to-br from-white via-rose-50/40 to-fuchsia-50/30 p-6 shadow-xl shadow-pink-100/30 ring-1 ring-rose-100/50 sm:p-8">
        <div
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-gradient-to-br from-rose-200/50 to-fuchsia-200/40 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wider text-pink-600/90">Translation</p>
          <h2 className="mt-1 max-w-2xl bg-gradient-to-r from-rose-700 via-pink-600 to-fuchsia-600 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
            English → Japanese
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-600">
            Natural Japanese with tone control, optional hiragana reading, copy buttons, and{" "}
            <strong className="font-semibold text-neutral-800">listen</strong> with your browser’s Japanese voice — for
            study and classroom prep.
          </p>
          {geminiReady === false && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm text-amber-950">
              Add <code className="rounded bg-amber-100 px-1">GEMINI_API_KEY</code> to{" "}
              <code className="rounded bg-amber-100 px-1">.env.local</code>, restart <code className="rounded bg-amber-100 px-1">npm run dev</code>, then refresh this page.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className={`${cardShell} flex flex-col`}>
          <div className={gradientBar} aria-hidden />
          <div className="border-b border-pink-50/90 bg-gradient-to-r from-rose-50/90 via-white to-pink-50/50 px-5 py-4 sm:px-6">
            <h3 className="text-sm font-bold text-neutral-900">English source</h3>
            <p className="mt-0.5 text-xs text-neutral-500">Up to {MAX_SOURCE.toLocaleString()} characters · ⌘ Enter to translate</p>
          </div>
          <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
            <button
              type="button"
              onClick={() => setContextOpen((o) => !o)}
              className="self-start text-xs font-semibold text-pink-700 underline decoration-pink-300 underline-offset-2 hover:text-pink-900"
            >
              {contextOpen ? "Hide optional context" : "Optional context (scene, audience, …)"}
            </button>
            {contextOpen && (
              <label className="block text-xs font-medium text-neutral-600" htmlFor={contextId}>
                Disambiguate names, polysemy, or tone
                <textarea
                  id={contextId}
                  data-translation-context="true"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  rows={2}
                  placeholder="e.g. 5th grade science class; title of a worksheet; character is a student…"
                  className="mt-1.5 w-full resize-y rounded-xl border border-pink-100 bg-white px-3 py-2 text-sm text-neutral-900 shadow-inner outline-none ring-pink-100 focus:border-pink-300 focus:ring-2 focus:ring-pink-200/80"
                />
              </label>
            )}
            <label className="block flex-1 text-sm font-medium text-neutral-800" htmlFor={sourceId}>
              Text to translate
              <textarea
                ref={areaRef}
                id={sourceId}
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setError(null);
                }}
                rows={10}
                placeholder="Paste a sentence, a list of terms, or a paragraph…"
                spellCheck={true}
                className={`mt-1.5 min-h-[12rem] w-full flex-1 resize-y rounded-2xl border bg-white px-4 py-3 text-[15px] leading-relaxed text-neutral-900 shadow-inner outline-none transition focus:ring-2 sm:min-h-[14rem] sm:text-base ${
                  overLimit
                    ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                    : "border-pink-100 focus:border-pink-300 focus:ring-pink-200/80"
                }`}
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className={overLimit ? "font-semibold text-red-600" : "tabular-nums text-neutral-500"}>
                {charCount.toLocaleString()} / {MAX_SOURCE.toLocaleString()}
              </span>
              <button type="button" onClick={clearAll} className="font-medium text-neutral-500 hover:text-pink-700">
                Clear all
              </button>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Tone</p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Japanese tone">
                <button type="button" className={toneBtn(tone === "neutral")} onClick={() => setTone("neutral")}>
                  Neutral
                </button>
                <button type="button" className={toneBtn(tone === "polite")} onClick={() => setTone("polite")}>
                  Polite (です／ます)
                </button>
                <button type="button" className={toneBtn(tone === "casual")} onClick={() => setTone("casual")}>
                  Casual
                </button>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-pink-100/90 bg-pink-50/30 px-3 py-2.5">
              <input
                type="checkbox"
                checked={includeReading}
                onChange={(e) => setIncludeReading(e.target.checked)}
                className="h-4 w-4 rounded border-pink-300 text-pink-600 focus:ring-pink-500"
              />
              <span className="text-sm font-medium text-neutral-800">
                Full hiragana reading line
                <span className="mt-0.5 block text-xs font-normal text-neutral-500">Helps with kanji you have not learned yet</span>
              </span>
            </label>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={loading || geminiReady === false || overLimit || !source.trim()}
                onClick={() => void translate()}
                className={btnPrimary}
              >
                {loading ? (
                  <>
                    <span
                      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white"
                      aria-hidden
                    />
                    Translating…
                  </>
                ) : (
                  "Translate"
                )}
              </button>
            </div>
            {error && (
              <p className="text-sm font-medium text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>

        <div className={`${cardShell} flex min-h-[22rem] flex-col`}>
          <div className={gradientBar} aria-hidden />
          <div className="border-b border-pink-50/90 bg-gradient-to-r from-fuchsia-50/50 via-white to-rose-50/80 px-5 py-4 sm:px-6">
            <h3 className="text-sm font-bold text-neutral-900">Japanese result</h3>
            <p className="mt-0.5 text-xs text-neutral-500">Copy or listen — ideal for flashcards, slides, or Sheets</p>
          </div>
          <div className="flex flex-1 flex-col p-5 sm:p-6">
            {!result && !loading && (
              <div className="flex flex-1 flex-col justify-center gap-4 rounded-2xl border border-dashed border-pink-100 bg-gradient-to-b from-pink-50/40 to-white px-4 py-10 text-center">
                <p className="text-sm font-medium text-neutral-700">Ready when you are</p>
                <p className="text-xs leading-relaxed text-neutral-500">
                  Your translation, optional reading line, nuance note, and speech buttons will appear here.
                </p>
              </div>
            )}
            {loading && (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16" aria-live="polite">
                <span
                  className="h-12 w-12 animate-spin rounded-full border-[3px] border-pink-100 border-t-pink-600"
                  aria-hidden
                />
                <p className="text-sm font-semibold text-pink-900">Working on it…</p>
              </div>
            )}
            {result && !loading && (
              <div className="flex flex-1 flex-col gap-6" lang="ja">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-pink-600/90">Japanese</p>
                  <p
                    className={`mt-2 whitespace-pre-wrap break-words text-2xl font-semibold leading-snug text-neutral-900 sm:text-[1.65rem] ${jpFontClass}`}
                  >
                    {result.japanese}
                  </p>
                </div>
                {includeReading && result.reading && (
                  <div className="rounded-xl border border-rose-100 bg-rose-50/50 px-4 py-3.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-rose-700/90">Reading</p>
                    <p className={`mt-2 text-base leading-relaxed text-rose-950 sm:text-lg ${jpFontClass}`}>
                      {result.reading}
                    </p>
                  </div>
                )}
                {result.nuance && (
                  <p className="rounded-xl border border-neutral-100 bg-neutral-50/90 px-3 py-2 text-xs leading-relaxed text-neutral-700">
                    <span className="font-semibold text-neutral-800">Note: </span>
                    {result.nuance}
                  </p>
                )}
                <div className="mt-auto space-y-4 border-t border-pink-100/80 pt-6">
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">Copy</p>
                    <div className={actionGrid}>
                      <button
                        type="button"
                        className={`${btnGhost} w-full`}
                        onClick={() => void copyText("jp", result.japanese)}
                      >
                        {copied === "jp" ? "Copied Japanese" : "Copy Japanese"}
                      </button>
                      {result.reading && (
                        <button
                          type="button"
                          className={`${btnGhost} w-full`}
                          onClick={() => void copyText("read", result.reading!)}
                        >
                          {copied === "read" ? "Copied reading" : "Copy reading"}
                        </button>
                      )}
                      <button
                        type="button"
                        className={`${btnGhost} w-full`}
                        onClick={() =>
                          void copyText(
                            "both",
                            result.reading ? `${result.japanese}\n${result.reading}` : result.japanese
                          )
                        }
                      >
                        {copied === "both" ? "Copied both" : "Copy both"}
                      </button>
                    </div>
                  </div>
                  {ttsSupported && (
                    <div>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">Listen</p>
                      <div className={actionGrid}>
                        <button
                          type="button"
                          className={`${btnGhost} w-full`}
                          disabled={speaking !== null}
                          aria-label="Speak Japanese translation"
                          onClick={() => speakLine(result.japanese, "japanese")}
                        >
                          {speaking === "japanese" ? "Playing…" : "Speak Japanese"}
                        </button>
                        {result.reading ? (
                          <button
                            type="button"
                            className={`${btnGhost} w-full`}
                            disabled={speaking !== null}
                            aria-label="Speak hiragana reading"
                            onClick={() => speakLine(result.reading!, "reading")}
                          >
                            {speaking === "reading" ? "Playing…" : "Speak reading"}
                          </button>
                        ) : null}
                        {speaking !== null ? (
                          <button type="button" className={`${btnStopSpeak} w-full`} onClick={stopSpeak}>
                            Stop
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                        Speech uses your browser’s text-to-speech. For clearer audio, add a Japanese voice in your system
                        or browser settings.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={`${cardShell}`}>
        <div className={gradientBar} aria-hidden />
        <div className="flex flex-col gap-4 border-b border-pink-50/90 bg-white/90 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h3 className="text-sm font-bold text-neutral-900">Recent translations</h3>
            <p className="text-xs text-neutral-500">Stored in this browser only · tap to reload into the editor</p>
          </div>
        </div>
        <div className="p-5 sm:p-6">
          {history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-pink-100 bg-pink-50/20 px-4 py-10 text-center text-sm text-neutral-600">
              <p className="font-medium text-neutral-800">No history yet</p>
              <p className="mt-2 text-xs leading-relaxed text-neutral-500">
                Try translating: {tips.slice(0, 2).join(" · ")}.
              </p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {history.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => applyHistory(h)}
                    className="flex w-full flex-col gap-2 rounded-2xl border border-pink-100/90 bg-gradient-to-br from-white to-rose-50/30 p-4 text-left shadow-sm transition hover:border-pink-200 hover:shadow-md"
                  >
                    <span className="line-clamp-2 text-xs text-neutral-500">{h.source}</span>
                    <span className={`line-clamp-2 text-sm font-semibold text-pink-950 ${jpFontClass}`}>
                      {h.japanese}
                    </span>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-pink-400">
                      {h.tone} · {new Date(h.at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-pink-100/80 bg-pink-50/25 px-5 py-4 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-pink-700/80">Ideas</p>
        <ul className="mt-2 grid gap-2 text-sm text-neutral-700 sm:grid-cols-2">
          {tips.map((tip) => (
            <li key={tip} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pink-400" aria-hidden />
              {tip}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
