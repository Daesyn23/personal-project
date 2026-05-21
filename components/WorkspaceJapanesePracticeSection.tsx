"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HeadingWithInfo } from "@/components/InfoTip";
import {
  isBrowserSpeechInputSupported,
  startUtteranceRecognition,
  type SpeechInputLang,
} from "@/lib/browser-speech-input";
import {
  detectUtteranceLanguage,
  detectedLanguageLabel,
  detectedLanguageToSpeechLang,
  inferListenSpeechLang,
  shouldSpeakAsJapanese,
  type DetectedLanguage,
} from "@/lib/detect-utterance-language";
import type { JlptPracticeLevel } from "@/lib/japanese-practice-prompt";
import {
  cancelSpeechSynthesis,
  speakEnglishLine,
  speakJapaneseLine,
} from "@/lib/japanese-tts";
import { useSpeechActivationHandlers } from "@/lib/useSpeechActivationHandlers";

const STORAGE_KEY = "workspace-japanese-practice-v1";
const MAX_INPUT = 4000;
const LISTEN_AFTER_SPEAK_MS = 500;

const jpFontClass =
  "[font-family:ui-sans-serif,'Hiragino_Sans','Hiragino_Kaku_Gothic_ProN','Yu_Gothic_UI','Yu_Gothic',Meiryo,sans-serif]";

const proseEnglish = "font-[family-name:ui-serif,Georgia,Cambria,'Times_New_Roman',serif]";

const panelBase =
  "rounded-xl border border-stone-200/90 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04),0_8px_28px_rgba(15,23,42,0.06)]";

