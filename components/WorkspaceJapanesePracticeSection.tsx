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
  type DetectedLanguage,
} from "@/lib/detect-utterance-language";
import { VoiceActivityVisualizer } from "@/components/VoiceActivityVisualizer";
import { TUTOR_NAME, type JlptPracticeLevel } from "@/lib/japanese-practice-prompt";
import {
  cancelPracticeVoicePlayback,
  speakTutorLinePreferOpenAi,
} from "@/lib/practice-voice-playback";
import { acquirePracticeMic, type PracticeMicSession } from "@/lib/practice-mic";
import { startVoiceLevelMonitor } from "@/lib/voice-level-monitor";

const STORAGE_KEY = "workspace-japanese-practice-v1";
const MAX_INPUT = 4000;
const LISTEN_AFTER_SPEAK_MS = 120;
const MAX_CONTEXT_TURNS = 10;

const jpFontClass =
  "[font-family:ui-sans-serif,'Hiragino_Sans','Hiragino_Kaku_Gothic_ProN','Yu_Gothic_UI','Yu_Gothic',Meiryo,sans-serif]";

const proseEnglish = "font-[family-name:ui-serif,Georgia,Cambria,'Times_New_Roman',serif]";

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

function PhasePill({ phase }: { phase: VoicePhase }) {
  const config: Record<VoicePhase, { dot: string; bg: string; text: string; label: string }> = {
    idle: { dot: "bg-stone-400", bg: "bg-stone-50", text: "text-stone-600", label: "Ready" },
    listening: { dot: "bg-rose-500 animate-pulse", bg: "bg-rose-50", text: "text-rose-800", label: "Listening" },
    thinking: { dot: "bg-amber-500 animate-pulse", bg: "bg-amber-50", text: "text-amber-900", label: "Thinking" },
    speaking: { dot: "bg-pink-500 animate-pulse", bg: "bg-pink-50", text: "text-pink-800", label: "Speaking" },
  };
  const c = config[phase];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${c.bg} ${c.text}`}
    >
      <span className={`h-2 w-2 rounded-full ${c.dot}`} aria-hidden />
      {c.label}
    </span>
  );
}

function phaseHeadline(
  phase: VoicePhase,
  voiceSession: boolean,
  interim: string,
  detected: DetectedLanguage,
  speechActive: boolean
): string {
  if (!voiceSession) return "Tap the circle to start";
  if (phase === "thinking") return `${TUTOR_NAME} is replying…`;
  if (phase === "speaking") return `Listen to ${TUTOR_NAME}`;
  if (interim) return "Got it…";
  if (phase === "listening") {
    if (speechActive) return "Keep going — pause 1s when done";
    const lang =
      detected !== "unknown" ? ` · ${detectedLanguageLabel(detected)}` : "";
    return `Speak now${lang}`;
  }
  return "Conversation active";
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
  const [showTranscript, setShowTranscript] = useState(false);
  const [draft, setDraft] = useState("");
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [speechPulse, setSpeechPulse] = useState(0);
  const [speechDetected, setSpeechDetected] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const practiceMicRef = useRef<PracticeMicSession | null>(null);
  const voiceMonitorRef = useRef<{ stop: () => void } | null>(null);

  const displayLevel = Math.max(voiceLevel, speechPulse);

  const bumpSpeechActivity = useCallback(() => {
    setSpeechDetected(true);
    setSpeechPulse(1);
    setError(null);
  }, []);
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
    if (!showTranscript) return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, interim, phase, showTranscript]);

  useEffect(() => {
    if (phase !== "listening") {
      setSpeechPulse(0);
      return;
    }
    const id = window.setInterval(() => {
      setSpeechPulse((p) => Math.max(0, p * 0.86 - 0.015));
    }, 48);
    return () => window.clearInterval(id);
  }, [phase]);

  const clearListenRestartTimer = useCallback(() => {
    if (listenRestartTimerRef.current) {
      clearTimeout(listenRestartTimerRef.current);
      listenRestartTimerRef.current = null;
    }
  }, []);

  const stopPracticeMic = useCallback(() => {
    practiceMicRef.current?.stop();
    practiceMicRef.current = null;
  }, []);

  const stopVoiceMonitor = useCallback(() => {
    voiceMonitorRef.current?.stop();
    voiceMonitorRef.current = null;
    setVoiceLevel(0);
    setSpeechPulse(0);
    setSpeechDetected(false);
  }, []);

  const startVoiceMonitor = useCallback(async (): Promise<boolean> => {
    if (voiceMonitorRef.current) return true;
    const stream = practiceMicRef.current?.stream;
    if (!stream) return false;
    const monitor = await startVoiceLevelMonitor(
      (level) => {
        setVoiceLevel(level);
      },
      { stream, stopTracksOnRelease: false }
    );
    if (!monitor) return false;
    voiceMonitorRef.current = monitor;
    return true;
  }, []);

  const abortListening = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setInterim("");
    setSpeechDetected(false);
  }, []);

  const stopSpeak = useCallback(() => {
    cancelPracticeVoicePlayback();
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

  const speakMessage = useCallback((messageId: string, text: string, onDone?: () => void) => {
    if (!text.trim()) {
      onDone?.();
      return;
    }
    setPhase("speaking");
    setError(null);
    setSpeakingId(messageId);
    void speakTutorLinePreferOpenAi(text, {
      onEnd: () => {
        setSpeakingId(null);
        setPhase("idle");
        onDone?.();
      },
      onError: (code) => {
        setSpeakingId(null);
        setPhase("idle");
        if (code === "not-allowed") {
          setError("Speech was blocked. Allow sound for this site, then try again.");
        }
        onDone?.();
      },
    });
  }, []);

  const beginListeningRef = useRef<(() => void) | null>(null);

  const beginListening = useCallback(() => {
    if (!sttSupported || !voiceSessionRef.current || loadingRef.current) return;
    abortListening();
    setPhase("listening");
    setError(null);

    const inferred = inferListenSpeechLang({
      messages: messagesRef.current,
    });
    const lang: SpeechInputLang = inferred === "fil-PH" ? "en-US" : inferred;
    listenLangRef.current = lang;
    setSpeechDetected(false);

    const session = startUtteranceRecognition({
      lang,
      audioTrack: practiceMicRef.current?.track,
      silenceMs: 1000,
      onListening: () => setPhase("listening"),
      onSpeechActivity: bumpSpeechActivity,
      onInterim: (text) => {
        bumpSpeechActivity();
        setInterim(text);
        const live = detectUtteranceLanguage(text);
        if (live !== "unknown") setDetectedLang(live);
      },
      onUtteranceComplete: (text) => {
        const detected = detectUtteranceLanguage(text);
        setDetectedLang(detected);
        listenLangRef.current = detectedLanguageToSpeechLang(detected, text);
        setInterim("");
        recognitionRef.current = null;
        void sendToApiRef.current?.(text);
      },
      onEmpty: () => {
        setError("Didn't catch that — try speaking a bit louder, then pause.");
        setPhase("listening");
        if (voiceSessionRef.current) scheduleListenAfterReply();
      },
      onError: (code) => {
        recognitionRef.current = null;
        if (code === "not-allowed") {
          setError("Microphone blocked. Allow mic access, then start again.");
          setVoiceSession(false);
          setPhase("idle");
          return;
        }
        if (code !== "aborted" && voiceSessionRef.current && !loadingRef.current) {
          setPhase("listening");
          scheduleListenAfterReply();
        }
      },
      onEnd: () => {
        recognitionRef.current = null;
      },
    });

    if (!session) {
      setError("Speech recognition could not start.");
      setVoiceSession(false);
      setPhase("idle");
      return;
    }
    recognitionRef.current = session;
  }, [sttSupported, abortListening, scheduleListenAfterReply, bumpSpeechActivity]);

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
      const history = [...messagesRef.current, userMsg].slice(-MAX_CONTEXT_TURNS);
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

        setPhase(autoSpeakRef.current && ttsSupportedRef.current ? "speaking" : "idle");
        if (autoSpeakRef.current && ttsSupportedRef.current) {
          speakMessage(assistantMsg.id, reply, afterReply);
        } else {
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

  const stopVoiceSession = useCallback(() => {
    setVoiceSession(false);
    clearListenRestartTimer();
    abortListening();
    stopVoiceMonitor();
    stopPracticeMic();
    stopSpeak();
    setPhase("idle");
    setInterim("");
  }, [clearListenRestartTimer, abortListening, stopVoiceMonitor, stopPracticeMic, stopSpeak]);

  const startVoiceSession = useCallback(async () => {
    if (!sttSupported || openAiReady === false || voiceSession) return;
    setVoiceSession(true);
    setError(null);

    const mic = await acquirePracticeMic();
    if (!mic) {
      setVoiceSession(false);
      setError("Microphone unavailable. Allow mic access and try again.");
      return;
    }
    practiceMicRef.current = mic;

    const monitorOk = await startVoiceMonitor();
    if (!monitorOk) {
      setError(
        "Mic is open with noise cancellation, but level meters could not start. Speech should still work."
      );
    }
    beginListening();
  }, [sttSupported, openAiReady, voiceSession, beginListening, startVoiceMonitor]);

  const toggleVoiceSession = useCallback(() => {
    if (voiceSession) stopVoiceSession();
    else void startVoiceSession();
  }, [voiceSession, stopVoiceSession, startVoiceSession]);

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
      stopVoiceMonitor();
      stopPracticeMic();
      cancelPracticeVoicePlayback();
    };
  }, [clearListenRestartTimer, stopVoiceMonitor, stopPracticeMic]);

  const speechActive = speechDetected || displayLevel > 0.03 || interim.length > 0;
  const headline = phaseHeadline(phase, voiceSession, interim, detectedLang, speechActive);

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl space-y-5">
      <header className="overflow-hidden rounded-2xl border border-pink-100/80 bg-gradient-to-br from-rose-50 via-white to-pink-50/80 px-5 py-6 shadow-sm sm:px-8">
        <div className="flex flex-wrap items-start gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 text-lg font-bold text-white shadow-md shadow-pink-300/40"
            aria-hidden
          >
            {TUTOR_NAME.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <span className="inline-flex rounded-full bg-pink-100/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-pink-800">
              JLPT N5 · N4
            </span>
            <HeadingWithInfo
              className="mt-2"
              infoLabel="Japanese practice"
              heading={
                <h2 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                  Practice with {TUTOR_NAME}
                </h2>
              }
            >
              <p className={proseEnglish}>
                Hands-free voice chat — one tap, then talk. {TUTOR_NAME} uses the same natural voice in Japanese,
                English, or Tagalog.
              </p>
            </HeadingWithInfo>
          </div>
        </div>
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

      <section className="flex flex-col overflow-hidden rounded-2xl border border-stone-200/70 bg-white shadow-[0_8px_32px_rgba(15,23,42,0.07)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 sm:px-5">
          <div
            className="inline-flex rounded-full bg-stone-100/90 p-1 ring-1 ring-stone-200/80"
            role="group"
            aria-label="JLPT level"
          >
            {(["N5", "N4"] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setJlptLevel(lvl)}
                disabled={loading || voiceSession}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                  jlptLevel === lvl
                    ? "bg-white text-pink-700 shadow-sm ring-1 ring-pink-100"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
          {voiceSession && <PhasePill phase={phase} />}
        </div>

        <div className="relative bg-gradient-to-b from-rose-50/50 via-white to-white px-4 py-6 sm:px-6 sm:py-8">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(251,113,133,0.12),transparent)]"
            aria-hidden
          />

          <div className="relative mx-auto w-full max-w-md rounded-3xl border border-pink-100/90 bg-white/90 px-5 py-8 shadow-[0_2px_20px_rgba(244,63,94,0.08)] backdrop-blur-sm sm:px-8 sm:py-10">
            <p
              className="text-center text-lg font-semibold tracking-tight text-stone-900 sm:text-xl"
              aria-live="polite"
            >
              {headline}
            </p>

            <div className="relative mx-auto mt-8 flex w-fit flex-col items-center">
              <button
                type="button"
                onClick={toggleVoiceSession}
                disabled={!sttSupported || openAiReady === false}
                aria-pressed={voiceSession}
                aria-label={voiceSession ? "End conversation" : "Start conversation"}
                className={`relative flex h-32 w-32 items-center justify-center rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-4 disabled:opacity-45 sm:h-36 sm:w-36 ${
                  phase === "listening"
                    ? "bg-gradient-to-br from-rose-400 to-pink-500 shadow-[0_0_0_6px_rgba(255,255,255,0.9),0_0_40px_rgba(244,63,94,0.45)]"
                    : phase === "thinking"
                      ? "bg-gradient-to-br from-amber-300 to-orange-400 shadow-[0_0_32px_rgba(251,191,36,0.35)]"
                      : phase === "speaking"
                        ? "bg-gradient-to-br from-pink-400 to-rose-500 shadow-[0_0_40px_rgba(236,72,153,0.4)]"
                        : "bg-gradient-to-br from-pink-300 to-rose-400 shadow-lg hover:scale-[1.02] hover:shadow-xl"
                } ${phase === "listening" && speechActive ? "scale-[1.03]" : ""}`}
              >
                <span className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-white text-3xl font-bold text-pink-600 shadow-inner sm:h-20 sm:w-20">
                  {TUTOR_NAME.slice(0, 1)}
                </span>
                {phase === "listening" && !speechActive && (
                  <span
                    className="absolute inset-0 rounded-full ring-2 ring-white/40 ring-offset-2 ring-offset-transparent animate-ping"
                    aria-hidden
                  />
                )}
              </button>

              <div
                className={`mt-6 w-full min-w-[220px] rounded-2xl px-4 py-3 transition-colors ${
                  speechActive
                    ? "bg-rose-50 ring-1 ring-rose-200"
                    : voiceSession && phase === "listening"
                      ? "bg-stone-50 ring-1 ring-stone-100"
                      : "bg-transparent"
                }`}
              >
                <VoiceActivityVisualizer
                  phase={phase}
                  level={displayLevel}
                  speechDetected={speechDetected || interim.length > 0}
                />
                {voiceSession && phase === "listening" && (
                  <p
                    className={`mt-2 text-center text-[11px] font-medium ${
                      speechActive ? "text-rose-600" : "text-stone-400"
                    }`}
                  >
                    {speechActive ? "Voice detected" : "Waiting for you…"}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              {voiceSession ? (
                <>
                  <button
                    type="button"
                    onClick={stopVoiceSession}
                    className="min-w-[10rem] rounded-xl border border-stone-200 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-rose-200 hover:bg-rose-50"
                  >
                    End conversation
                  </button>
                  {speakingId && (
                    <button type="button" onClick={stopSpeak} className={btnGhost}>
                      Stop audio
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  disabled={!sttSupported || openAiReady === false}
                  className={`${btnPrimary} min-w-[12rem]`}
                  onClick={() => void startVoiceSession()}
                >
                  Start talking
                </button>
              )}
            </div>
          </div>

          <p className="mx-auto mt-5 max-w-md text-center text-xs leading-relaxed text-stone-500">
            {voiceSession
              ? `Hands-free — pause 1 second when you finish. ${TUTOR_NAME} listens again after she speaks.`
              : "Japanese, English, or Tagalog. One tap, no holding buttons."}
          </p>
        </div>

        <div className="border-t border-stone-100 bg-stone-50/50">
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            aria-expanded={showTranscript}
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-stone-100/80 sm:px-5"
          >
            <span className="text-sm font-semibold text-stone-800">
              Transcript
              {messages.length > 0 && (
                <span className="ml-2 rounded-full bg-pink-100 px-2 py-0.5 text-xs font-bold text-pink-700">
                  {messages.length}
                </span>
              )}
            </span>
            <span
              className={`text-xs font-semibold ${showTranscript ? "text-stone-500" : "text-pink-600"}`}
              aria-hidden
            >
              {showTranscript ? "▲ Collapse" : "▼ Expand"}
            </span>
          </button>
          {showTranscript && (
            <div className="max-h-[280px] min-h-[80px] space-y-3 overflow-y-auto border-t border-stone-100 px-4 py-4 sm:px-5">
              {messages.length === 0 && !loading && (
                <p className="text-center text-xs text-stone-400">Your conversation will appear here.</p>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      m.role === "user"
                        ? "bg-pink-600 text-white"
                        : "bg-gradient-to-br from-pink-500 to-rose-600 text-white"
                    }`}
                    aria-hidden
                  >
                    {m.role === "user" ? "Y" : TUTOR_NAME.slice(0, 1)}
                  </div>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                      m.role === "user"
                        ? "rounded-tr-md bg-gradient-to-br from-pink-600 to-rose-600 text-white"
                        : "rounded-tl-md border border-stone-100 bg-white text-stone-800"
                    } ${m.role === "assistant" ? jpFontClass : ""}`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-rose-600 text-xs font-bold text-white">
                    {TUTOR_NAME.slice(0, 1)}
                  </div>
                  <div className="rounded-2xl rounded-tl-md border border-amber-100 bg-amber-50/90 px-4 py-3 shadow-sm">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-amber-400 [animation-delay:0ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-amber-400 [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-amber-400 [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        <div className="border-t border-stone-100 bg-white px-4 py-4 sm:px-5">
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
              {TUTOR_NAME}&apos;s voice (natural)
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
