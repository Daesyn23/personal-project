"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelSpeechSynthesis,
  speakEnglishLine,
  speakJapaneseLine,
} from "@/lib/japanese-tts";
import {
  loadDirection,
  loadHistory,
  MAX_SOURCE,
  runTranslation,
  saveDirection,
  saveHistory,
  type HistoryRow,
  type Tone,
  type TranslateDirection,
  type TranslateResult,
} from "@/lib/workspace-translation";

export function useWorkspaceTranslation() {
  const [geminiReady, setGeminiReady] = useState<boolean | null>(null);
  const [source, setSource] = useState("");
  const [context, setContext] = useState("");
  const [direction, setDirectionState] = useState<TranslateDirection>(() => loadDirection());
  const [tone, setTone] = useState<Tone>("neutral");
  const [includeReading, setIncludeReading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState<"japanese" | "reading" | "english" | null>(null);
  const [ttsSupported, setTtsSupported] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setTtsSupported(true);
    const synth = window.speechSynthesis;
    const refresh = () => synth.getVoices();
    refresh();
    synth.addEventListener("voiceschanged", refresh);
    return () => synth.removeEventListener("voiceschanged", refresh);
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

  const pickDirection = useCallback((d: TranslateDirection) => {
    setDirectionState(d);
    saveDirection(d);
    cancelSpeechSynthesis();
    setSpeaking(null);
    setResult(null);
    setError(null);
  }, []);

  const pushHistory = useCallback((row: Omit<HistoryRow, "id" | "at">) => {
    const entry: HistoryRow = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      at: Date.now(),
      direction: row.direction,
      source: row.source,
      translation: row.translation,
      reading: row.reading,
      tone: row.tone,
    };
    setHistory((prev) => {
      const next = [
        entry,
        ...prev.filter(
          (h) =>
            h.source !== entry.source ||
            h.translation !== entry.translation ||
            h.direction !== entry.direction
        ),
      ].slice(0, 24);
      saveHistory(next);
      return next;
    });
  }, []);

  const translate = useCallback(async () => {
    const t = source.trim();
    if (!t) {
      setError(
        direction === "en-ja"
          ? "Type or paste English above, then translate."
          : "Type or paste Japanese above, then translate."
      );
      return;
    }
    if (t.length > MAX_SOURCE) {
      setError(`Shorten the text to ${MAX_SOURCE} characters or fewer.`);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    cancelSpeechSynthesis();
    setSpeaking(null);
    try {
      const next = await runTranslation({
        direction,
        text: t,
        tone,
        includeReading,
        context: context.trim() || undefined,
      });
      setResult(next);
      if (next.direction === "en-ja") {
        pushHistory({
          direction: "en-ja",
          source: t,
          translation: next.japanese,
          reading: next.reading,
          tone,
        });
      } else {
        pushHistory({
          direction: "ja-en",
          source: t,
          translation: next.english,
          reading: null,
          tone,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [source, tone, includeReading, context, pushHistory, direction]);

  const copyText = useCallback(async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not copy to the clipboard.");
    }
  }, []);

  const clearAll = useCallback(() => {
    cancelSpeechSynthesis();
    setSpeaking(null);
    setSource("");
    setContext("");
    setResult(null);
    setError(null);
  }, []);

  const stopSpeak = useCallback(() => {
    cancelSpeechSynthesis();
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
    speakJapaneseLine(trimmed, kind, {
      onEnd: () => setSpeaking(null),
      onError: (code) => {
        setSpeaking(null);
        if (code === "not-allowed") {
          setError("Speech was blocked. Allow sound for this site, then try again.");
          return;
        }
        setError("Could not play speech. Check volume or add a Japanese voice.");
      },
    });
    setSpeaking(kind);
  }, []);

  const speakEnglish = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setError("Speech is not supported in this browser.");
      return;
    }
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    setError(null);
    speakEnglishLine(trimmed, {
      onEnd: () => setSpeaking(null),
      onError: (code) => {
        setSpeaking(null);
        if (code === "not-allowed") {
          setError("Speech was blocked. Allow sound for this site, then try again.");
          return;
        }
        setError("Could not play speech.");
      },
    });
    setSpeaking("english");
  }, []);

  const applyHistory = useCallback((h: HistoryRow) => {
    cancelSpeechSynthesis();
    setSpeaking(null);
    setDirectionState(h.direction);
    saveDirection(h.direction);
    setSource(h.source);
    setTone(h.tone);
    if (h.direction === "en-ja") {
      setResult({
        direction: "en-ja",
        japanese: h.translation,
        reading: h.reading,
        nuance: null,
      });
    } else {
      setResult({
        direction: "ja-en",
        english: h.translation,
        nuance: null,
      });
    }
    setError(null);
    areaRef.current?.focus();
  }, []);

  return {
    geminiReady,
    source,
    setSource,
    context,
    setContext,
    direction,
    pickDirection,
    tone,
    setTone,
    includeReading,
    setIncludeReading,
    loading,
    error,
    setError,
    result,
    history,
    copied,
    speaking,
    ttsSupported,
    areaRef,
    translate,
    copyText,
    clearAll,
    stopSpeak,
    speakLine,
    speakEnglish,
    applyHistory,
    charCount: source.length,
    overLimit: source.length > MAX_SOURCE,
  };
}
