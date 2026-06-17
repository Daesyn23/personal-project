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
import {
  TUTOR_NAME,
  type JlptPracticeLevel,
  type PracticeSpeechRegister,
} from "@/lib/japanese-practice-prompt";
import {
  cancelPracticeSpeakQueue,
  enqueuePracticeSpeech,
  practiceSpeakQueueActive,
  setPracticeSpeakRegister,
} from "@/lib/practice-speak-queue";
import { streamPracticeChat } from "@/lib/practice-stream-client";
import {
  displayTranscriptLine,
  fetchKanaReadings,
  lineNeedsKanaReading,
  type PracticeTranscriptScript,
} from "@/lib/practice-transcript-display";
import {
  cancelPracticeVoicePlayback,
  clearPracticeTtsPrefetch,
  prefetchTutorLine,
  speakTutorLinePreferOpenAi,
} from "@/lib/practice-voice-playback";
import { acquirePracticeMic, type PracticeMicSession } from "@/lib/practice-mic";
import {
  loadPracticeVoiceSettings,
  type PracticeVoiceSettings,
} from "@/lib/practice-voice-settings";
import { startVoiceLevelMonitor } from "@/lib/voice-level-monitor";
import { PracticeVoiceSettingsPanel } from "@/components/PracticeVoiceSettingsPanel";

