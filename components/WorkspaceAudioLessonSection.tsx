"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  encodeAudioBufferToWav,
  sliceAudioBuffer,
  snapSegmentsToNonOverlappingSlices,
  type AudioSegmentRange,
} from "@/lib/audio-silence-segment";
import {
  createAudioLesson,
  deleteAudioLesson,
  fetchAudioLessonBlob,
  getAudioLesson,
  listAudioLessons,
  updateAudioLesson,
} from "@/lib/audio-lesson-repo";
import { usingLocalStorage } from "@/lib/flashcards-repo";
import { hasKanji } from "@/lib/japanese-tokens";
import type { AudioLessonRow, AudioLessonSegment } from "@/lib/types";
import { toHiragana, toKatakana, toRomaji } from "wanakana";

const MAX_BYTES = 80 * 1024 * 1024;
const MAX_WHISPER_BYTES = 25 * 1024 * 1024;

function clampAudioSegments(segments: AudioSegmentRange[], maxSec: number): AudioSegmentRange[] {
  return segments
    .map((s) => ({
      startSec: Math.max(0, Math.min(s.startSec, maxSec)),
      endSec: Math.max(0, Math.min(s.endSec, maxSec)),
    }))
    .filter((s) => s.endSec - s.startSec > 0.02);
}

/** Aligns each phrase line with the same clamp/filter rules as `clampAudioSegments`. */
function segmentsPayloadFromWhisperRaw(
  raw: { startSec: number; endSec: number; text?: string; speaker?: string }[],
  durationSec: number
): AudioLessonSegment[] {
  const out: AudioLessonSegment[] = [];
  for (const r of raw) {
    const startSec = Math.max(0, Math.min(r.startSec, durationSec));
    const endSec = Math.max(0, Math.min(r.endSec, durationSec));
    if (endSec - startSec <= 0.02) continue;
    const text = typeof r.text === "string" ? r.text.trim() || undefined : undefined;
    const speaker =
      typeof r.speaker === "string" && r.speaker.trim() ? r.speaker.trim() : undefined;
    out.push({ startSec, endSec, text, speaker });
  }
  return out;
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec - m * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

type JapaneseDisplayMode = "original" | "hiragana" | "katakana" | "romaji";

function formatJapaneseForDisplay(
  text: string,
  mode: JapaneseDisplayMode,
  hiraganaReadingLine: string | undefined
): string {
  const t = text.trim();
  if (!t) return text;
  switch (mode) {
    case "original":
      return text;
    case "hiragana":
      if (hiraganaReadingLine?.trim()) return hiraganaReadingLine.trim();
      if (hasKanji(text)) return text;
      return toHiragana(text);
    case "katakana":
      return toKatakana(text);
    case "romaji":
      return toRomaji(text);
    default:
      return text;
  }
}

type MainTab = "library" | "lesson";

function serializeLessonBaseline(
  title: string,
  filename: string,
  phrases: string[],
  speakers: string[],
  segments: { startSec: number; endSec: number }[]
): string {
  return JSON.stringify({
    t: title.trim(),
    f: filename.trim(),
    p: phrases,
    sp: speakers,
    s: segments.map((x) => [
      Math.round(x.startSec * 1000) / 1000,
      Math.round(x.endSec * 1000) / 1000,
    ]),
  });
}

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function serializeUnknownError(e: unknown): string {
  if (e instanceof Error) return e.message || e.name || "Error";
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
    if (typeof o.error_description === "string") return o.error_description;
    if (typeof o.details === "string") return o.details;
    if (typeof o.hint === "string" && o.hint.trim()) return o.hint;
    if (typeof o.code === "string") return `code: ${o.code}`;
  }
  try {
    const s = JSON.stringify(e);
    if (s && s !== "{}") return s;
  } catch {
    /* ignore */
  }
  return typeof e === "string" ? e : "Unknown error (see server / network tab)";
}

type TimedWord = { word: string; startSec: number; endSec: number };

