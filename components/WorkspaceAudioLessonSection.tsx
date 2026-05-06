"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeAudioBufferToWav, sliceAudioBuffer, type AudioSegmentRange } from "@/lib/audio-silence-segment";
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
  raw: { startSec: number; endSec: number; text?: string }[],
  durationSec: number
): AudioLessonSegment[] {
  const out: AudioLessonSegment[] = [];
  for (const r of raw) {
    const startSec = Math.max(0, Math.min(r.startSec, durationSec));
    const endSec = Math.max(0, Math.min(r.endSec, durationSec));
    if (endSec - startSec <= 0.02) continue;
    const text = typeof r.text === "string" ? r.text.trim() || undefined : undefined;
    out.push({ startSec, endSec, text });
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
  segments: { startSec: number; endSec: number }[]
): string {
  return JSON.stringify({
    t: title.trim(),
    f: filename.trim(),
    p: phrases,
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
  const [whisperLoading, setWhisperLoading] = useState(false);
  const [whisperError, setWhisperError] = useState<string | null>(null);

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
    return clampAudioSegments(whisperSegments, decodedBuffer.duration);
  }, [decodedBuffer, whisperSegments]);

  const currentLessonBaseline = useMemo(
    () =>
      serializeLessonBaseline(lessonTitle, lessonFilename, phraseTexts, displaySegments),
    [lessonTitle, lessonFilename, phraseTexts, displaySegments]
  );

  const lessonHasUnsavedChanges =
    displaySegments.length > 0 &&
    (committedLessonBaseline === null || currentLessonBaseline !== committedLessonBaseline);

  useEffect(() => {
    if (lessonBaselineNonce === 0) return;
    setCommittedLessonBaseline(
      serializeLessonBaseline(lessonTitle, lessonFilename, phraseTexts, displaySegments)
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
  }, [displaySegments.length]);

  const [clipUrls, setClipUrls] = useState<string[]>([]);

  useEffect(() => {
    const urls: string[] = [];
    if (decodedBuffer && displaySegments.length > 0) {
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
  }, [decodedBuffer, displaySegments]);

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

  const displayedPhraseLines = useMemo(() => {
    return phraseTexts.map((t, i) =>
      formatJapaneseForDisplay(t, japaneseDisplayMode, hiraganaReadings?.[i])
    );
  }, [phraseTexts, japaneseDisplayMode, hiraganaReadings]);

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
  }, [japaneseDisplayMode, phraseTextsKey, phraseTexts]);

  const decodeBlob = useCallback(async (blob: Blob, filename: string) => {
    setDecodeError(null);
    setDecoding(true);
    try {
      const ctx = new AudioContext();
      const ab = await blob.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(ab.slice(0));
      await ctx.close().catch(() => {});
      setDecodedBuffer(audioBuf);
      setSourceName(filename);
    } catch {
      setDecodedBuffer(null);
      setSourceName(null);
      setDecodeError("Could not decode this audio format. Try WAV or MP3.");
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
      setWhisperError(null);
      setCommittedLessonBaseline(null);
      setLessonBaselineNonce(0);
      setSourceFile(file);
      await decodeBlob(file, file.name);
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

  const runWhisperSegments = useCallback(async () => {
    if (!sourceFile || !decodedBuffer) return;
    if (sourceFile.size > MAX_WHISPER_BYTES) {
      setWhisperError(`Phrase transcription is limited to ${Math.round(MAX_WHISPER_BYTES / (1024 * 1024))} MB per request.`);
      return;
    }
    setWhisperError(null);
    setWhisperLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", sourceFile);
      fd.append("language", "ja");
      const res = await fetch("/api/audio/whisper-segments", { method: "POST", body: fd });
      const data = (await res.json()) as {
        segments?: { startSec: number; endSec: number; text?: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      const raw = data.segments ?? [];
      setWhisperSegments(raw.map((s) => ({ startSec: s.startSec, endSec: s.endSec })));
      setPhraseTexts(raw.map((s) => (typeof s.text === "string" ? s.text : "")));

      const payload = segmentsPayloadFromWhisperRaw(raw, decodedBuffer.duration);
      if (payload.length > 0) {
        try {
          const title = lessonTitle.trim() || sourceName || "Untitled";
          const storedFileLabel = lessonFilename.trim() || sourceName || "audio";
          if (lessonId) {
            await updateAudioLesson(lessonId, { title, segments: payload, filename: storedFileLabel });
            setLibraryBump((x) => x + 1);
            const r = await getAudioLesson(lessonId);
            if (r) setActiveLessonRow(r);
            setCommittedLessonBaseline(
              serializeLessonBaseline(
                title,
                storedFileLabel,
                payload.map((s) => s.text ?? ""),
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
                payload.map((s) => ({ startSec: s.startSec, endSec: s.endSec }))
              )
            );
          }
        } catch (persistErr) {
          console.error(persistErr);
        }
      }
    } catch (e) {
      setWhisperError(e instanceof Error ? e.message : "Transcription failed.");
      setWhisperSegments(null);
      setPhraseTexts([]);
    } finally {
      setWhisperLoading(false);
    }
  }, [sourceFile, decodedBuffer, lessonTitle, sourceName, lessonFilename, lessonId]);

  const persistLesson = useCallback(async () => {
    if (!decodedBuffer || !sourceFile || !sourceName || displaySegments.length === 0) return;
    setSaveStatus("saving");
    try {
      const payload: AudioLessonSegment[] = displaySegments.map((s, i) => ({
        startSec: s.startSec,
        endSec: s.endSec,
        text: phraseTexts[i]?.trim() || undefined,
      }));
      const title = lessonTitle.trim() || sourceName;
      const storedFileLabel = lessonFilename.trim() || sourceName || "audio";
      if (lessonId) {
        await updateAudioLesson(lessonId, { title, segments: payload, filename: storedFileLabel });
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
          displaySegments
        )
      );
      setSaveStatus("saved");
      setLibraryBump((x) => x + 1);
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  }, [decodedBuffer, sourceFile, sourceName, displaySegments, phraseTexts, lessonTitle, lessonFilename, lessonId]);

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
    setWhisperError(null);
    setQueueSession(false);
    setQueuePlaying(false);
    setQueueIndex(0);
    setQueuePositionSec(0);
    seqLoadedSrcRef.current = null;
    setJapaneseDisplayMode("original");
    setHiraganaReadings(null);
    setHiraganaReadingError(null);
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
  const lessonReady = Boolean(decodedBuffer && sourceName);

  return (
    <section className="min-w-0 space-y-4" aria-label="Audio Lesson">
      <audio ref={seqAudioRef} className="sr-only" preload="auto" />

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

          <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm text-neutral-800">
            <p className="font-medium text-violet-950">Phrase transcription</p>
            <p className="mt-1 text-xs text-neutral-600">
              Generates timed phrases and Japanese text, then saves them to your library automatically.
            </p>
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
              ) : whisperSegments?.length ? (
                "Regenerate phrases"
              ) : (
                "Generate phrases"
              )}
            </button>
          </div>

          {displaySegments.length > 0 && (
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
                            Part {i + 1}{" "}
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