const STORAGE_KEY = "workspace-japanese-practice-v1";
const MAX_INPUT = 4000;
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
  speechRegister: PracticeSpeechRegister;
  transcriptScript: PracticeTranscriptScript;
  autoSpeak: boolean;
};

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadStored(): StoredState {
  const fallback: StoredState = {
    messages: [],
    jlptLevel: "N5",
    speechRegister: "polite",
    transcriptScript: "normal",
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
      speechRegister: p.speechRegister === "casual" ? "casual" : "polite",
      transcriptScript: p.transcriptScript === "kana" ? "kana" : "normal",
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
  detected: DetectedLanguage,
  speechActive: boolean,
  phraseIncomplete: boolean,
  micMuted: boolean
): string {
  if (!voiceSession) return "Tap the circle to start";
  if (phase === "thinking") return `${TUTOR_NAME} is replying…`;
  if (phase === "speaking") return `Listen to ${TUTOR_NAME}`;
  if (micMuted) return "Mic off — unmute when you want to talk";
  if (phase === "listening") {
    if (phraseIncomplete && !speechActive) return "Finish your thought — still listening";
    if (speechActive) return "Keep going — take your time";
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
  const [speechRegister, setSpeechRegister] = useState<PracticeSpeechRegister>(
    initial.speechRegister
  );
  const [transcriptScript, setTranscriptScript] = useState<PracticeTranscriptScript>(
    initial.transcriptScript
  );
  const [kanaReadings, setKanaReadings] = useState<Record<string, string>>({});
  const [kanaReadingsLoading, setKanaReadingsLoading] = useState(false);
  const [kanaReadingsError, setKanaReadingsError] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(initial.autoSpeak);
  const [detectedLang, setDetectedLang] = useState<DetectedLanguage>("unknown");
  const [voiceSession, setVoiceSession] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [interim, setInterim] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [sttSupported, setSttSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [showTextFallback, setShowTextFallback] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const showTranscriptRef = useRef(showTranscript);
  const [draft, setDraft] = useState("");
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [speechPulse, setSpeechPulse] = useState(0);
  const [speechDetected, setSpeechDetected] = useState(false);
  const [speechActiveUi, setSpeechActiveUi] = useState(false);
  const [phraseIncomplete, setPhraseIncomplete] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<PracticeVoiceSettings>(() =>
    loadPracticeVoiceSettings()
  );
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const practiceMicRef = useRef<PracticeMicSession | null>(null);
  const voiceMonitorRef = useRef<{ stop: () => void } | null>(null);

  const displayLevel = Math.max(
    voiceLevel,
    speechDetected && phase === "listening" ? speechPulse : 0
  );

  const recognitionRef = useRef<ReturnType<typeof startUtteranceRecognition> | null>(null);
  const listenRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interimFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interimTextRef = useRef("");
  const voiceSessionRef = useRef(voiceSession);
  const loadingRef = useRef(loading);
  const messagesRef = useRef(messages);
  const jlptLevelRef = useRef(jlptLevel);
  const speechRegisterRef = useRef(speechRegister);
  const autoSpeakRef = useRef(autoSpeak);
  const ttsSupportedRef = useRef(ttsSupported);
  const micMutedRef = useRef(micMuted);
  const listenLangRef = useRef<SpeechInputLang>("ja-JP");
  const speakingIdRef = useRef(speakingId);
  const stopSpeakRef = useRef<(() => void) | null>(null);
  const phaseRef = useRef(phase);
  const voiceSettingsRef = useRef(voiceSettings);

  const isBerryAudioActive = useCallback(() => {
    return (
      practiceSpeakQueueActive() ||
      Boolean(speakingIdRef.current) ||
      phaseRef.current === "speaking" ||
      phaseRef.current === "thinking" ||
      loadingRef.current
    );
  }, []);

  voiceSessionRef.current = voiceSession;
  loadingRef.current = loading;
  messagesRef.current = messages;
  jlptLevelRef.current = jlptLevel;
  speechRegisterRef.current = speechRegister;
  setPracticeSpeakRegister(speechRegister);
  autoSpeakRef.current = autoSpeak;
  ttsSupportedRef.current = ttsSupported;
  micMutedRef.current = micMuted;
  showTranscriptRef.current = showTranscript;
  speakingIdRef.current = speakingId;
  phaseRef.current = phase;
  voiceSettingsRef.current = voiceSettings;

  const interruptBerryIfSpeaking = useCallback(() => {
    if (!practiceSpeakQueueActive() && !speakingIdRef.current) return;
    stopSpeakRef.current?.();
    if (voiceSessionRef.current && !loadingRef.current) {
      setPhase("listening");
    }
  }, []);

  const bumpSpeechActivity = useCallback(() => {
    if (micMutedRef.current || isBerryAudioActive()) return;
    interruptBerryIfSpeaking();
    setSpeechDetected(true);
    setSpeechPulse(1);
    setPhraseIncomplete(false);
    setError(null);
  }, [interruptBerryIfSpeaking, isBerryAudioActive]);

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
    saveStored({ messages, jlptLevel, speechRegister, transcriptScript, autoSpeak });
  }, [messages, jlptLevel, speechRegister, transcriptScript, autoSpeak]);

  useEffect(() => {
    if (transcriptScript !== "kana") {
      setKanaReadingsLoading(false);
      setKanaReadingsError(null);
      return;
    }

    const pending = messages.filter(
      (m) => lineNeedsKanaReading(m.content) && !kanaReadings[m.id]?.trim()
    );
    if (pending.length === 0) {
      setKanaReadingsLoading(false);
      return;
    }

    let cancelled = false;
    setKanaReadingsLoading(true);
    setKanaReadingsError(null);

    void (async () => {
      try {
        const readings = await fetchKanaReadings(pending.map((m) => m.content));
        if (cancelled) return;
        setKanaReadings((prev) => {
          const next = { ...prev };
          pending.forEach((m, i) => {
            const r = readings[i]?.trim();
            if (r) next[m.id] = r;
          });
          return next;
        });
      } catch (e) {
        if (!cancelled) {
          setKanaReadingsError(
            e instanceof Error ? e.message : "Could not load hiragana readings."
          );
        }
      } finally {
        if (!cancelled) setKanaReadingsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [transcriptScript, messages, kanaReadings]);

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
      setSpeechPulse((p) => (p <= 0.02 ? 0 : p * 0.88));
    }, 100);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    const berryActive =
      practiceSpeakQueueActive() ||
      Boolean(speakingIdRef.current) ||
      phase === "speaking" ||
      phase === "thinking" ||
      loading;
    const rawActive =
      !micMuted &&
      !berryActive &&
      (speechDetected || voiceLevel > 0.08 || interim.length > 0);
    if (rawActive) {
      setSpeechActiveUi(true);
      return;
    }
    const id = window.setTimeout(() => setSpeechActiveUi(false), 450);
    return () => window.clearTimeout(id);
  }, [micMuted, speechDetected, voiceLevel, interim, phase, loading]);

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
      {
        stream,
        stopTracksOnRelease: false,
        noiseFloor: () =>
          isBerryAudioActive() ? voiceSettingsRef.current.berrySpeakingNoiseFloor : 0.032,
      }
    );
    if (!monitor) return false;
    voiceMonitorRef.current = monitor;
    return true;
  }, [isBerryAudioActive]);

  const abortListening = useCallback(() => {
    if (interimFlushRef.current) {
      clearTimeout(interimFlushRef.current);
      interimFlushRef.current = null;
    }
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setInterim("");
    interimTextRef.current = "";
    setSpeechDetected(false);
    setPhraseIncomplete(false);
  }, []);

  useEffect(() => {
    if (phase === "speaking" || phase === "thinking" || loading) {
      abortListening();
    }
  }, [phase, loading, abortListening]);

  const stopSpeak = useCallback(() => {
    cancelPracticeSpeakQueue();
    cancelPracticeVoicePlayback();
    setSpeakingId(null);
    if (phase === "speaking") {
      setPhase(voiceSessionRef.current ? "listening" : "idle");
    }
  }, [phase]);
  stopSpeakRef.current = stopSpeak;

  const restoreListeningPhase = useCallback(() => {
    if (!voiceSessionRef.current) {
      setPhase("idle");
      return;
    }
    if (loadingRef.current) return;
    if (micMutedRef.current) {
      setPhase("listening");
      return;
    }
    setPhase("listening");
  }, []);

  const setMicMutedState = useCallback(
    (muted: boolean) => {
      if (!muted) {
        micMutedRef.current = false;
        setMicMuted(false);
        practiceMicRef.current?.setMuted(false);
        if (voiceSessionRef.current && !loadingRef.current && !recognitionRef.current) {
          beginListeningRef.current?.();
        }
        return;
      }

      clearListenRestartTimer();
      const session = recognitionRef.current;
      const pendingText = interimTextRef.current.trim();

      micMutedRef.current = true;
      setMicMuted(true);
      practiceMicRef.current?.setMuted(true);

      if (session) {
        session.submitPending();
      } else if (pendingText) {
        void sendToApiRef.current?.(pendingText);
      }

      if (interimFlushRef.current) {
        clearTimeout(interimFlushRef.current);
        interimFlushRef.current = null;
      }
      setInterim("");
      interimTextRef.current = "";
      setSpeechDetected(false);
      setPhraseIncomplete(false);
      setVoiceLevel(0);
      setSpeechPulse(0);
    },
    [clearListenRestartTimer]
  );

  const toggleMicMute = useCallback(() => {
    setMicMutedState(!micMutedRef.current);
  }, [setMicMutedState]);

  const scheduleListenAfterReply = useCallback(() => {
    clearListenRestartTimer();
    if (!voiceSessionRef.current || loadingRef.current || micMutedRef.current) return;
    listenRestartTimerRef.current = setTimeout(() => {
      listenRestartTimerRef.current = null;
      if (
        !voiceSessionRef.current ||
        loadingRef.current ||
        micMutedRef.current ||
        practiceSpeakQueueActive() ||
        speakingIdRef.current
      ) {
        if (voiceSessionRef.current && !micMutedRef.current) {
          scheduleListenAfterReply();
        }
        return;
      }
      beginListeningRef.current?.();
    }, voiceSettingsRef.current.listenAfterSpeakMs);
  }, [clearListenRestartTimer]);

  const speakMessage = useCallback((messageId: string, text: string, onDone?: () => void) => {
    if (!text.trim()) {
      onDone?.();
      return;
    }
    setPhase("speaking");
    setError(null);
    setSpeakingId(messageId);
    void speakTutorLinePreferOpenAi(
      text,
      {
        onEnd: () => {
          setSpeakingId(null);
          restoreListeningPhase();
          onDone?.();
        },
        onError: (code) => {
          setSpeakingId(null);
          restoreListeningPhase();
          if (code === "not-allowed") {
            setError("Speech was blocked. Allow sound for this site, then try again.");
          }
          onDone?.();
        },
      },
      { speechRegister: speechRegisterRef.current }
    );
  }, [restoreListeningPhase]);

  const beginListeningRef = useRef<(() => void) | null>(null);

  const beginListening = useCallback(() => {
    if (!sttSupported || !voiceSessionRef.current || loadingRef.current || micMutedRef.current) {
      return;
    }
    if (isBerryAudioActive()) return;
    abortListening();
    setPhase("listening");
    setError(null);

    const inferred = inferListenSpeechLang({
      messages: messagesRef.current,
    });
    const lang: SpeechInputLang = inferred === "fil-PH" ? "en-US" : inferred;
    listenLangRef.current = lang;
    setSpeechDetected(false);
    setPhraseIncomplete(false);

    const vs = voiceSettingsRef.current;
    const session = startUtteranceRecognition({
      lang,
      audioTrack: practiceMicRef.current?.track,
      silenceMs: vs.silenceMs,
      silenceMsAfterFinal: vs.silenceMsAfterFinal,
      silenceMsIncomplete: vs.silenceMsIncomplete,
      silenceMsIncompleteAfterFinal: vs.silenceMsIncompleteAfterFinal,
      maxIncompleteWaitMs: vs.maxIncompleteWaitMs,
      completePhraseCutoffMs: vs.completePhraseCutoffMs,
      onListening: () => setPhase("listening"),
      onSpeechActivity: bumpSpeechActivity,
      onPhraseIncomplete: () => {
        if (micMutedRef.current) return;
        setPhraseIncomplete(true);
      },
      onInterim: (text) => {
        if (micMutedRef.current || isBerryAudioActive()) return;
        bumpSpeechActivity();
        interimTextRef.current = text;
        if (interimFlushRef.current) return;
        interimFlushRef.current = setTimeout(() => {
          interimFlushRef.current = null;
          setInterim(interimTextRef.current);
          const live = detectUtteranceLanguage(interimTextRef.current);
          if (live !== "unknown") setDetectedLang(live);
        }, 140);
      },
      onUtteranceComplete: (text) => {
        if (isBerryAudioActive()) return;
        setPhraseIncomplete(false);
        const detected = detectUtteranceLanguage(text);
        setDetectedLang(detected);
        listenLangRef.current = detectedLanguageToSpeechLang(detected, text);
        setInterim("");
        interimTextRef.current = "";
        recognitionRef.current = null;
        void sendToApiRef.current?.(text);
      },
      onEmpty: () => {
        if (micMutedRef.current) return;
        setError("Didn't catch that — try speaking a bit louder, then pause.");
        setPhase("listening");
        if (voiceSessionRef.current) scheduleListenAfterReply();
      },
      onError: (code) => {
        recognitionRef.current = null;
        if (micMutedRef.current) return;
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
  }, [sttSupported, abortListening, scheduleListenAfterReply, bumpSpeechActivity, isBerryAudioActive]);

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
      const assistantId = id();
      const assistantPlaceholder: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
      };
      setMessages([...history, assistantPlaceholder]);
      listenLangRef.current = detectedLanguageToSpeechLang(detected, t);
      setDraft("");
      setLoading(true);
      loadingRef.current = true;
      setPhase("thinking");
      setError(null);

      const useLiveVoice =
        voiceSessionRef.current && autoSpeakRef.current && ttsSupportedRef.current;
      let streamPrefetchTimer: ReturnType<typeof setTimeout> | null = null;

      const afterReply = () => {
        if (voiceSessionRef.current) scheduleListenAfterReply();
      };

      const onVoiceReplyDone = () => {
        setSpeakingId(null);
        restoreListeningPhase();
        afterReply();
      };

      const maybePrefetchFromStream = (accumulated: string) => {
        if (!useLiveVoice || !accumulated.trim()) return;
        if (streamPrefetchTimer) clearTimeout(streamPrefetchTimer);
        streamPrefetchTimer = setTimeout(() => {
          streamPrefetchTimer = null;
          prefetchTutorLine(accumulated, {
            speechRegister: speechRegisterRef.current,
          });
        }, 300);
      };

      const finishSpeech = (reply: string) => {
        if (!autoSpeakRef.current || !ttsSupportedRef.current) {
          afterReply();
          return;
        }
        if (streamPrefetchTimer) {
          clearTimeout(streamPrefetchTimer);
          streamPrefetchTimer = null;
        }
        if (useLiveVoice) {
          setPhase("speaking");
          setSpeakingId(assistantId);
          prefetchTutorLine(reply, { speechRegister: speechRegisterRef.current });
          enqueuePracticeSpeech([reply], { onEnd: onVoiceReplyDone }, {
            speechRegister: speechRegisterRef.current,
          });
          return;
        }
        setPhase("speaking");
        speakMessage(assistantId, reply, afterReply);
      };

      let streamFlushTimer: ReturnType<typeof setTimeout> | null = null;
      let pendingStreamText = "";

      const flushStreamTranscript = () => {
        streamFlushTimer = null;
        if (!pendingStreamText || !showTranscriptRef.current) return;
        const text = pendingStreamText;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: text } : m))
        );
      };

      try {
        const apiMessages = history.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        let reply = "";

        try {
          const streamed = await streamPracticeChat(
            {
              jlptLevel: jlptLevelRef.current,
              speechRegister: speechRegisterRef.current,
              messages: apiMessages,
            },
            (accumulated) => {
              reply = accumulated;
              pendingStreamText = accumulated;
              maybePrefetchFromStream(accumulated);
              if (!showTranscriptRef.current) return;
              if (!streamFlushTimer) {
                streamFlushTimer = setTimeout(flushStreamTranscript, 300);
              }
            }
          );
          reply = streamed.text;
          if (streamFlushTimer) {
            clearTimeout(streamFlushTimer);
            streamFlushTimer = null;
          }
          if (streamed.detectedLanguage) {
            setDetectedLang(streamed.detectedLanguage);
          }
        } catch {
          const res = await fetch("/api/japanese/practice-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jlptLevel: jlptLevelRef.current,
              speechRegister: speechRegisterRef.current,
              messages: apiMessages,
            }),
          });
          const data = (await res.json()) as {
            text?: string;
            error?: string;
            detectedLanguage?: DetectedLanguage;
          };
          if (!res.ok) throw new Error(data.error || "Practice chat failed.");
          reply = (data.text ?? "").trim();
          if (data.detectedLanguage) setDetectedLang(data.detectedLanguage);
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: reply } : m))
          );
        }

        if (!reply.trim()) throw new Error("Empty response from tutor.");
        setDetectedLang(detectUtteranceLanguage(reply));
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: reply } : m))
        );
        finishSpeech(reply);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id && m.id !== assistantId));
        cancelPracticeSpeakQueue();
        restoreListeningPhase();
        if (voiceSessionRef.current) scheduleListenAfterReply();
      } finally {
        if (streamPrefetchTimer) clearTimeout(streamPrefetchTimer);
        if (streamFlushTimer) clearTimeout(streamFlushTimer);
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
      restoreListeningPhase,
    ]
  );

  sendToApiRef.current = sendToApi;

  const stopVoiceSession = useCallback(() => {
    setVoiceSession(false);
    setMicMuted(false);
    micMutedRef.current = false;
    clearListenRestartTimer();
    abortListening();
    stopVoiceMonitor();
    stopPracticeMic();
    stopSpeak();
    clearPracticeTtsPrefetch();
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

  const onVoiceSettingsChange = useCallback(
    (next: PracticeVoiceSettings) => {
      setVoiceSettings(next);
      if (
        voiceSessionRef.current &&
        recognitionRef.current &&
        !loadingRef.current &&
        !micMutedRef.current
      ) {
        abortListening();
        beginListeningRef.current?.();
      }
    },
    [abortListening]
  );

  const clearChat = useCallback(() => {
    stopVoiceSession();
    setMessages([]);
    setKanaReadings({});
    setKanaReadingsError(null);
    setDraft("");
    setError(null);
  }, [stopVoiceSession]);

  useEffect(() => {
    return () => {
      clearListenRestartTimer();
      recognitionRef.current?.abort();
      stopVoiceMonitor();
      stopPracticeMic();
      cancelPracticeSpeakQueue();
      cancelPracticeVoicePlayback();
      clearPracticeTtsPrefetch();
    };
  }, [clearListenRestartTimer, stopVoiceMonitor, stopPracticeMic]);

  const speechActive = speechActiveUi;
  const headline = phaseHeadline(
    phase,
    voiceSession,
    detectedLang,
    speechActive,
    phraseIncomplete,
    micMuted
  );

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
          <div className="flex flex-wrap items-center gap-2">
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
            <div
              className="inline-flex rounded-full bg-stone-100/90 p-1 ring-1 ring-stone-200/80"
              role="group"
              aria-label="Japanese speech register"
            >
              {(
                [
                  { id: "polite" as const, label: "Polite", hint: "です／ます" },
                  { id: "casual" as const, label: "Casual", hint: "plain" },
                ] as const
              ).map(({ id, label, hint }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSpeechRegister(id)}
                  disabled={loading || voiceSession}
                  title={id === "polite" ? "Polite です／ます (default)" : "Casual plain form"}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition sm:px-4 ${
                    speechRegister === id
                      ? "bg-white text-pink-700 shadow-sm ring-1 ring-pink-100"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  {label}
                  <span className="ml-1 hidden font-medium text-stone-500 sm:inline">({hint})</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowVoiceSettings((v) => !v)}
              aria-expanded={showVoiceSettings}
              aria-label="How long Berry waits settings"
              title="Adjust how long Berry waits before she replies"
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 ${
                showVoiceSettings
                  ? "border-pink-300 bg-pink-100 text-pink-800"
                  : "border-stone-200 bg-white text-stone-600 hover:border-pink-200 hover:bg-pink-50 hover:text-pink-700"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path
                  d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 5 15.4a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {voiceSession && <PhasePill phase={phase} />}
          </div>
        </div>

        {showVoiceSettings && (
          <div className="border-b border-stone-100 px-4 py-4 sm:px-5">
            <PracticeVoiceSettingsPanel
              settings={voiceSettings}
              onChange={onVoiceSettingsChange}
              disabled={loading}
            />
          </div>
        )}

        <div className="relative bg-gradient-to-b from-rose-50/50 via-white to-white px-4 py-6 sm:px-6 sm:py-8">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(251,113,133,0.12),transparent)]"
            aria-hidden
          />

          <div className="relative mx-auto w-full max-w-md rounded-3xl border border-pink-100/90 bg-white/90 px-5 py-8 shadow-[0_2px_20px_rgba(244,63,94,0.08)] backdrop-blur-sm sm:px-8 sm:py-10">
            {voiceSession && (
              <button
                type="button"
                onClick={toggleMicMute}
                aria-pressed={!micMuted}
                aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
                title={micMuted ? "Unmute microphone" : "Mute microphone"}
                className={`absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 sm:right-5 sm:top-5 ${
                  micMuted
                    ? "border-pink-300 bg-pink-100 text-pink-700 hover:bg-pink-200"
                    : "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                }`}
              >
                {micMuted ? (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M12 19v3" strokeLinecap="round" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" strokeLinecap="round" />
                    <path d="M12 15a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v7a3 3 0 0 0 3 3Z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="m3 3 18 18" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M12 19v3" strokeLinecap="round" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" strokeLinecap="round" />
                    <path d="M12 15a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v7a3 3 0 0 0 3 3Z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            )}
            <p
              className="text-center text-lg font-semibold tracking-tight text-stone-900 sm:text-xl"
              aria-live="polite"
              aria-atomic="true"
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
                className={`relative flex h-32 w-32 items-center justify-center rounded-full transition-[box-shadow,background] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-4 disabled:opacity-45 sm:h-36 sm:w-36 ${
                  phase === "thinking"
                    ? "bg-gradient-to-br from-amber-300 to-orange-400 shadow-[0_0_32px_rgba(251,191,36,0.35)]"
                    : phase === "speaking"
                      ? "bg-gradient-to-br from-pink-400 to-rose-500 shadow-[0_0_40px_rgba(236,72,153,0.4)]"
                      : micMuted
                        ? "bg-gradient-to-br from-rose-300 to-pink-400 shadow-[0_0_28px_rgba(244,63,94,0.3)]"
                        : phase === "listening"
                          ? "bg-gradient-to-br from-rose-400 to-pink-500 shadow-[0_0_0_6px_rgba(255,255,255,0.9),0_0_40px_rgba(244,63,94,0.45)]"
                          : "bg-gradient-to-br from-pink-300 to-rose-400 shadow-lg hover:shadow-xl"
                }`}
              >
                <span className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-white text-3xl font-bold text-pink-600 shadow-inner sm:h-20 sm:w-20">
                  {TUTOR_NAME.slice(0, 1)}
                </span>
              </button>

              <div
                className={`mt-6 w-full min-w-[220px] rounded-2xl px-4 py-3 ${
                  speechActive
                    ? "bg-rose-50 ring-1 ring-rose-200"
                    : voiceSession && phase === "listening"
                      ? micMuted
                        ? "bg-pink-50/90 ring-1 ring-pink-200"
                        : "bg-stone-50 ring-1 ring-stone-100"
                      : "bg-transparent"
                }`}
              >
                <VoiceActivityVisualizer
                  phase={phase}
                  level={micMuted ? 0 : displayLevel}
                  speechDetected={!micMuted && (speechDetected || interim.length > 0)}
                />
                {voiceSession && phase === "listening" && (
                  <p
                    className={`mt-2 text-center text-[11px] font-medium ${
                      micMuted
                        ? "text-pink-600"
                        : speechActive
                          ? "text-rose-600"
                          : phraseIncomplete
                            ? "text-amber-700"
                            : "text-stone-400"
                    }`}
                  >
                    {micMuted
                      ? "Mic off — Berry can still reply"
                      : speechActive
                        ? "Voice detected"
                        : phraseIncomplete
                          ? "Mid-sentence — keep talking"
                          : "Waiting for you…"}
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
                  <button
                    type="button"
                    onClick={toggleMicMute}
                    aria-pressed={!micMuted}
                    className={`min-w-[10rem] rounded-xl border px-5 py-2.5 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 ${
                      micMuted
                        ? "border-pink-300 bg-pink-100 text-pink-800 hover:bg-pink-200"
                        : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    }`}
                  >
                    {micMuted ? "Unmute mic" : "Mute mic"}
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
              ? micMuted
                ? "Mic is off — what you already said still goes to Berry. Unmute to talk again."
                : `Hands-free — pause briefly when you finish. ${TUTOR_NAME} replies as soon as she can.`
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
            <div className="border-t border-stone-100">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 bg-white px-4 py-2.5 sm:px-5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  Show as
                </span>
                <div
                  className="inline-flex rounded-full bg-stone-100/90 p-0.5 ring-1 ring-stone-200/80"
                  role="group"
                  aria-label="Transcript script"
                >
                  {(
                    [
                      { id: "normal" as const, label: "Normal" },
                      { id: "kana" as const, label: "Hiragana / Katakana" },
                    ] as const
                  ).map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTranscriptScript(id)}
                      className={`rounded-full px-3 py-1 text-[11px] font-bold transition sm:text-xs ${
                        transcriptScript === id
                          ? "bg-white text-pink-700 shadow-sm ring-1 ring-pink-100"
                          : "text-stone-600 hover:text-stone-900"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {transcriptScript === "kana" && kanaReadingsLoading && (
                <p className="border-b border-stone-100 bg-violet-50/80 px-4 py-2 text-center text-[11px] font-medium text-violet-800 sm:px-5">
                  Loading hiragana readings…
                </p>
              )}
              {transcriptScript === "kana" && kanaReadingsError && (
                <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-center text-[11px] text-amber-950 sm:px-5">
                  {kanaReadingsError} Showing original text where readings are missing.
                </p>
              )}
            <div className="max-h-[280px] min-h-[80px] space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
              {messages.length === 0 && !loading && (
                <p className="text-center text-xs text-stone-400">Your conversation will appear here.</p>
              )}
              {messages.map((m) => {
                const body = displayTranscriptLine(
                  m.content,
                  transcriptScript,
                  kanaReadings[m.id]
                );
                const jpLine = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/u.test(body);
                return (
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
                    } ${jpLine ? jpFontClass : ""}`}
                  >
                    <p className="whitespace-pre-wrap">{body}</p>
                  </div>
                </div>
              );
              })}
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