/** Full source file — pink/violet to match lesson part players. */
function FullSourceAudioBar({
  audioUrl,
  nominalDurationSec,
  disabled,
  onTimeSec,
}: {
  audioUrl: string;
  nominalDurationSec: number;
  disabled?: boolean;
  onTimeSec?: (t: number) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(nominalDurationSec);

  useEffect(() => {
    setDurationSec(nominalDurationSec);
  }, [nominalDurationSec, audioUrl]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const emit = () => {
      const t = el.currentTime;
      setPositionSec(t);
      onTimeSec?.(t);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setPositionSec(0);
      onTimeSec?.(0);
    };
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) setDurationSec(el.duration);
    };
    el.addEventListener("timeupdate", emit);
    el.addEventListener("seeked", emit);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("loadedmetadata", onMeta);
    onMeta();
    return () => {
      el.removeEventListener("timeupdate", emit);
      el.removeEventListener("seeked", emit);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("loadedmetadata", onMeta);
    };
  }, [audioUrl, onTimeSec]);

  const cap = durationSec > 0 ? durationSec : nominalDurationSec;

  const seekFromClientX = (clientX: number) => {
    const tr = trackRef.current;
    const el = audioRef.current;
    if (!tr || !el || disabled) return;
    const rect = tr.getBoundingClientRect();
    const r = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    el.currentTime = Math.max(0, Math.min(cap, r * cap));
    setPositionSec(el.currentTime);
    onTimeSec?.(el.currentTime);
  };

  const skip = (delta: number) => {
    const el = audioRef.current;
    if (!el || disabled) return;
    el.currentTime = Math.max(0, Math.min(cap, el.currentTime + delta));
    setPositionSec(el.currentTime);
    onTimeSec?.(el.currentTime);
  };

  const toggle = () => {
    const el = audioRef.current;
    if (!el || disabled) return;
    if (playing) el.pause();
    else void el.play().catch(() => {});
  };

  const progressPct = cap > 0 ? Math.min(100, (positionSec / cap) * 100) : 0;
  const btnBase =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-pink-200/90 bg-white text-pink-800 shadow-sm transition hover:border-violet-300 hover:bg-violet-50/80 hover:text-violet-900 disabled:opacity-35";

  return (
    <div className="space-y-2">
      <audio ref={audioRef} src={audioUrl} preload="metadata" className="hidden" aria-hidden />
      <div
        className={`rounded-xl border border-pink-100/90 bg-gradient-to-r from-pink-50/70 via-white to-violet-50/60 p-2 shadow-inner shadow-pink-100/30 ${
          disabled ? "pointer-events-none opacity-45" : ""
        }`}
        role="group"
        aria-label="Full file playback"
      >
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button type="button" className={btnBase} aria-label="Rewind 5 seconds" onClick={() => skip(-5)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M11 18V6l-8 6 8 6zm11 0V6l-8 6 8 6z" />
            </svg>
          </button>
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-violet-600 to-pink-600 text-white shadow-md shadow-violet-300/40 transition hover:from-violet-700 hover:to-pink-700 disabled:opacity-40"
            aria-label={playing ? "Pause" : "Play"}
            onClick={toggle}
            disabled={disabled}
          >
            {playing ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="ml-0.5">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button type="button" className={btnBase} aria-label="Forward 5 seconds" onClick={() => skip(5)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M13 6v12l8-6-8-6zm-11 0v12l8-6-8-6z" />
            </svg>
          </button>
          <div className="min-w-0 flex-1 pl-1">
            <div
              ref={trackRef}
              role="slider"
              tabIndex={0}
              aria-valuemin={0}
              aria-valuemax={Math.round(cap * 1000)}
              aria-valuenow={Math.round(positionSec * 1000)}
              className="h-2 cursor-pointer overflow-hidden rounded-full bg-violet-100/90"
              onClick={(e) => seekFromClientX(e.clientX)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") {
                  e.preventDefault();
                  skip(2);
                } else if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  skip(-2);
                }
              }}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-600 via-pink-500 to-rose-400 transition-[width] duration-150 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="mt-1 text-center text-[11px] tabular-nums text-neutral-500 sm:text-xs">
              {formatClock(positionSec)} / {formatClock(cap)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function WordTimedHighlighter({
  words,
  currentTimeSec,
  variant = "default",
  displayMode = "original",
  hiraganaPerWord,
}: {
  words: TimedWord[];
  currentTimeSec: number;
  variant?: "default" | "raw";
  displayMode?: JapaneseDisplayMode;
  /** When `displayMode` is hiragana, optional reading per token (same order as `words`). */
  hiraganaPerWord?: (string | null)[] | null;
}) {
  const t = Math.max(0, currentTimeSec);
  const sizeClass =
    variant === "raw"
      ? "text-xl leading-relaxed sm:text-2xl sm:leading-relaxed"
      : "mt-4 text-lg leading-relaxed sm:text-xl";

  return (
    <p className={sizeClass} lang="ja" style={{ wordBreak: "break-word" }}>
      {words.map((w, i) => {
        let role: "past" | "current" | "future";
        if (t >= w.endSec - 1e-4) role = "past";
        else if (t < w.startSec) role = "future";
        else role = "current";

        const reading =
          displayMode === "hiragana" && hiraganaPerWord?.[i] != null && String(hiraganaPerWord[i]).trim()
            ? String(hiraganaPerWord[i]).trim()
            : undefined;
        const shown = formatJapaneseForDisplay(w.word, displayMode, reading);

        const style: CSSProperties = {
          transition: "color 0.15s ease-out",
          color:
            role === "current"
              ? "rgb(126 34 206)"
              : role === "past"
                ? "rgb(161 161 170)"
                : "rgb(113 113 122)",
        };

        return (
          <span key={`${i}-${w.startSec}`} style={style} aria-current={role === "current" ? "true" : undefined}>
            {shown}
          </span>
        );
      })}
    </p>
  );
}

/** Hidden audio + bar matching lesson pink/violet styling */
function PartAudioControls({
  url,
  clipDurationSec,
  partLabel,
}: {
  url: string;
  clipDurationSec: number;
  partLabel: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(clipDurationSec);

  useEffect(() => {
    setDurationSec(clipDurationSec);
  }, [clipDurationSec, url]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setPositionSec(el.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setPositionSec(0);
    };
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) setDurationSec(el.duration);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("loadedmetadata", onMeta);
    onMeta();
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("loadedmetadata", onMeta);
    };
  }, [url]);

  const skip = (delta: number) => {
    const el = audioRef.current;
    if (!el) return;
    const cap = durationSec > 0 ? durationSec : clipDurationSec;
    el.currentTime = Math.max(0, Math.min(cap, el.currentTime + delta));
    setPositionSec(el.currentTime);
  };

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else void el.play().catch(() => {});
  };

  const progressPct = durationSec > 0 ? Math.min(100, (positionSec / durationSec) * 100) : 0;

  const btnBase =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-pink-200/90 bg-white text-pink-800 shadow-sm transition hover:border-violet-300 hover:bg-violet-50/80 hover:text-violet-900 disabled:opacity-35";

  return (
    <div className="mt-4 space-y-2">
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" aria-hidden />
      <div
        className="rounded-xl border border-pink-100/90 bg-gradient-to-r from-pink-50/70 via-white to-violet-50/60 p-2 shadow-inner shadow-pink-100/30"
        role="group"
        aria-label={`Playback ${partLabel}`}
      >
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button type="button" className={btnBase} aria-label="Rewind 5 seconds" onClick={() => skip(-5)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M11 18V6l-8 6 8 6zm11 0V6l-8 6 8 6z" />
            </svg>
          </button>
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-violet-600 to-pink-600 text-white shadow-md shadow-violet-300/40 transition hover:from-violet-700 hover:to-pink-700"
            aria-label={playing ? "Pause" : "Play"}
            onClick={toggle}
          >
            {playing ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="ml-0.5">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button type="button" className={btnBase} aria-label="Forward 5 seconds" onClick={() => skip(5)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M13 6v12l8-6-8-6zm-11 0v12l8-6-8-6z" />
            </svg>
          </button>
          <div className="min-w-0 flex-1 pl-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-pink-100/90">
              <div
                className="h-full rounded-full bg-gradient-to-r from-pink-500 to-violet-500 transition-[width] duration-150 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="mt-1 text-center text-[11px] tabular-nums text-neutral-500 sm:text-xs">
              {formatClock(positionSec)} / {formatClock(durationSec > 0 ? durationSec : clipDurationSec)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkspaceAudioLessonSection() {
  const inputRef = useRef<HTMLInputElement>(null);
  const seqAudioRef = useRef<HTMLAudioElement | null>(null);
  const seqLoadedSrcRef = useRef<string | null>(null);

  const [mainTab, setMainTab] = useState<MainTab>("library");
  const [libraryLessons, setLibraryLessons] = useState<AudioLessonRow[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryBump, setLibraryBump] = useState(0);

  const [lessonId, setLessonId] = useState<string | null>(null);
  const [lessonTitle, setLessonTitle] = useState("");
  /** Display / stored filename (editable); storage object path does not change after upload. */
  const [lessonFilename, setLessonFilename] = useState("");
  const [activeLessonRow, setActiveLessonRow] = useState<AudioLessonRow | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [decodedBuffer, setDecodedBuffer] = useState<AudioBuffer | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [decodeError, setDecodeError] = useState<string | null>(null);

  const [whisperSegments, setWhisperSegments] = useState<AudioSegmentRange[] | null>(null);
  const [phraseTexts, setPhraseTexts] = useState<string[]>([]);
  /** Parallel to phraseTexts — diarized speaker label per part, if any. */
  const [phraseSpeakers, setPhraseSpeakers] = useState<string[]>([]);
  const [whisperLoading, setWhisperLoading] = useState(false);
  const [whisperError, setWhisperError] = useState<string | null>(null);
  /** Word-level timings from the last Whisper response (for raw-mode follow-the-audio highlighting). */
  const [whisperWords, setWhisperWords] = useState<TimedWord[] | null>(null);
  /** Object URL for the full decoded file (WAV) — raw-mode listen-first player. */
  const [fullSourceUrl, setFullSourceUrl] = useState<string | null>(null);
  const [fullListenSec, setFullListenSec] = useState(0);
  /** After a new file decodes, ask lesson vs raw Whisper segments. */
  const [divisionPromptOpen, setDivisionPromptOpen] = useState(false);
  /** When true, server runs JLPT-style word cuts + smart-merge; when false, returns Whisper segments only. */
  const [useLessonPhraseDivision, setUseLessonPhraseDivision] = useState(true);

  const [fileDragActive, setFileDragActive] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  /** Sequential “play all” session (still active until Stop). */
  const [queueSession, setQueueSession] = useState(false);
  /** Transport: whether the sequential player is currently playing (vs paused in-session). */
  const [queuePlaying, setQueuePlaying] = useState(false);
  const [queueIndex, setQueueIndex] = useState(0);
  const [queuePositionSec, setQueuePositionSec] = useState(0);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameRow, setRenameRow] = useState<AudioLessonRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameFilenameValue, setRenameFilenameValue] = useState("");

  const [japaneseDisplayMode, setJapaneseDisplayMode] = useState<JapaneseDisplayMode>("original");
  const [hiraganaReadings, setHiraganaReadings] = useState<string[] | null>(null);
  const [hiraganaReadingLoading, setHiraganaReadingLoading] = useState(false);
  const [hiraganaReadingError, setHiraganaReadingError] = useState<string | null>(null);
  /** Hiragana readings aligned to `whisperWords` (raw mode + word timings). */
  const [hiraganaWordReadings, setHiraganaWordReadings] = useState<string[] | null>(null);
  const [hiraganaWordReadingLoading, setHiraganaWordReadingLoading] = useState(false);
  const [hiraganaWordReadingError, setHiraganaWordReadingError] = useState<string | null>(null);

  /** JSON snapshot last committed (saved or loaded); null = no baseline yet. */
  const [committedLessonBaseline, setCommittedLessonBaseline] = useState<string | null>(null);
  /** Bumps after loading a lesson from library to snapshot baseline from that row. */
  const [lessonBaselineNonce, setLessonBaselineNonce] = useState(0);

  const localOnly = usingLocalStorage();

  const refreshLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const list = await listAudioLessons();
      setLibraryLessons(list);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary, libraryBump]);

  const displaySegments = useMemo(() => {
    if (!decodedBuffer || !whisperSegments?.length) return [];
    const clamped = clampAudioSegments(whisperSegments, decodedBuffer.duration);
    return snapSegmentsToNonOverlappingSlices(clamped, decodedBuffer.sampleRate, decodedBuffer.length);
  }, [decodedBuffer, whisperSegments]);

  const currentLessonBaseline = useMemo(
    () =>
      serializeLessonBaseline(lessonTitle, lessonFilename, phraseTexts, phraseSpeakers, displaySegments),
    [lessonTitle, lessonFilename, phraseTexts, phraseSpeakers, displaySegments]
  );

  const lessonHasUnsavedChanges =
    displaySegments.length > 0 &&
    (committedLessonBaseline === null || currentLessonBaseline !== committedLessonBaseline);

  useEffect(() => {
    if (lessonBaselineNonce === 0) return;
    setCommittedLessonBaseline(
      serializeLessonBaseline(lessonTitle, lessonFilename, phraseTexts, phraseSpeakers, displaySegments)
    );
    // Intentionally only when opening from library (nonce bump), not on every field change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonBaselineNonce]);

  useEffect(() => {
    const n = displaySegments.length;
    setPhraseTexts((prev) => {
      if (prev.length === n) return prev;
      return Array.from({ length: n }, (_, i) => prev[i] ?? "");
    });
    setPhraseSpeakers((prev) => {
      if (prev.length === n) return prev;
      return Array.from({ length: n }, (_, i) => prev[i] ?? "");
    });
  }, [displaySegments.length]);

  const [clipUrls, setClipUrls] = useState<string[]>([]);

  useEffect(() => {
    const urls: string[] = [];
    if (decodedBuffer && displaySegments.length > 0 && useLessonPhraseDivision) {
      for (const seg of displaySegments) {
        const sliced = sliceAudioBuffer(decodedBuffer, seg.startSec, seg.endSec);
        const wav = encodeAudioBufferToWav(sliced);
        urls.push(URL.createObjectURL(new Blob([wav], { type: "audio/wav" })));
      }
    }
    setClipUrls(urls);
    return () => {
      urls.forEach(URL.revokeObjectURL);
    };
  }, [decodedBuffer, displaySegments, useLessonPhraseDivision]);

  useEffect(() => {
    if (!decodedBuffer) {
      setFullSourceUrl(null);
      return;
    }
    const sliced = sliceAudioBuffer(decodedBuffer, 0, decodedBuffer.duration);
    const wav = encodeAudioBufferToWav(sliced);
    const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    setFullSourceUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [decodedBuffer]);

  useEffect(() => {
    setFullListenSec(0);
  }, [fullSourceUrl]);

  useEffect(() => {
    const el = seqAudioRef.current;
    if (!el || clipUrls.length === 0) return;

    if (!queueSession) {
      el.pause();
      seqLoadedSrcRef.current = null;
      setQueuePositionSec(0);
      return;
    }

    const url = clipUrls[queueIndex];
    if (!url) return;

    if (seqLoadedSrcRef.current !== url) {
      el.src = url;
      seqLoadedSrcRef.current = url;
      setQueuePositionSec(0);
    }

    const onEnded = () => {
      setQueueIndex((i) => {
        if (i + 1 < clipUrls.length) return i + 1;
        setQueueSession(false);
        setQueuePlaying(false);
        seqLoadedSrcRef.current = null;
        setQueuePositionSec(0);
        return 0;
      });
    };

    const onTime = () => setQueuePositionSec(el.currentTime);

    el.addEventListener("ended", onEnded);
    el.addEventListener("timeupdate", onTime);

    if (queuePlaying) {
      void el.play().catch(() => setQueuePlaying(false));
    } else {
      el.pause();
    }

    return () => {
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("timeupdate", onTime);
    };
  }, [queueSession, queuePlaying, queueIndex, clipUrls]);

  useEffect(() => {
    setQueueSession(false);
    setQueuePlaying(false);
    setQueueIndex(0);
    setQueuePositionSec(0);
    seqLoadedSrcRef.current = null;
  }, [displaySegments]);

  const phraseTextsKey = phraseTexts.join("\u0000");
  const whisperWordsReadingKey = whisperWords?.map((w) => w.word).join("\u0000") ?? "";

  const displayedPhraseLines = useMemo(() => {
    return phraseTexts.map((t, i) => {
      const line = formatJapaneseForDisplay(t, japaneseDisplayMode, hiraganaReadings?.[i]);
      const sp = phraseSpeakers[i]?.trim();
      if (!sp) return line;
      return `[${sp}] ${line}`;
    });
  }, [phraseTexts, phraseSpeakers, japaneseDisplayMode, hiraganaReadings]);

  const fullDisplayTranscript = useMemo(() => {
    return displayedPhraseLines
      .map((t) => t.trim())
      .filter(Boolean)
      .join(" ");
  }, [displayedPhraseLines]);

  useEffect(() => {
    if (japaneseDisplayMode !== "hiragana") {
      setHiraganaReadingLoading(false);
      setHiraganaReadingError(null);
      setHiraganaWordReadings(null);
      setHiraganaWordReadingLoading(false);
      setHiraganaWordReadingError(null);
      return;
    }
    /* Raw + word timings: per-token readings are fetched in a separate effect. */
    if (!useLessonPhraseDivision && whisperWords && whisperWords.length > 0) {
      setHiraganaReadingLoading(false);
      setHiraganaReadingError(null);
      return;
    }
    if (phraseTexts.length === 0) {
      setHiraganaReadings([]);
      return;
    }
    if (!phraseTexts.some((l) => hasKanji(l))) {
      setHiraganaReadings([]);
      setHiraganaReadingError(null);
      return;
    }

    let cancelled = false;
    setHiraganaReadingLoading(true);
    setHiraganaReadingError(null);

    void fetch("/api/japanese/batch-reading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: phraseTexts }),
    })
      .then(async (res) => {
        const data = (await res.json()) as { readings?: string[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
        const readings = data.readings ?? [];
        return readings;
      })
      .then((readings) => {
        if (cancelled) return;
        const padded = phraseTexts.map((_, i) =>
          typeof readings[i] === "string" ? readings[i]!.trim() : ""
        );
        setHiraganaReadings(padded);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setHiraganaReadings(null);
        setHiraganaReadingError(e instanceof Error ? e.message : "Could not load hiragana readings.");
      })
      .finally(() => {
        if (!cancelled) setHiraganaReadingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [japaneseDisplayMode, phraseTextsKey, phraseTexts, useLessonPhraseDivision, whisperWords]);

  useEffect(() => {
    if (japaneseDisplayMode !== "hiragana") {
      return;
    }
    if (useLessonPhraseDivision || !whisperWords?.length) {
      setHiraganaWordReadings(null);
      setHiraganaWordReadingLoading(false);
      setHiraganaWordReadingError(null);
      return;
    }

    const lines = whisperWords.map((w) => w.word);
    if (!lines.some((l) => hasKanji(l))) {
      setHiraganaWordReadings([]);
      setHiraganaWordReadingError(null);
      setHiraganaWordReadingLoading(false);
      return;
    }

    let cancelled = false;
    setHiraganaWordReadingLoading(true);
    setHiraganaWordReadingError(null);

    void fetch("/api/japanese/batch-reading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    })
      .then(async (res) => {
        const data = (await res.json()) as { readings?: string[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
        return data.readings ?? [];
      })
      .then((readings) => {
        if (cancelled) return;
        const padded = whisperWords.map((_, i) =>
          typeof readings[i] === "string" ? readings[i]!.trim() : ""
        );
        setHiraganaWordReadings(padded);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setHiraganaWordReadings(null);
        setHiraganaWordReadingError(e instanceof Error ? e.message : "Could not load hiragana readings.");
      })
      .finally(() => {
        if (!cancelled) setHiraganaWordReadingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [japaneseDisplayMode, useLessonPhraseDivision, whisperWordsReadingKey, whisperWords]);

  const decodeBlob = useCallback(async (blob: Blob, filename: string): Promise<boolean> => {
    setDecodeError(null);
    setDecoding(true);
    try {
      const ctx = new AudioContext();
      const ab = await blob.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(ab.slice(0));
      await ctx.close().catch(() => {});
      setDecodedBuffer(audioBuf);
      setSourceName(filename);
      return true;
    } catch {
      setDecodedBuffer(null);
      setSourceName(null);
      setDecodeError("Could not decode this audio format. Try WAV or MP3.");
      return false;
    } finally {
      setDecoding(false);
    }
  }, []);

  const decodeFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("audio/") && !/\.(wav|mp3|m4a|aac|ogg|webm|flac)$/i.test(file.name)) {
        setDecodeError("Please choose an audio file.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setDecodeError(`File is too large (max ${Math.round(MAX_BYTES / (1024 * 1024))} MB).`);
        return;
      }
      setLessonId(null);
      setActiveLessonRow(null);
      setLessonTitle(file.name.replace(/\.[^/.]+$/, "") || file.name);
      setLessonFilename(file.name);
      setWhisperSegments(null);
      setPhraseTexts([]);
      setPhraseSpeakers([]);
      setWhisperWords(null);
      setWhisperError(null);
      setCommittedLessonBaseline(null);
      setLessonBaselineNonce(0);
      setUseLessonPhraseDivision(true);
      setDivisionPromptOpen(false);
      setSourceFile(file);
      const decodedOk = await decodeBlob(file, file.name);
      if (decodedOk) {
        setDivisionPromptOpen(true);
      }
      if (inputRef.current) inputRef.current.value = "";
    },
    [decodeBlob]
  );

  const openLessonFromLibrary = useCallback(
    async (row: AudioLessonRow) => {
      setDecodeError(null);
      setDecoding(true);
      try {
        const blob = await fetchAudioLessonBlob(row);
        const file = new File([blob], row.filename, { type: row.mime_type || "application/octet-stream" });
        setLessonId(row.id);
        setLessonTitle(row.title);
        setLessonFilename(row.filename);
        setActiveLessonRow(row);
        setSourceFile(file);
        setWhisperSegments(row.segments.map((s) => ({ startSec: s.startSec, endSec: s.endSec })));
        setPhraseTexts(row.segments.map((s) => s.text ?? ""));
        setPhraseSpeakers(row.segments.map((s) => s.speaker ?? ""));
        setWhisperWords(null);
        setUseLessonPhraseDivision(row.phrase_division !== "raw");
        await decodeBlob(blob, row.filename);
        setMainTab("lesson");
        setLessonBaselineNonce((n) => n + 1);
      } catch (e) {
        setDecodeError(e instanceof Error ? e.message : "Could not open lesson.");
      } finally {
        setDecoding(false);
      }
    },
    [decodeBlob]
  );

  const runWhisperSegments = useCallback(
    async (divisionOverride?: "lesson" | "raw") => {
      if (!sourceFile || !decodedBuffer) return;
      if (sourceFile.size > MAX_WHISPER_BYTES) {
        setWhisperError(
          `Phrase transcription is limited to ${Math.round(MAX_WHISPER_BYTES / (1024 * 1024))} MB per request.`,
        );
        return;
      }
      const division: "lesson" | "raw" = divisionOverride ?? (useLessonPhraseDivision ? "lesson" : "raw");
      setWhisperError(null);
      setWhisperWords(null);
      setWhisperLoading(true);
      try {
        const fd = new FormData();
        fd.append("file", sourceFile);
        fd.append("language", "ja");
        fd.append("division", division);
        const res = await fetch("/api/audio/whisper-segments", { method: "POST", body: fd });
        const data = (await res.json()) as {
          segments?: { startSec: number; endSec: number; text?: string; speaker?: string }[];
          words?: { word?: string; startSec?: number; endSec?: number }[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
        const raw = data.segments ?? [];
        const payloadFrom = segmentsPayloadFromWhisperRaw(raw, decodedBuffer.duration);
        const snappedRanges = snapSegmentsToNonOverlappingSlices(
          payloadFrom.map((s) => ({ startSec: s.startSec, endSec: s.endSec })),
          decodedBuffer.sampleRate,
          decodedBuffer.length
        );
        setWhisperSegments(snappedRanges);
        setPhraseTexts(payloadFrom.map((s) => (typeof s.text === "string" ? s.text : "")));
        setPhraseSpeakers(payloadFrom.map((s) => (s.speaker?.trim() ? s.speaker.trim() : "")));
        setUseLessonPhraseDivision(division === "lesson");

        const wordsRaw = data.words;
        if (Array.isArray(wordsRaw) && wordsRaw.length > 0) {
          const parsed: TimedWord[] = [];
          for (const x of wordsRaw) {
            const word = typeof x.word === "string" ? x.word : "";
            if (!word) continue;
            const startSec =
              typeof x.startSec === "number" && Number.isFinite(x.startSec) ? Math.max(0, x.startSec) : 0;
            const endRaw =
              typeof x.endSec === "number" && Number.isFinite(x.endSec) ? Math.max(startSec, x.endSec) : startSec;
            parsed.push({ word, startSec, endSec: endRaw });
          }
          setWhisperWords(parsed.length > 0 ? parsed : null);
        } else {
          setWhisperWords(null);
        }

        const payload: AudioLessonSegment[] = snappedRanges.map((r, i) => ({
          startSec: r.startSec,
          endSec: r.endSec,
          text: payloadFrom[i]?.text,
          speaker: payloadFrom[i]?.speaker,
        }));
        const phrase_division: "lesson" | "raw" = division === "lesson" ? "lesson" : "raw";
        if (payload.length > 0) {
          try {
            const title = lessonTitle.trim() || sourceName || "Untitled";
            const storedFileLabel = lessonFilename.trim() || sourceName || "audio";
            if (lessonId) {
              await updateAudioLesson(lessonId, {
                title,
                segments: payload,
                filename: storedFileLabel,
                phrase_division,
              });
              setLibraryBump((x) => x + 1);
              const r = await getAudioLesson(lessonId);
              if (r) setActiveLessonRow(r);
              setCommittedLessonBaseline(
                serializeLessonBaseline(
                  title,
                  storedFileLabel,
                  payload.map((s) => s.text ?? ""),
                  payload.map((s) => s.speaker ?? ""),
                  payload.map((s) => ({ startSec: s.startSec, endSec: s.endSec }))
                )
              );
            } else {
              const id = await createAudioLesson({
                file: sourceFile,
                filename: storedFileLabel,
                title,
                durationSec: decodedBuffer.duration,
                sampleRate: decodedBuffer.sampleRate,
                numberOfChannels: decodedBuffer.numberOfChannels,
                segments: payload,
                phrase_division,
              });
              setLessonId(id);
              setLibraryBump((x) => x + 1);
              const r = await getAudioLesson(id);
              if (r) setActiveLessonRow(r);
              setCommittedLessonBaseline(
                serializeLessonBaseline(
                  title,
                  storedFileLabel,
                  payload.map((s) => s.text ?? ""),
                  payload.map((s) => s.speaker ?? ""),
                  payload.map((s) => ({ startSec: s.startSec, endSec: s.endSec }))
                )
              );
            }
          } catch (persistErr: unknown) {
            console.error("[audio-lesson] Could not save lesson after transcribe:", serializeUnknownError(persistErr));
          }
        }
      } catch (e) {
        setWhisperError(e instanceof Error ? e.message : "Transcription failed.");
        setWhisperSegments(null);
        setPhraseTexts([]);
        setPhraseSpeakers([]);
        setWhisperWords(null);
      } finally {
        setWhisperLoading(false);
      }
    },
    [sourceFile, decodedBuffer, lessonTitle, sourceName, lessonFilename, lessonId, useLessonPhraseDivision]
  );

  const persistLesson = useCallback(async () => {
    if (!decodedBuffer || !sourceFile || !sourceName || displaySegments.length === 0) return;
    setSaveStatus("saving");
    try {
      const payload: AudioLessonSegment[] = displaySegments.map((s, i) => ({
        startSec: s.startSec,
        endSec: s.endSec,
        text: phraseTexts[i]?.trim() || undefined,
        speaker: phraseSpeakers[i]?.trim() || undefined,
      }));
      const title = lessonTitle.trim() || sourceName;
      const storedFileLabel = lessonFilename.trim() || sourceName || "audio";
      if (lessonId) {
        await updateAudioLesson(lessonId, {
          title,
          segments: payload,
          filename: storedFileLabel,
          phrase_division: useLessonPhraseDivision ? "lesson" : "raw",
        });
        const r = await getAudioLesson(lessonId);
        if (r) setActiveLessonRow(r);
      } else {
        const id = await createAudioLesson({
          file: sourceFile,
          filename: storedFileLabel,
          title,
          durationSec: decodedBuffer.duration,
          sampleRate: decodedBuffer.sampleRate,
          numberOfChannels: decodedBuffer.numberOfChannels,
          segments: payload,
          phrase_division: useLessonPhraseDivision ? "lesson" : "raw",
        });
        setLessonId(id);
        const r = await getAudioLesson(id);
        if (r) setActiveLessonRow(r);
      }
      setCommittedLessonBaseline(
        serializeLessonBaseline(
          lessonTitle.trim() || sourceName || "",
          lessonFilename.trim() || sourceName || "audio",
          phraseTexts,
          phraseSpeakers,
          displaySegments
        )
      );
      setSaveStatus("saved");
      setLibraryBump((x) => x + 1);
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  }, [decodedBuffer, sourceFile, sourceName, displaySegments, phraseTexts, phraseSpeakers, lessonTitle, lessonFilename, lessonId, useLessonPhraseDivision]);

  const resetLesson = useCallback(() => {
    setLessonId(null);
    setLessonTitle("");
    setLessonFilename("");
    setActiveLessonRow(null);
    setDecodedBuffer(null);
    setSourceName(null);
    setSourceFile(null);
    setDecodeError(null);
    setWhisperSegments(null);
    setPhraseTexts([]);
    setPhraseSpeakers([]);
    setWhisperWords(null);
    setWhisperError(null);
    setDivisionPromptOpen(false);
    setUseLessonPhraseDivision(true);
    setQueueSession(false);
    setQueuePlaying(false);
    setQueueIndex(0);
    setQueuePositionSec(0);
    seqLoadedSrcRef.current = null;
    setJapaneseDisplayMode("original");
    setHiraganaReadings(null);
    setHiraganaReadingError(null);
    setHiraganaWordReadings(null);
    setHiraganaWordReadingError(null);
    setCommittedLessonBaseline(null);
    setLessonBaselineNonce(0);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const removeLesson = useCallback(
    async (row: AudioLessonRow) => {
      if (!window.confirm(`Delete “${row.title}”? This cannot be undone.`)) return;
      await deleteAudioLesson(row);
      setLibraryBump((x) => x + 1);
      if (lessonId === row.id) {
        resetLesson();
        setMainTab("library");
      }
    },
    [lessonId, resetLesson]
  );

  const stopQueue = useCallback(() => {
    setQueueSession(false);
    setQueuePlaying(false);
    setQueueIndex(0);
    setQueuePositionSec(0);
    seqAudioRef.current?.pause();
    seqLoadedSrcRef.current = null;
  }, []);

  const toggleQueuePlayback = useCallback(() => {
    if (clipUrls.length === 0) return;
    if (!queueSession) {
      setQueueIndex(0);
      setQueueSession(true);
      setQueuePlaying(true);
      return;
    }
    setQueuePlaying((p) => !p);
  }, [clipUrls.length, queueSession]);

  const queueGoPrevPart = useCallback(() => {
    if (clipUrls.length === 0 || !queueSession) return;
    setQueueIndex((i) => Math.max(0, i - 1));
    setQueuePlaying(true);
  }, [clipUrls.length, queueSession]);

  const queueGoNextPart = useCallback(() => {
    if (clipUrls.length === 0 || !queueSession) return;
    setQueueIndex((i) => Math.min(clipUrls.length - 1, i + 1));
    setQueuePlaying(true);
  }, [clipUrls.length, queueSession]);

  const queueSkipSeconds = useCallback(
    (delta: number) => {
      const el = seqAudioRef.current;
      if (!el || !queueSession || clipUrls.length === 0) return;
      const seg = displaySegments[queueIndex];
      const fallbackDur = seg ? seg.endSec - seg.startSec : 0;
      const cap =
        Number.isFinite(el.duration) && el.duration > 0 ? el.duration : Math.max(fallbackDur, 0.001);
      el.currentTime = Math.max(0, Math.min(cap, el.currentTime + delta));
      setQueuePositionSec(el.currentTime);
    },
    [queueSession, clipUrls.length, queueIndex, displaySegments]
  );

  const queueClipDurationSec = displaySegments[queueIndex]
    ? displaySegments[queueIndex]!.endSec - displaySegments[queueIndex]!.startSec
    : 0;
  const queueProgressPct =
    queueClipDurationSec > 0 ? Math.min(100, (queuePositionSec / queueClipDurationSec) * 100) : 0;

  const openRename = useCallback((row: AudioLessonRow) => {
    setRenameRow(row);
    setRenameValue(row.title);
    setRenameFilenameValue(row.filename);
    setRenameOpen(true);
  }, []);

  const submitRename = useCallback(async () => {
    if (!renameRow) return;
    const t = renameValue.trim();
    const fn = renameFilenameValue.trim() || renameRow.filename;
    if (!t) return;
    try {
      await updateAudioLesson(renameRow.id, { title: t, filename: fn });
      setLibraryBump((x) => x + 1);
      if (lessonId === renameRow.id) {
        setLessonTitle(t);
        setLessonFilename(fn);
        const r = await getAudioLesson(renameRow.id);
        if (r) setActiveLessonRow(r);
      }
      setRenameOpen(false);
      setRenameRow(null);
    } catch {
      window.alert("Could not rename.");
    }
  }, [renameRow, renameValue, renameFilenameValue, lessonId]);

  const isFileDragEvent = (e: React.DragEvent) =>
    e.dataTransfer.types.includes("Files") ||
    [...e.dataTransfer.items].some((item) => item.kind === "file");

  const onLibraryDragEnter = (e: React.DragEvent) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    const root = e.currentTarget as HTMLElement;
    if (e.relatedTarget instanceof Node && root.contains(e.relatedTarget)) return;
    setFileDragActive(true);
  };
  const onLibraryDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    const root = e.currentTarget as HTMLElement;
    if (e.relatedTarget instanceof Node && root.contains(e.relatedTarget)) return;
    setFileDragActive(false);
  };
  const onLibraryDragOver = (e: React.DragEvent) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onLibraryDrop = (e: React.DragEvent) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    setFileDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void decodeFile(f).then(() => setMainTab("lesson"));
  };

  const totalDurationSec = decodedBuffer ? decodedBuffer.duration : 0;
  const transcribePrimaryLabel = useMemo(() => {
    if (useLessonPhraseDivision) {
      return whisperSegments?.length ? "Regenerate phrases" : "Generate phrases";
    }
    return whisperSegments?.length ? "Transcribe again" : "Transcribe audio";
  }, [useLessonPhraseDivision, whisperSegments?.length]);
  const lessonReady = Boolean(decodedBuffer && sourceName);

  return (
    <section className="min-w-0 space-y-4" aria-label="Audio Lesson">
      <audio ref={seqAudioRef} className="sr-only" preload="auto" />

      {divisionPromptOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audio-division-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-violet-100 bg-white p-6 shadow-xl">
            <h3 id="audio-division-title" className="text-lg font-semibold text-neutral-900">
              Divide phrases for study?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              <span className="font-medium text-neutral-800">Divide into lesson parts</span> transcribes immediately and
              splits into study-sized parts. <span className="font-medium text-neutral-800">Leave as it is</span>{" "}
              transcribes immediately too, then shows one full-length player and a single flowing transcript with soft
              word highlighting (no divided parts view).
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                className="w-full rounded-xl border-2 border-neutral-200 bg-white px-4 py-3 text-left text-sm font-semibold text-neutral-900 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50"
                onClick={() => {
                  setUseLessonPhraseDivision(false);
                  setDivisionPromptOpen(false);
                  void runWhisperSegments("raw");
                }}
              >
                Leave as it is
                <span className="mt-1 block text-xs font-normal text-neutral-600">
                  Whisper runs automatically. You get one player and one transcript stream with smooth word
                  highlighting — no per-part cards.
                </span>
              </button>
              <button
                type="button"
                className="w-full rounded-xl border-2 border-neutral-900 bg-neutral-900 px-4 py-3 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800"
                onClick={() => {
                  setUseLessonPhraseDivision(true);
                  setDivisionPromptOpen(false);
                  void runWhisperSegments("lesson");
                }}
              >
                Divide into lesson parts
                <span className="mt-1 block text-xs font-normal text-neutral-300">
                  Numbered prompts, pauses, and merged lines (JLPT-style pipeline). Phrases are generated automatically.
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {renameOpen && renameRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audio-rename-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-pink-100 bg-white p-6 shadow-xl">
            <h3 id="audio-rename-title" className="text-lg font-semibold text-neutral-900">
              Rename lesson
            </h3>
            <label htmlFor="audio-rename-input" className="mt-4 block text-sm font-medium text-neutral-700">
              Title
            </label>
            <input
              id="audio-rename-input"
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="mt-2 w-full rounded-xl border border-pink-100 px-3 py-2 text-sm text-neutral-900 shadow-inner focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
              autoFocus
            />
            <label htmlFor="audio-rename-filename" className="mt-4 block text-sm font-medium text-neutral-700">
              Audio file name
            </label>
            <input
              id="audio-rename-filename"
              type="text"
              value={renameFilenameValue}
              onChange={(e) => setRenameFilenameValue(e.target.value)}
              className="mt-2 w-full rounded-xl border border-pink-100 px-3 py-2 text-sm text-neutral-900 shadow-inner focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
              placeholder="e.g. lesson.mp3"
            />
            <p className="mt-2 text-xs text-neutral-500">
              Updates the label in your library. The file in storage keeps the same location.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRenameOpen(false);
                  setRenameRow(null);
                  setRenameFilenameValue("");
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitRename()}
                className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-pink-100/90 pb-1">
        <button
          type="button"
          onClick={() => setMainTab("library")}
          className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition ${
            mainTab === "library"
              ? "border border-b-0 border-pink-100 bg-white text-pink-800 shadow-sm"
              : "text-neutral-500 hover:text-pink-700"
          }`}
        >
          Library
        </button>
        <button
          type="button"
          onClick={() => lessonReady && setMainTab("lesson")}
          disabled={!lessonReady}
          className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition ${
            mainTab === "lesson"
              ? "border border-b-0 border-pink-100 bg-white text-pink-800 shadow-sm"
              : "text-neutral-500 hover:text-pink-700 disabled:cursor-not-allowed disabled:opacity-40"
          }`}
        >
          Lesson
        </button>
      </div>

      {mainTab === "library" && (
        <div className="space-y-6">
          {localOnly && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Supabase is not configured — lessons are stored only in this browser. Add{" "}
              <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and apply the{" "}
              <code className="rounded bg-amber-100 px-1">audio_lessons</code> migration to sync across devices.
            </p>
          )}
          <div
            className="relative rounded-2xl border-2 border-dashed border-pink-200/90 bg-gradient-to-b from-pink-50/80 to-white p-6 shadow-inner sm:p-10"
            onDragEnter={onLibraryDragEnter}
            onDragLeave={onLibraryDragLeave}
            onDragOver={onLibraryDragOver}
            onDrop={onLibraryDrop}
          >
            {fileDragActive && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-rose-50/95 backdrop-blur-sm">
                <p className="text-lg font-semibold text-pink-900">Drop audio here</p>
              </div>
            )}
            <div className="text-center">
              <h2 className="text-lg font-semibold text-neutral-900">Add audio</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
                Upload a file, open the Lesson tab, then generate phrases and study with playback below.
              </p>
              <label className="mt-6 inline-block cursor-pointer rounded-xl bg-gradient-to-b from-pink-500 to-rose-500 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-pink-200/40 transition hover:from-pink-600 hover:to-rose-600">
                {decoding ? "Decoding…" : "Choose audio file"}
                <input
                  ref={inputRef}
                  type="file"
                  accept="audio/*"
                  className="sr-only"
                  disabled={decoding}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void decodeFile(f).then(() => setMainTab("lesson"));
                  }}
                />
              </label>
            </div>
            {decodeError && (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">
                {decodeError}
              </p>
            )}
            {decoding && (
              <p className="mt-4 flex items-center justify-center gap-2 text-sm text-neutral-500">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-pink-200 border-t-pink-600" />
                Loading…
              </p>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-pink-600/90">Saved lessons</h3>
            {libraryLoading ? (
              <p className="mt-3 text-sm text-neutral-500">Loading…</p>
            ) : libraryLessons.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-pink-100 bg-pink-50/30 px-4 py-10 text-center text-sm text-neutral-600">
                No lessons yet. Upload audio above and generate phrases on the Lesson tab.
              </p>
            ) : (
              <ul key={libraryBump} className="mt-3 grid gap-3 sm:grid-cols-2">
                {libraryLessons.map((row) => (
                  <li key={row.id}>
                    <div className="flex flex-col rounded-2xl border border-pink-100/90 bg-white p-4 shadow-sm shadow-pink-100/40">
                      <button
                        type="button"
                        onClick={() => void openLessonFromLibrary(row)}
                        className="flex w-full flex-col text-left transition hover:opacity-90"
                      >
                        <span className="break-words font-semibold text-neutral-900">{row.title}</span>
                        <span className="mt-1 break-all text-xs text-neutral-500">{row.filename}</span>
                        <span className="mt-2 text-xs text-pink-700">
                          {row.segments.length} segment{row.segments.length === 1 ? "" : "s"} ·{" "}
                          {formatDuration(row.duration_sec)} · {formatDate(row.updated_at)}
                        </span>
                      </button>
                      <div className="mt-3 flex flex-wrap gap-3 border-t border-pink-50 pt-3">
                        <button
                          type="button"
                          onClick={() => openRename(row)}
                          className="text-xs font-semibold text-pink-700 hover:underline"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeLesson(row)}
                          className="text-xs font-semibold text-rose-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {mainTab === "lesson" && lessonReady && (
        <div className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-neutral-800">Lesson details</h2>
                {lessonHasUnsavedChanges && displaySegments.length > 0 && (
                  <span className="text-xs font-medium text-amber-800">Unsaved changes</span>
                )}
              </div>
              <label htmlFor="lesson-title-input" className="mt-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
                Lesson title
              </label>
              <input
                id="lesson-title-input"
                type="text"
                value={lessonTitle}
                onChange={(e) => setLessonTitle(e.target.value)}
                className="mt-1 w-full max-w-xl rounded-xl border border-pink-100 px-3 py-2 text-base font-semibold text-neutral-900 shadow-inner focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
                placeholder="Lesson title"
              />
              <label htmlFor="lesson-filename-input" className="mt-3 block text-xs font-medium uppercase tracking-wide text-neutral-500">
                Audio file name
              </label>
              <input
                id="lesson-filename-input"
                type="text"
                value={lessonFilename}
                onChange={(e) => setLessonFilename(e.target.value)}
                className="mt-1 w-full max-w-xl rounded-xl border border-pink-100 px-3 py-2 text-sm text-neutral-800 shadow-inner focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
                placeholder="e.g. dialogue.mp3"
              />
              <p className="mt-1 text-xs text-neutral-500">
                {formatDuration(totalDurationSec)} · {decodedBuffer!.sampleRate} Hz · {decodedBuffer!.numberOfChannels} ch
                {lessonId && <span className="text-pink-600"> · Synced</span>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:pt-6">
              {displaySegments.length > 0 &&
                (lessonHasUnsavedChanges || saveStatus === "saving" || saveStatus === "saved" || saveStatus === "error") && (
                  <button
                    type="button"
                    onClick={() => void persistLesson()}
                    disabled={saveStatus === "saving"}
                    className="rounded-xl border border-pink-300 bg-pink-50 px-4 py-2 text-sm font-semibold text-pink-900 shadow-sm transition hover:bg-pink-100 disabled:opacity-45"
                  >
                    {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved!" : saveStatus === "error" ? "Retry save" : "Save lesson"}
                  </button>
                )}
              {(activeLessonRow || lessonId) && (
                <button
                  type="button"
                  onClick={() => {
                    const row = activeLessonRow;
                    if (row) void removeLesson(row);
                    else if (lessonId)
                      void getAudioLesson(lessonId).then((r) => {
                        if (r) void removeLesson(r);
                      });
                  }}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100"
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  resetLesson();
                  setMainTab("library");
                }}
                className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
              >
                Close
              </button>
            </div>
          </div>

          {!useLessonPhraseDivision && fullSourceUrl && (
            <div className="rounded-2xl border border-pink-200/80 bg-gradient-to-br from-pink-50/50 via-white to-violet-50/50 p-1 shadow-md shadow-pink-200/20 ring-1 ring-violet-100/60 sm:p-1.5">
              <div className="rounded-[1.15rem] border border-white/80 bg-white/90 p-4 sm:p-6">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div>
                    <h3 className="text-base font-semibold tracking-tight text-violet-950">Listen first</h3>
                    <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-pink-600/90">
                      Full file · word follow-along
                    </p>
                  </div>
                  <p className="max-w-xl text-xs leading-relaxed text-neutral-600 sm:text-right">
                    <span className="font-medium text-violet-800">Violet</span> = current word. Lighter grays = already
                    played vs upcoming.
                  </p>
                </div>

                <div className="mt-5">
                  <FullSourceAudioBar
                    audioUrl={fullSourceUrl}
                    nominalDurationSec={totalDurationSec}
                    disabled={whisperLoading}
                    onTimeSec={setFullListenSec}
                  />
                </div>

                {(whisperWords && whisperWords.length > 0) || displaySegments.length > 0 ? (
                  <div className="mt-6 space-y-3">
                    <div className="rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50/40 to-pink-50/30 p-3 sm:p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-800/90">
                        Reading
                      </p>
                      <div
                        className="mt-2.5 flex flex-wrap gap-1.5"
                        role="tablist"
                        aria-label="Japanese script for transcript"
                      >
                        {(
                          [
                            { mode: "original" as const, label: "As transcribed" },
                            { mode: "hiragana" as const, label: "Hiragana" },
                            { mode: "katakana" as const, label: "Katakana" },
                            { mode: "romaji" as const, label: "Romaji" },
                          ] as const
                        ).map(({ mode, label }) => {
                          const on = japaneseDisplayMode === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              role="tab"
                              aria-selected={on}
                              onClick={() => setJapaneseDisplayMode(mode)}
                              className={`rounded-lg px-2.5 py-2 text-[11px] font-semibold transition sm:px-3 sm:text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 ${
                                on
                                  ? "bg-gradient-to-b from-violet-600 to-pink-600 text-white shadow-md shadow-violet-300/30"
                                  : "border border-violet-100/90 bg-white/90 text-neutral-600 shadow-sm hover:border-pink-200 hover:bg-pink-50/60 hover:text-violet-900"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      {japaneseDisplayMode === "hiragana" && whisperWords && whisperWords.length > 0 ? (
                        hiraganaWordReadingLoading ? (
                          <p className="mt-3 flex items-center gap-2 text-xs text-violet-700">
                            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
                            Loading readings per word…
                          </p>
                        ) : hiraganaWordReadingError ? (
                          <p className="mt-3 text-xs leading-snug text-red-700" role="status">
                            {hiraganaWordReadingError}{" "}
                            <span className="text-neutral-600">Falling back to katakana→hiragana where possible.</span>
                          </p>
                        ) : null
                      ) : japaneseDisplayMode === "hiragana" &&
                        displaySegments.length > 0 &&
                        (!whisperWords || whisperWords.length === 0) ? (
                        hiraganaReadingLoading ? (
                          <p className="mt-3 flex items-center gap-2 text-xs text-violet-700">
                            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
                            Loading hiragana…
                          </p>
                        ) : hiraganaReadingError ? (
                          <p className="mt-3 text-xs leading-snug text-red-700" role="status">
                            {hiraganaReadingError}{" "}
                            <span className="text-neutral-600">Falling back to katakana→hiragana where possible.</span>
                          </p>
                        ) : null
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-pink-100/90 bg-gradient-to-b from-white to-violet-50/20 px-4 py-5 shadow-inner shadow-violet-100/30 sm:px-6 sm:py-6">
                      {whisperWords && whisperWords.length > 0 ? (
                        <WordTimedHighlighter
                          words={whisperWords}
                          currentTimeSec={fullListenSec}
                          variant="raw"
                          displayMode={japaneseDisplayMode}
                          hiraganaPerWord={hiraganaWordReadings}
                        />
                      ) : displaySegments.length > 0 ? (
                        <>
                          <p className="text-lg leading-relaxed text-neutral-800 sm:text-xl" lang="ja">
                            {phraseTexts
                              .map((tx, i) =>
                                formatJapaneseForDisplay(tx.trim(), japaneseDisplayMode, hiraganaReadings?.[i])
                              )
                              .filter(Boolean)
                              .join(" ")}
                          </p>
                          <p className="mt-4 rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs leading-snug text-amber-950">
                            No word-level timestamps in this response. Use a backend that returns timed words (e.g.
                            OpenAI) for follow-along highlighting, then tap <span className="font-semibold">Transcribe again</span>.
                          </p>
                        </>
                      ) : whisperLoading ? (
                        <p className="flex items-center gap-2 text-sm font-medium text-violet-900">
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-violet-200 border-t-violet-700" />
                          Transcribing with Whisper…
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : whisperLoading ? (
                  <div className="mt-6 rounded-xl border border-violet-100 bg-violet-50/40 px-4 py-8 text-center">
                    <p className="inline-flex items-center gap-2 text-sm font-medium text-violet-900">
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-violet-200 border-t-violet-700" />
                      Transcribing with Whisper…
                    </p>
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-pink-100/80 pt-5">
                  {whisperError ? (
                    <p className="w-full text-sm text-red-800" role="alert">
                      {whisperError}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    disabled={whisperLoading || !sourceFile || sourceFile.size > MAX_WHISPER_BYTES}
                    onClick={() => void runWhisperSegments("raw")}
                    className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-900 shadow-sm transition hover:border-violet-300 hover:bg-violet-50/80 disabled:opacity-50"
                  >
                    {whisperLoading ? (
                      <>
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-violet-200 border-t-violet-700" />
                        Transcribing…
                      </>
                    ) : (
                      transcribePrimaryLabel
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={whisperLoading}
                    onClick={() => setDivisionPromptOpen(true)}
                    className="rounded-xl border border-pink-200 bg-pink-50/90 px-4 py-2.5 text-sm font-semibold text-pink-900 shadow-sm transition hover:bg-pink-100 disabled:opacity-45"
                  >
                    Change split mode
                  </button>
                </div>
              </div>
            </div>
          )}

          {useLessonPhraseDivision && (
          <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm text-neutral-800">
            <p className="font-medium text-violet-950">Phrase transcription</p>
            {lessonReady && (
              <p className="mt-2 text-xs text-neutral-600">
                Phrases:{" "}
                <span className="font-medium text-violet-900">Divided (lesson-style cuts + merge)</span>
                <button
                  type="button"
                  className="ml-2 rounded-md text-violet-700 underline decoration-violet-300 decoration-1 underline-offset-2 hover:text-violet-900"
                  onClick={() => setDivisionPromptOpen(true)}
                >
                  Change
                </button>
              </p>
            )}
            {whisperError && (
              <p className="mt-2 text-sm text-red-800" role="alert">
                {whisperError}
              </p>
            )}
            <button
              type="button"
              disabled={whisperLoading || !sourceFile || sourceFile.size > MAX_WHISPER_BYTES}
              onClick={() => void runWhisperSegments()}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-900 shadow-sm hover:bg-violet-50 disabled:opacity-50"
            >
              {whisperLoading ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-violet-200 border-t-violet-700" />
                  Transcribing…
                </>
              ) : (
                transcribePrimaryLabel
              )}
            </button>
          </div>
          )}

          {useLessonPhraseDivision && displaySegments.length > 0 && (
            <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/90 to-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-700">Full transcript</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor="audio-lesson-script-mode" className="text-xs font-medium text-neutral-600">
                        Japanese display
                      </label>
                      <select
                        id="audio-lesson-script-mode"
                        value={japaneseDisplayMode}
                        onChange={(e) => setJapaneseDisplayMode(e.target.value as JapaneseDisplayMode)}
                        className="rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs font-medium text-neutral-800 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                      >
                        <option value="original">As transcribed</option>
                        <option value="hiragana">Hiragana</option>
                        <option value="katakana">Katakana</option>
                        <option value="romaji">Romaji</option>
                      </select>
                    </div>
                  </div>
                  {japaneseDisplayMode === "hiragana" && hiraganaReadingLoading && (
                    <p className="mt-2 text-xs text-violet-700">Loading hiragana readings…</p>
                  )}
                  {japaneseDisplayMode === "hiragana" && hiraganaReadingError && (
                    <p className="mt-2 text-xs text-red-700" role="status">
                      {hiraganaReadingError} Showing katakana→hiragana where possible.
                    </p>
                  )}
                  {fullDisplayTranscript ? (
                    <p
                      className="mt-4 text-xl leading-relaxed text-neutral-900 sm:text-2xl sm:leading-relaxed"
                      lang="ja"
                      style={{ wordBreak: "break-word" }}
                    >
                      {fullDisplayTranscript}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-neutral-600">Generate phrases above to fill the transcript.</p>
                  )}
                </div>
                <div className="flex w-full shrink-0 flex-col gap-3 lg:max-w-[min(22rem,100%)] lg:self-start">
                  <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Playback — all parts
                  </span>
                  <div
                    className="rounded-2xl border border-violet-200/90 bg-gradient-to-br from-violet-50/90 via-white to-pink-50/70 p-3 shadow-inner shadow-violet-100/40"
                    role="group"
                    aria-label="Sequential playback for all phrase clips"
                  >
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200/90 bg-white text-violet-900 shadow-sm transition hover:border-pink-300 hover:bg-pink-50/80 disabled:opacity-35"
                        aria-label="Previous part"
                        disabled={clipUrls.length === 0 || !queueSession || queueIndex === 0}
                        onClick={queueGoPrevPart}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M8 5v14l11-7-11-7zM6 5h2v14H6V5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200/90 bg-white text-violet-900 shadow-sm transition hover:border-pink-300 hover:bg-pink-50/80 disabled:opacity-35"
                        aria-label="Rewind 5 seconds"
                        disabled={clipUrls.length === 0 || !queueSession}
                        onClick={() => queueSkipSeconds(-5)}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M11 18V6l-8 6 8 6zm11 0V6l-8 6 8 6z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-b from-violet-600 to-pink-600 text-white shadow-lg shadow-violet-300/35 transition hover:from-violet-700 hover:to-pink-700 disabled:opacity-40"
                        aria-label={queueSession && queuePlaying ? "Pause" : "Play all parts"}
                        disabled={clipUrls.length === 0}
                        onClick={toggleQueuePlayback}
                      >
                        {queueSession && queuePlaying ? (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <rect x="6" y="5" width="4" height="14" rx="1" />
                            <rect x="14" y="5" width="4" height="14" rx="1" />
                          </svg>
                        ) : (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="ml-0.5">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200/90 bg-white text-violet-900 shadow-sm transition hover:border-pink-300 hover:bg-pink-50/80 disabled:opacity-35"
                        aria-label="Forward 5 seconds"
                        disabled={clipUrls.length === 0 || !queueSession}
                        onClick={() => queueSkipSeconds(5)}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M13 6v12l8-6-8-6zm-11 0v12l8-6-8-6z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200/90 bg-white text-violet-900 shadow-sm transition hover:border-pink-300 hover:bg-pink-50/80 disabled:opacity-35"
                        aria-label="Next part"
                        disabled={
                          clipUrls.length === 0 || !queueSession || queueIndex >= clipUrls.length - 1
                        }
                        onClick={queueGoNextPart}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M16 5v14l-11-7 11-7zM18 5h2v14h-2V5z" />
                        </svg>
                      </button>
                    </div>
                    <div className="mt-3 px-0.5">
                      <div className="h-2 overflow-hidden rounded-full bg-violet-100/90">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-600 via-pink-500 to-rose-400 transition-[width] duration-100 ease-linear"
                          style={{ width: `${queueProgressPct}%` }}
                        />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[11px] tabular-nums text-neutral-600">
                        <span>
                          {queueSession
                            ? `Part ${queueIndex + 1} / ${clipUrls.length}`
                            : `${clipUrls.length} parts ready`}
                        </span>
                        <span>
                          {formatClock(queuePositionSec)} /{" "}
                          {formatClock(queueClipDurationSec > 0 ? queueClipDurationSec : 0)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={stopQueue}
                      disabled={!queueSession}
                      className="mt-3 w-full rounded-lg border border-pink-200/90 bg-pink-50/70 py-2 text-xs font-semibold text-pink-900 shadow-sm transition hover:bg-pink-100 disabled:opacity-40"
                    >
                      Stop & reset
                    </button>
                  </div>
                  <p className="max-w-[18rem] text-xs leading-snug text-neutral-500">
                    Per-part players are below.
                  </p>
                </div>
              </div>
            </div>
          )}

          {useLessonPhraseDivision && (
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">Parts ({displaySegments.length})</h3>
            {displaySegments.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-600">
                {whisperLoading ? "Transcribing…" : "Generate phrases above to create timed segments and transcript."}
              </p>
            ) : (
              <ul className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                {displaySegments.map((seg, i) => {
                  const dur = seg.endSec - seg.startSec;
                  const url = clipUrls[i];
                  const phrase = phraseTexts[i]?.trim() ?? "";
                  const displayLine = displayedPhraseLines[i] ?? phrase;
                  const highlight = queueSession && queueIndex === i;
                  const sp = phraseSpeakers[i]?.trim();
                  return (
                    <li
                      key={`${seg.startSec}-${seg.endSec}-${i}`}
                      className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${
                        highlight ? "border-violet-400 bg-violet-50/80 ring-2 ring-violet-200" : "border-pink-100/90 bg-white"
                      }`}
                    >
                      <div className="flex min-h-full flex-col gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-pink-600/90">
                            Part {i + 1}
                            {sp ? (
                              <span className="font-semibold normal-case text-violet-700"> · {sp}</span>
                            ) : null}{" "}
                            <span className="font-normal normal-case text-neutral-500">
                              · {formatDuration(dur)} · {seg.startSec.toFixed(2)}s–{seg.endSec.toFixed(2)}s
                            </span>
                          </p>
                          {displayLine.trim() || phrase ? (
                            <p className="mt-3 text-lg leading-relaxed text-neutral-900 sm:text-xl" lang="ja">
                              {displayLine.trim() || phrase}
                            </p>
                          ) : (
                            <p className="mt-2 text-sm italic text-neutral-400">No text for this segment</p>
                          )}
                          {url ? (
                            <PartAudioControls
                              url={url}
                              clipDurationSec={dur}
                              partLabel={`part ${i + 1}`}
                            />
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          )}

        </div>
      )}

      {mainTab === "lesson" && !lessonReady && (
        <div className="rounded-2xl border border-dashed border-pink-200 bg-pink-50/40 px-6 py-12 text-center">
          <p className="text-sm text-neutral-700">Choose or open a lesson from the Library tab.</p>
          <button
            type="button"
            onClick={() => setMainTab("library")}
            className="mt-4 text-sm font-semibold text-pink-700 hover:underline"
          >
            Go to Library
          </button>
        </div>
      )}
    </section>
  );
}