const btnPrimary =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-8 text-sm font-bold text-white shadow-md shadow-pink-300/35 transition hover:brightness-[1.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45";

const btnGhost =
  "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-800 shadow-sm transition hover:border-pink-300 hover:bg-pink-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/50 disabled:opacity-40";

type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type StoredState = {
  messages: ChatMessage[];
  jlptLevel: JlptPracticeLevel;
  autoSpeak: boolean;
};

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadStored(): StoredState {
  const fallback: StoredState = {
    messages: [],
    jlptLevel: "N5",
    autoSpeak: true,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<StoredState>;
    const messages: ChatMessage[] = [];
    if (Array.isArray(p.messages)) {
      for (const row of p.messages) {
        if (!row || typeof row !== "object") continue;
        const role = (row as { role?: unknown }).role;
        const content = (row as { content?: unknown }).content;
        if (role !== "user" && role !== "assistant") continue;
        if (typeof content !== "string" || !content.trim()) continue;
        messages.push({
          id: typeof (row as { id?: unknown }).id === "string" ? (row as { id: string }).id : id(),
          role,
          content: content.trim(),
        });
      }
    }
    return {
      messages: messages.slice(-30),
      jlptLevel: p.jlptLevel === "N4" ? "N4" : "N5",
      autoSpeak: p.autoSpeak !== false,
    };
  } catch {
    return fallback;
  }
}

function saveStored(state: StoredState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function phaseLabel(
  phase: VoicePhase,
  voiceSession: boolean,
  interim: string,
  detected: DetectedLanguage
): string {
  if (!voiceSession) return "Tap Start — speak Japanese, English, or Tagalog anytime.";
  const langNote =
    detected !== "unknown" ? ` (${detectedLanguageLabel(detected)} detected)` : "";
  switch (phase) {
    case "listening":
      return interim
        ? `Hearing you…${langNote}`
        : `Listening — any language, pause when done.${langNote}`;
    case "thinking":
      return "Tutor is thinking…";
    case "speaking":
      return "Tutor is speaking…";
    default:
      return "Ready — just start speaking.";
  }
}

export function WorkspaceJapanesePracticeSection() {
  const initial = loadStored();
  const [openAiReady, setOpenAiReady] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [jlptLevel, setJlptLevel] = useState<JlptPracticeLevel>(initial.jlptLevel);
  const [autoSpeak, setAutoSpeak] = useState(initial.autoSpeak);
  const [detectedLang, setDetectedLang] = useState<DetectedLanguage>("unknown");
  const [voiceSession, setVoiceSession] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [interim, setInterim] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [sttSupported, setSttSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [showTextFallback, setShowTextFallback] = useState(false);
  const [draft, setDraft] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<ReturnType<typeof startUtteranceRecognition> | null>(null);
  const listenRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceSessionRef = useRef(voiceSession);
  const loadingRef = useRef(loading);
  const messagesRef = useRef(messages);
  const jlptLevelRef = useRef(jlptLevel);
  const autoSpeakRef = useRef(autoSpeak);
  const ttsSupportedRef = useRef(ttsSupported);
  const listenLangRef = useRef<SpeechInputLang>("ja-JP");

  voiceSessionRef.current = voiceSession;
  loadingRef.current = loading;
  messagesRef.current = messages;
  jlptLevelRef.current = jlptLevel;
  autoSpeakRef.current = autoSpeak;
  ttsSupportedRef.current = ttsSupported;

  useEffect(() => {
    setSttSupported(isBrowserSpeechInputSupported());
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      setTtsSupported(true);
      ttsSupportedRef.current = true;
      const synth = window.speechSynthesis;
      const refresh = () => synth.getVoices();
      refresh();
      synth.addEventListener("voiceschanged", refresh);
      return () => synth.removeEventListener("voiceschanged", refresh);
    }
  }, []);

  useEffect(() => {
    saveStored({ messages, jlptLevel, autoSpeak });
  }, [messages, jlptLevel, autoSpeak]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/japanese/practice-chat");
        const data = (await res.json()) as { configured?: boolean };
        if (!cancelled) setOpenAiReady(Boolean(data.configured));
      } catch {
        if (!cancelled) setOpenAiReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, interim, phase]);

  const clearListenRestartTimer = useCallback(() => {
    if (listenRestartTimerRef.current) {
      clearTimeout(listenRestartTimerRef.current);
      listenRestartTimerRef.current = null;
    }
  }, []);

  const abortListening = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setInterim("");
  }, []);

  const stopSpeak = useCallback(() => {
    cancelSpeechSynthesis();
    setSpeakingId(null);
    if (phase === "speaking") setPhase("idle");
  }, [phase]);

  const scheduleListenAfterReply = useCallback(() => {
    clearListenRestartTimer();
    if (!voiceSessionRef.current || loadingRef.current) return;
    listenRestartTimerRef.current = setTimeout(() => {
      listenRestartTimerRef.current = null;
      if (voiceSessionRef.current && !loadingRef.current) {
        beginListeningRef.current?.();
      }
    }, LISTEN_AFTER_SPEAK_MS);
  }, [clearListenRestartTimer]);

  const speakMessage = useCallback(
    (messageId: string, text: string, onDone?: () => void) => {
      if (!text.trim() || typeof window === "undefined" || !window.speechSynthesis) {
        onDone?.();
        return;
      }
      setPhase("speaking");
      setError(null);
      const useJapanese = shouldSpeakAsJapanese(text);
      const callbacks = {
        onEnd: () => {
          setSpeakingId(null);
          setPhase("idle");
          onDone?.();
        },
        onError: (code?: string) => {
          setSpeakingId(null);
          setPhase("idle");
          if (code === "not-allowed") {
            setError("Speech was blocked. Allow sound for this site, then try again.");
          }
          onDone?.();
        },
      };
      if (useJapanese) speakJapaneseLine(text, "japanese", callbacks);
      else speakEnglishLine(text, callbacks);
      setSpeakingId(messageId);
    },
    []
  );

  const beginListeningRef = useRef<(() => void) | null>(null);

  const beginListening = useCallback(() => {
    if (!sttSupported || !voiceSessionRef.current || loadingRef.current) return;
    abortListening();
    setPhase("listening");
    setError(null);

    const lang = inferListenSpeechLang({
      messages: messagesRef.current,
    });
    listenLangRef.current = lang;

    let utteranceHandled = false;
    const session = startUtteranceRecognition({
      lang,
      silenceMs: 1400,
      onListening: () => setPhase("listening"),
      onInterim: (text) => {
        setInterim(text);
        const live = detectUtteranceLanguage(text);
        if (live !== "unknown") setDetectedLang(live);
      },
      onUtteranceComplete: (text) => {
        utteranceHandled = true;
        const detected = detectUtteranceLanguage(text);
        setDetectedLang(detected);
        listenLangRef.current = detectedLanguageToSpeechLang(detected, text);
        setInterim("");
        recognitionRef.current = null;
        void sendToApiRef.current?.(text);
      },
      onError: (code) => {
        recognitionRef.current = null;
        setPhase("idle");
        if (code === "not-allowed") {
          setError("Microphone blocked. Allow mic access, then start again.");
          setVoiceSession(false);
          return;
        }
        if (code !== "aborted" && voiceSessionRef.current) {
          scheduleListenAfterReply();
        }
      },
      onEnd: () => {
        recognitionRef.current = null;
        if (!utteranceHandled && voiceSessionRef.current && !loadingRef.current) {
          scheduleListenAfterReply();
        }
      },
    });

    if (!session) {
      setError("Speech recognition could not start.");
      setVoiceSession(false);
      setPhase("idle");
      return;
    }
    recognitionRef.current = session;
  }, [sttSupported, abortListening, scheduleListenAfterReply]);

  beginListeningRef.current = beginListening;

  const sendToApiRef = useRef<((userText: string) => Promise<void>) | null>(null);

  const sendToApi = useCallback(
    async (userText: string) => {
      const t = userText.trim();
      if (!t || loadingRef.current) return;
      if (t.length > MAX_INPUT) {
        setError(`Keep messages under ${MAX_INPUT.toLocaleString()} characters.`);
        if (voiceSessionRef.current) scheduleListenAfterReply();
        return;
      }

      abortListening();
      clearListenRestartTimer();
      stopSpeak();

      const detected = detectUtteranceLanguage(t);
      setDetectedLang(detected);

      const userMsg: ChatMessage = { id: id(), role: "user", content: t };
      const history = [...messagesRef.current, userMsg];
      setMessages(history);
      listenLangRef.current = detectedLanguageToSpeechLang(detected, t);
      setDraft("");
      setLoading(true);
      loadingRef.current = true;
      setPhase("thinking");
      setError(null);

      try {
        const res = await fetch("/api/japanese/practice-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jlptLevel: jlptLevelRef.current,
            messages: history.map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        const data = (await res.json()) as {
          text?: string;
          error?: string;
          detectedLanguage?: DetectedLanguage;
        };
        if (!res.ok) throw new Error(data.error || "Practice chat failed.");
        const reply = (data.text ?? "").trim();
        if (!reply) throw new Error("Empty response from tutor.");
        const replyDetected = detectUtteranceLanguage(reply);
        setDetectedLang(replyDetected);
        const assistantMsg: ChatMessage = { id: id(), role: "assistant", content: reply };
        setMessages((prev) => [...prev, assistantMsg]);

        const afterReply = () => {
          if (voiceSessionRef.current) scheduleListenAfterReply();
        };

        if (autoSpeakRef.current && ttsSupportedRef.current) {
          speakMessage(assistantMsg.id, reply, afterReply);
        } else {
          setPhase("idle");
          afterReply();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setPhase("idle");
        if (voiceSessionRef.current) scheduleListenAfterReply();
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [
      abortListening,
      clearListenRestartTimer,
      stopSpeak,
      speakMessage,
      scheduleListenAfterReply,
    ]
  );

  sendToApiRef.current = sendToApi;

  const startVoiceSession = useSpeechActivationHandlers(() => {
    if (!sttSupported || openAiReady === false) return;
    setVoiceSession(true);
    setError(null);
    beginListening();
  });

  const stopVoiceSession = useCallback(() => {
    setVoiceSession(false);
    clearListenRestartTimer();
    abortListening();
    stopSpeak();
    setPhase("idle");
    setInterim("");
  }, [clearListenRestartTimer, abortListening, stopSpeak]);

  const clearChat = useCallback(() => {
    stopVoiceSession();
    setMessages([]);
    setDraft("");
    setError(null);
  }, [stopVoiceSession]);

  useEffect(() => {
    return () => {
      clearListenRestartTimer();
      recognitionRef.current?.abort();
      cancelSpeechSynthesis();
    };
  }, [clearListenRestartTimer]);

  const statusText = phaseLabel(phase, voiceSession, interim, detectedLang);

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl space-y-6">
      <header className="border-l-4 border-pink-500 bg-gradient-to-r from-rose-50/80 via-stone-50/90 to-pink-50/50 px-4 py-5 sm:px-7 sm:py-7">
        <span className="inline-flex rounded border border-pink-200 bg-pink-50/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-pink-800">
          JLPT N5 · N4 · Voice
        </span>
        <HeadingWithInfo
          className="mt-3"
          infoLabel="Japanese practice"
          heading={
            <h2 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">Japanese practice</h2>
          }
        >
          <p className={proseEnglish}>
            Hands-free voice conversation. Speak in Japanese, English, or Tagalog — language is detected automatically.
            Pause when done; the tutor replies and listens again like a real chat.
          </p>
        </HeadingWithInfo>
        {openAiReady === false && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm text-amber-950">
            Add <code className="rounded bg-amber-100 px-1">OPENAI_API_KEY</code> to{" "}
            <code className="rounded bg-amber-100 px-1">.env.local</code>, restart{" "}
            <code className="rounded bg-amber-100 px-1">npm run dev</code>, then refresh.
          </p>
        )}
        {!sttSupported && (
          <p className="mt-3 text-sm text-stone-600">
            Voice mode needs Chrome or Edge. Use the text fallback below if needed.
          </p>
        )}
      </header>

      <section className={`${panelBase} flex flex-col overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-gradient-to-r from-pink-50/70 to-stone-100/50 px-4 py-3 sm:px-5">
          <span className="text-xs font-bold text-stone-700">Level</span>
          {(["N5", "N4"] as const).map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setJlptLevel(lvl)}
              disabled={loading || voiceSession}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                jlptLevel === lvl
                  ? "bg-pink-600 text-white shadow-sm"
                  : "border border-stone-300 bg-white text-stone-700 hover:border-pink-300"
              }`}
            >
              {lvl}
            </button>
          ))}
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-pink-200 bg-pink-50/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-pink-800">
            Auto language
            {voiceSession && detectedLang !== "unknown" && (
              <span className="normal-case tracking-normal text-pink-600">
                · {detectedLanguageLabel(detectedLang)}
              </span>
            )}
          </span>
        </div>

        {/* Voice-first control */}
        <div className="flex flex-col items-center border-b border-stone-100 px-4 py-8 sm:py-10">
          <div
            className={`relative flex h-36 w-36 items-center justify-center rounded-full border-4 transition-all duration-500 sm:h-40 sm:w-40 ${
              phase === "listening"
                ? "border-rose-400 bg-gradient-to-br from-rose-100 to-pink-200 shadow-[0_0_40px_rgba(244,63,94,0.35)]"
                : phase === "thinking"
                  ? "border-amber-300 bg-gradient-to-br from-amber-50 to-orange-100"
                  : phase === "speaking"
                    ? "border-pink-500 bg-gradient-to-br from-pink-100 to-rose-200 shadow-[0_0_32px_rgba(236,72,153,0.3)]"
                    : "border-pink-200 bg-gradient-to-br from-stone-50 to-pink-50"
            } ${phase === "listening" ? "animate-pulse" : ""}`}
            aria-hidden
          >
            <span className="text-4xl sm:text-5xl">
              {phase === "listening" ? "🎙️" : phase === "thinking" ? "💭" : phase === "speaking" ? "🔊" : "🗣️"}
            </span>
            {phase === "listening" && (
              <span className="absolute inset-0 rounded-full border-2 border-rose-400/60 animate-ping" />
            )}
          </div>

          <p className="mt-5 max-w-md text-center text-sm font-semibold text-stone-800 sm:text-base" aria-live="polite">
            {statusText}
          </p>

          {interim && voiceSession && (
            <p
              className={`mt-3 max-w-lg text-center text-sm italic text-pink-800 ${jpFontClass}`}
              aria-live="polite"
            >
              “{interim}”
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {voiceSession ? (
              <button type="button" onClick={stopVoiceSession} className={btnGhost}>
                End conversation
              </button>
            ) : (
              <button
                type="button"
                disabled={!sttSupported || openAiReady === false}
                className={btnPrimary}
                {...startVoiceSession}
              >
                Start voice conversation
              </button>
            )}
            {speakingId && (
              <button type="button" onClick={stopSpeak} className={btnGhost}>
                Stop speaking
              </button>
            )}
          </div>

          <p className="mt-3 text-center text-xs text-stone-500">
            Pause ~1.5s when finished — no button tap needed. Language and mic are automatic; the tutor listens again
            after speaking.
            {voiceSession && detectedLang !== "unknown" && (
              <span className="mt-1 block font-medium text-pink-700/90">
                Detected {detectedLanguageLabel(detectedLang)} · mic tuned for next turn
              </span>
            )}
          </p>
        </div>

        {/* Transcript */}
        <div className="min-h-[160px] max-h-[280px] space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
          {messages.length === 0 && !loading && (
            <p className="text-center text-xs text-stone-400">Transcript appears here as you talk.</p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-pink-600/90 text-white"
                    : "border border-stone-200 bg-stone-50/90 text-stone-800"
                } ${m.role === "assistant" ? jpFontClass : ""}`}
              >
                <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide opacity-70">
                  {m.role === "user" ? "You" : "Tutor"}
                </span>
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-500">
                Tutor is thinking…
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Optional text fallback */}
        <div className="border-t border-stone-200 bg-stone-50/80 px-4 py-3 sm:px-5">
          {error && (
            <p className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => setShowTextFallback((v) => !v)}
            className="text-xs font-semibold text-pink-800 underline decoration-pink-300/80 hover:text-pink-950"
          >
            {showTextFallback ? "Hide text input" : "Type instead (optional)"}
          </button>

          {showTextFallback && (
            <div className="mt-3 flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendToApi(draft);
                  }
                }}
                rows={2}
                placeholder="Type a message…"
                disabled={loading || openAiReady === false}
                className={`min-h-[48px] flex-1 resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-300/40 disabled:opacity-50 ${jpFontClass}`}
              />
              <button
                type="button"
                onClick={() => void sendToApi(draft)}
                disabled={loading || !draft.trim() || openAiReady === false}
                className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg bg-pink-600 px-4 text-sm font-bold text-white disabled:opacity-45"
              >
                Send
              </button>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={clearChat} disabled={loading} className={btnGhost}>
              Clear transcript
            </button>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-stone-600">
              <input
                type="checkbox"
                checked={autoSpeak}
                onChange={(e) => setAutoSpeak(e.target.checked)}
                className="rounded border-stone-300 text-pink-600 focus:ring-pink-400"
              />
              Speak tutor replies
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
