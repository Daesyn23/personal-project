"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ALARM_SOUND_OPTIONS,
  computeAlarmFadeOutSeconds,
  type AlarmSoundId,
  parseStoredAlarmDuration,
  parseStoredAlarmSound,
  playTimerAlarm,
  playTimerAlarmPreview,
  TIMER_ALARM_DURATION_DEFAULT_SECONDS,
  TIMER_ALARM_DURATION_MAX,
  TIMER_ALARM_DURATION_MIN,
  TIMER_ALARM_DURATION_STORAGE_KEY,
  TIMER_ALARM_PREVIEW_DURATION_SECONDS,
  TIMER_ALARM_STORAGE_KEY,
} from "@/lib/timerAlarmSounds";

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Max 99 h 59 m 59 s — enough for long study blocks. */
const MAX_DURATION_SECONDS = 99 * 3600 + 59 * 60 + 59;

function parseDurationHms(hoursRaw: string, minutesRaw: string, secondsRaw: string): number {
  const h = clampInt(Number.parseInt(hoursRaw, 10) || 0, 0, 99);
  const m = clampInt(Number.parseInt(minutesRaw, 10) || 0, 0, 59);
  const s = clampInt(Number.parseInt(secondsRaw, 10) || 0, 0, 59);
  const total = h * 3600 + m * 60 + s;
  return Math.min(MAX_DURATION_SECONDS, total);
}

function formatClock(totalSeconds: number): string {
  const sec = clampInt(totalSeconds, 0, MAX_DURATION_SECONDS);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const r = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  const mm = Math.floor(sec / 60);
  return `${String(mm).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** Fullscreen clock as flex segments — avoids reflow into two lines when spaces would wrap. */
function fullscreenColonSep() {
  return (
    <span className="shrink-0 px-0.5 tabular-nums sm:px-1" aria-hidden>
      {"\u00a0:\u00a0"}
    </span>
  );
}

function FullscreenClockFace({ totalSeconds, finished }: { totalSeconds: number; finished: boolean }) {
  if (finished) {
    return (
      <>
        <span className="tabular-nums">00</span>
        {fullscreenColonSep()}
        <span className="tabular-nums">00</span>
      </>
    );
  }
  const raw = formatClock(totalSeconds);
  const parts = raw.split(":");
  if (parts.length === 3) {
    return (
      <>
        <span className="tabular-nums">{parts[0]}</span>
        {fullscreenColonSep()}
        <span className="tabular-nums">{parts[1]}</span>
        {fullscreenColonSep()}
        <span className="tabular-nums">{parts[2]}</span>
      </>
    );
  }
  return (
    <>
      <span className="tabular-nums">{parts[0]}</span>
      {fullscreenColonSep()}
      <span className="tabular-nums">{parts[1]}</span>
    </>
  );
}

/** Non-fullscreen compact clock — same flex-nowrap guarantee for long h:mm:ss. */
function compactColonSep() {
  return (
    <span className="shrink-0" aria-hidden>
      :
    </span>
  );
}

function CompactClockFace({ totalSeconds, finished }: { totalSeconds: number; finished: boolean }) {
  if (finished) {
    return (
      <>
        <span className="tabular-nums">00</span>
        {compactColonSep()}
        <span className="tabular-nums">00</span>
      </>
    );
  }
  const raw = formatClock(totalSeconds);
  const parts = raw.split(":");
  if (parts.length === 3) {
    return (
      <>
        <span className="tabular-nums">{parts[0]}</span>
        {compactColonSep()}
        <span className="tabular-nums">{parts[1]}</span>
        {compactColonSep()}
        <span className="tabular-nums">{parts[2]}</span>
      </>
    );
  }
  return (
    <>
      <span className="tabular-nums">{parts[0]}</span>
      {compactColonSep()}
      <span className="tabular-nums">{parts[1]}</span>
    </>
  );
}

/** Sakura firework burst from center when time’s up; cleared after animation. */
const FINISH_FIREWORK_PETAL_COUNT = 96;
const FINISH_FIREWORK_CLEAR_MS = 4000;

function buildSakuraFireworkPetals(seed: number, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const baseAngle = (i / count) * Math.PI * 2;
    const jitter = ((((i * 47 + seed * 9) % 360) - 180) * Math.PI) / 180 * 0.18;
    const angle = baseAngle + jitter;
    const dist = 215 + ((i * 73 + seed * 5) % 480);
    const dx = Math.round(Math.cos(angle) * dist * 10) / 10;
    const dy =
      Math.round((Math.sin(angle) * dist * 0.62 + dist * 0.17 + 28 + ((i * 11 + seed) % 36)) * 10) / 10;
    const rot = ((i * 97 + seed * 3) % 720) - 360;
    const delay = ((i % 7) * 0.026);
    const dur = 2.2 + ((i * 13 + seed) % 80) / 100;
    const w = 7 + (i % 5);
    const h = 10 + (i % 6);
    return { id: `timer-fw-${seed}-${i}`, dx, dy, rot, delay, dur, w, h };
  });
}

const inputNumberClass =
  "w-full min-w-0 rounded-xl border-2 border-pink-200/90 bg-white px-3 py-3 text-center text-lg font-semibold tabular-nums text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus:border-pink-400 focus:ring-2 focus:ring-pink-200/80 disabled:cursor-not-allowed disabled:bg-pink-50/50 disabled:opacity-70 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const btnPrimaryClass =
  "inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 px-5 text-sm font-semibold text-white shadow-md shadow-pink-300/40 transition hover:brightness-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2";

const btnSecondaryClass =
  "inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border-2 border-pink-300/90 bg-white px-4 text-sm font-semibold text-pink-900 shadow-sm transition hover:border-pink-400 hover:bg-pink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 focus-visible:ring-offset-2";

const btnNeutralClass =
  "inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border-2 border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 shadow-sm transition hover:border-neutral-400 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 focus-visible:ring-offset-2";

const dockBtnPrimary =
  "inline-flex min-h-[52px] items-center justify-center rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 px-3 text-sm font-semibold text-white shadow-md shadow-pink-900/20 transition hover:brightness-[1.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-40";

const dockBtnOutlinePink =
  "inline-flex min-h-[52px] items-center justify-center rounded-xl border-2 border-pink-400/90 bg-white px-3 text-sm font-semibold text-pink-900 shadow-sm transition hover:bg-pink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-40";

const dockBtnOutlineNeutral =
  "inline-flex min-h-[52px] items-center justify-center rounded-xl border-2 border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-800 shadow-sm transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

function TimerSoundSettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c0 .69.28 1.32.74 1.78.46.46 1.09.74 1.78.74H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WorkspaceTimerSection() {
  const panelRef = useRef<HTMLDivElement>(null);
  const playedFinishChimeRef = useRef(false);
  const previewHandleRef = useRef<ReturnType<typeof playTimerAlarmPreview> | null>(null);
  const [alarmSoundOpen, setAlarmSoundOpen] = useState(false);
  const [alarmSoundId, setAlarmSoundId] = useState<AlarmSoundId>(() => {
    if (typeof window === "undefined") return "soft-melody";
    try {
      return parseStoredAlarmSound(localStorage.getItem(TIMER_ALARM_STORAGE_KEY));
    } catch {
      return "soft-melody";
    }
  });
  const [alarmDurationSeconds, setAlarmDurationSeconds] = useState(() => {
    if (typeof window === "undefined") return TIMER_ALARM_DURATION_DEFAULT_SECONDS;
    try {
      return parseStoredAlarmDuration(localStorage.getItem(TIMER_ALARM_DURATION_STORAGE_KEY));
    } catch {
      return TIMER_ALARM_DURATION_DEFAULT_SECONDS;
    }
  });
  const [hoursInput, setHoursInput] = useState("0");
  const [minutesInput, setMinutesInput] = useState("5");
  const [secondsInput, setSecondsInput] = useState("0");
  const [durationSeconds, setDurationSeconds] = useState(300);
  const [remainingSeconds, setRemainingSeconds] = useState(300);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  /** First 5s after time's up: alternating colors; then solid red. */
  const [finishDigitPhase, setFinishDigitPhase] = useState<"none" | "pulse" | "solid">("none");
  const [finishBurstKey, setFinishBurstKey] = useState(0);
  const [showFinishFirework, setShowFinishFirework] = useState(false);

  const syncDurationFromInputs = useCallback(() => {
    const next = parseDurationHms(hoursInput, minutesInput, secondsInput);
    if (next <= 0) return false;
    setDurationSeconds(next);
    setRemainingSeconds(next);
    setFinished(false);
    return true;
  }, [hoursInput, minutesInput, secondsInput]);

  useEffect(() => {
    try {
      localStorage.setItem(TIMER_ALARM_STORAGE_KEY, alarmSoundId);
    } catch {
      /* quota or private mode */
    }
  }, [alarmSoundId]);

  useEffect(() => {
    try {
      localStorage.setItem(TIMER_ALARM_DURATION_STORAGE_KEY, String(alarmDurationSeconds));
    } catch {
      /* quota or private mode */
    }
  }, [alarmDurationSeconds]);

  const stopAlarmPreview = useCallback(() => {
    previewHandleRef.current?.cancel();
    previewHandleRef.current = null;
  }, []);

  const playAlarmPreview = useCallback(
    (id: AlarmSoundId) => {
      stopAlarmPreview();
      previewHandleRef.current = playTimerAlarmPreview(id);
    },
    [stopAlarmPreview]
  );

  useEffect(() => {
    return () => stopAlarmPreview();
  }, [stopAlarmPreview]);

  useEffect(() => {
    if (!alarmSoundOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAlarmSoundOpen(false);
        stopAlarmPreview();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [alarmSoundOpen, stopAlarmPreview]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running || remainingSeconds !== 0) return;
    setFinished(true);
    setRunning(false);
  }, [running, remainingSeconds]);

  useEffect(() => {
    if (!finished) {
      playedFinishChimeRef.current = false;
      return;
    }
    if (playedFinishChimeRef.current) return;
    playedFinishChimeRef.current = true;
    playTimerAlarm(alarmSoundId, alarmDurationSeconds);
  }, [finished, alarmSoundId, alarmDurationSeconds]);

  useLayoutEffect(() => {
    if (!finished) {
      setFinishDigitPhase("none");
      return;
    }
    setFinishDigitPhase("pulse");
  }, [finished]);

  useEffect(() => {
    if (!finished) return;
    const tid = window.setTimeout(() => setFinishDigitPhase("solid"), alarmDurationSeconds * 1000);
    return () => window.clearTimeout(tid);
  }, [finished, alarmDurationSeconds]);

  useEffect(() => {
    if (!finished) {
      setShowFinishFirework(false);
      return;
    }
    setFinishBurstKey((k) => k + 1);
    setShowFinishFirework(true);
    const tid = window.setTimeout(() => setShowFinishFirework(false), FINISH_FIREWORK_CLEAR_MS);
    return () => window.clearTimeout(tid);
  }, [finished]);

  useEffect(() => {
    const onFsChange = () => {
      setFullscreen(Boolean(document.fullscreenElement && panelRef.current === document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = panelRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      window.alert("Fullscreen is not available in this browser or was blocked.");
    }
  }, []);

  const applyPreset = (total: number) => {
    setRunning(false);
    setFinished(false);
    const capped = Math.min(MAX_DURATION_SECONDS, total);
    const h = Math.floor(capped / 3600);
    const rem = capped % 3600;
    const m = Math.floor(rem / 60);
    const s = rem % 60;
    setHoursInput(String(h));
    setMinutesInput(String(m));
    setSecondsInput(String(s));
    setDurationSeconds(capped);
    setRemainingSeconds(capped);
  };

  const resetToDuration = () => {
    setRunning(false);
    setFinished(false);
    setRemainingSeconds(durationSeconds);
  };

  const startOrResume = () => {
    if (finished || remainingSeconds === 0) {
      if (!syncDurationFromInputs()) return;
      setRunning(true);
      return;
    }
    if (!running) setRunning(true);
  };

  const pause = () => setRunning(false);

  const stopTimer = () => {
    resetToDuration();
  };

  const startLabel =
    finished || remainingSeconds === 0
      ? "Start"
      : !running && remainingSeconds < durationSeconds && remainingSeconds > 0
        ? "Resume"
        : "Start";

  const statusLabel = finished
    ? null
    : running
      ? "Running"
      : remainingSeconds < durationSeconds && remainingSeconds > 0
        ? "Paused"
        : "Ready";

  /** Mid-session pause: countdown started but not at full duration and not finished. */
  const pausedMidSession =
    !running && !finished && remainingSeconds > 0 && remainingSeconds < durationSeconds;

  /** Fullscreen: hide presets + custom while running or paused mid-countdown. */
  const hideFullscreenSetup = fullscreen && (running || pausedMidSession);

  /** Hide Quick presets + Custom until Stop (or Reset) after time's up, or fullscreen mid-session. */
  const hidePresetCards = finished || hideFullscreenSetup;

  /** Fullscreen: center clock when setup cards are hidden (running, paused mid, or finished). */
  const fullscreenFocusLayout = hidePresetCards && fullscreen;

  /** H : MM : SS is longer than MM : SS — keep one line with slightly smaller type when hours remain. */
  const clockHasHours = !finished && remainingSeconds >= 3600;

  const fireworkPetals = useMemo(() => {
    if (finishBurstKey === 0) return [];
    return buildSakuraFireworkPetals(finishBurstKey, FINISH_FIREWORK_PETAL_COUNT);
  }, [finishBurstKey]);

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-pink-200/80 bg-white/95 shadow-lg shadow-pink-200/30 sm:rounded-3xl">
      <div className="border-b border-pink-100/90 bg-gradient-to-r from-pink-50/80 via-white to-rose-50/50 px-4 py-5 sm:px-8 sm:py-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-pink-600">Focus</p>
            <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">Countdown timer</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-600">
              Pick a preset or set your own time, then go fullscreen when you only want the clock on screen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAlarmSoundOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border-2 border-pink-200/90 bg-white px-3 py-2 text-sm font-semibold text-pink-900 shadow-sm transition hover:border-pink-400 hover:bg-pink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
            aria-haspopup="dialog"
            aria-expanded={alarmSoundOpen}
          >
            <TimerSoundSettingsIcon className="h-5 w-5 text-pink-600" />
            <span className="hidden sm:inline">Alarm sound</span>
          </button>
        </div>
      </div>

      <div
        ref={panelRef}
        className={`relative flex w-full flex-col items-center overflow-hidden ${
          fullscreen
            ? "min-h-[100dvh] pb-32 sm:pb-36"
            : "min-h-0 bg-gradient-to-b from-white to-pink-50/35"
        }`}
      >
        {fullscreen && (
          <>
            <div className="seasonal-backdrop-gradient pointer-events-none absolute inset-0 z-0" aria-hidden />
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
              <div className="seasonal-snow-field seasonal-snow-field-a absolute inset-[-15%_0_-10%_0]" />
              <div className="seasonal-snow-field seasonal-snow-field-b absolute inset-[-15%_0_-10%_0]" />
            </div>
            <button
              type="button"
              onClick={() => setAlarmSoundOpen(true)}
              className="fixed z-[6] inline-flex items-center justify-center rounded-xl border-2 border-pink-200/90 bg-white/95 p-2.5 text-pink-900 shadow-md backdrop-blur-sm transition hover:border-pink-400 hover:bg-pink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
              style={{
                top: "max(12px, env(safe-area-inset-top, 0px))",
                right: "max(12px, env(safe-area-inset-right, 0px))",
              }}
              aria-label="Alarm sound settings"
              aria-haspopup="dialog"
              aria-expanded={alarmSoundOpen}
            >
              <TimerSoundSettingsIcon className="h-6 w-6 text-pink-600" />
            </button>
          </>
        )}

        {showFinishFirework && (
          <div
            className="workspace-timer-finish-firework-layer workspace-timer-finish-firework-layer--overlap-fade pointer-events-none absolute inset-0 z-[2] overflow-hidden motion-reduce:hidden"
            aria-hidden
          >
            {fireworkPetals.map((p) => (
              <span key={p.id} className="absolute left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2">
                <span
                  className="workspace-timer-sakura-burst-petal block will-change-transform"
                  style={
                    {
                      width: p.w,
                      height: p.h,
                      animationDelay: `${p.delay}s`,
                      animationDuration: `${p.dur}s`,
                      "--dx": `${p.dx}px`,
                      "--dy": `${p.dy}px`,
                      "--rot": `${p.rot}deg`,
                    } as CSSProperties & Record<"--dx" | "--dy" | "--rot", string>
                  }
                />
              </span>
            ))}
          </div>
        )}

        <div
          className={`relative flex w-full flex-col items-center px-4 py-10 sm:px-8 sm:py-12 ${
            showFinishFirework ? "z-[4]" : "z-[1]"
          } ${fullscreenFocusLayout ? "min-h-0 flex-1 justify-center" : ""}`}
        >
        <div className={`flex w-full flex-col items-center gap-3 ${fullscreen ? "max-w-2xl" : "max-w-lg"}`}>
          <div
            className={`relative w-full rounded-3xl px-6 py-8 text-center sm:px-10 sm:py-10 ${
              fullscreen
                ? showFinishFirework
                  ? "border border-pink-100/80 bg-white shadow-lg shadow-pink-200/25 ring-1 ring-pink-100/90"
                  : "border border-pink-100/80 bg-white/95 shadow-lg shadow-pink-200/25 ring-1 ring-pink-100/90"
                : showFinishFirework
                  ? "bg-white shadow-inner shadow-pink-100/60 ring-1 ring-pink-100/90"
                  : "bg-white/90 shadow-inner shadow-pink-100/60 ring-1 ring-pink-100/90"
            } ${finished ? "ring-rose-200/90" : ""}`}
          >
            {statusLabel && (
              <p
                className={`mb-3 text-xs font-semibold uppercase tracking-wider ${
                  fullscreen ? "text-pink-600" : "text-pink-600/90"
                }`}
              >
                {statusLabel}
              </p>
            )}
            <div
              className={`flex w-full min-w-0 flex-nowrap items-baseline justify-center font-mono font-bold tabular-nums leading-none ${
                fullscreen
                  ? clockHasHours
                    ? "text-[clamp(1rem,5.5vmin,5rem)] tracking-wide"
                    : "text-[clamp(1rem,min(14vw,12vmin),6.5rem)] tracking-wide"
                  : clockHasHours
                    ? "text-4xl sm:text-5xl"
                    : "text-5xl sm:text-6xl"
              } ${
                finishDigitPhase === "pulse"
                  ? "workspace-timer-finished-digit"
                  : finishDigitPhase === "solid"
                    ? "workspace-timer-finished-solid"
                    : "text-neutral-900"
              }`}
              aria-live="polite"
              aria-atomic="true"
            >
              {fullscreen ? (
                <FullscreenClockFace totalSeconds={remainingSeconds} finished={finished} />
              ) : (
                <CompactClockFace totalSeconds={remainingSeconds} finished={finished} />
              )}
            </div>
            {finished && (
              <p className="mt-4 text-base font-semibold text-rose-700" role="status">
                Time&apos;s up
              </p>
            )}
          </div>
        </div>

        <div
          className={`flex w-full flex-col origin-top overflow-hidden will-change-[max-height,opacity,transform] motion-reduce:transition-none transition-[max-height,opacity,transform,margin-top,gap] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            fullscreen ? "max-w-2xl" : "max-w-lg"
          } ${
            hidePresetCards
              ? "pointer-events-none max-h-0 gap-0 -translate-y-1 scale-[0.99] opacity-0 mt-0"
              : "max-h-[2800px] gap-8 translate-y-0 scale-100 opacity-100 mt-10"
          }`}
          aria-hidden={hidePresetCards || undefined}
        >
            <div className="rounded-2xl border border-pink-200/70 bg-white/90 p-4 shadow-sm sm:p-5">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-500">Quick presets</p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  { label: "1 minute", sec: 60 },
                  { label: "50 minutes", sec: 50 * 60 },
                  { label: "1 hour", sec: 60 * 60 },
                  { label: "1 hour 50 min", sec: 60 * 60 + 50 * 60 },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p.sec)}
                    className="min-h-[44px] rounded-xl border-2 border-pink-300/80 bg-pink-50/90 px-2 py-1.5 text-center text-xs font-semibold leading-snug text-pink-950 shadow-sm transition hover:border-pink-400 hover:bg-pink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 sm:text-sm"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-pink-200/70 bg-white/90 p-4 shadow-sm sm:p-5">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-500">Custom duration</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="grid flex-1 grid-cols-3 gap-2 sm:gap-3">
                  <label className="flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-neutral-600">
                    Hours
                    <input
                      type="number"
                      min={0}
                      max={99}
                      inputMode="numeric"
                      disabled={running}
                      value={hoursInput}
                      onChange={(e) => setHoursInput(e.target.value.replace(/\D/g, "").slice(0, 2))}
                      className={inputNumberClass}
                    />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-neutral-600">
                    Minutes
                    <input
                      type="number"
                      min={0}
                      max={59}
                      inputMode="numeric"
                      disabled={running}
                      value={minutesInput}
                      onChange={(e) => setMinutesInput(e.target.value.replace(/\D/g, "").slice(0, 2))}
                      className={inputNumberClass}
                    />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-neutral-600">
                    Seconds
                    <input
                      type="number"
                      min={0}
                      max={59}
                      inputMode="numeric"
                      disabled={running}
                      value={secondsInput}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                        setSecondsInput(v);
                      }}
                      className={inputNumberClass}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={running}
                  onClick={() => {
                    if (!syncDurationFromInputs()) {
                      window.alert("Set a duration greater than zero.");
                    }
                  }}
                  className="inline-flex min-h-[48px] w-full shrink-0 items-center justify-center rounded-xl border-2 border-pink-400 bg-pink-100 px-6 text-sm font-semibold text-pink-950 shadow-sm transition hover:bg-pink-200/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-40"
                >
                  Apply
                </button>
              </div>
            </div>
        </div>

        {!fullscreen && (
          <div className={`flex w-full max-w-lg flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center ${hidePresetCards ? "mt-10" : "mt-8"}`}>
            {!running ? (
              <button type="button" onClick={startOrResume} className={btnPrimaryClass}>
                {finished || remainingSeconds === 0 ? "Start" : "Resume"}
              </button>
            ) : (
              <button type="button" onClick={pause} className={btnSecondaryClass}>
                Pause
              </button>
            )}
            <button type="button" onClick={resetToDuration} className={btnNeutralClass}>
              Stop
            </button>
            <button type="button" onClick={() => void toggleFullscreen()} className={btnSecondaryClass}>
              Fullscreen
            </button>
          </div>
        )}
        </div>

        {fullscreen && (
          <div
            className="fixed inset-x-0 bottom-0 z-[5] border-t border-pink-100/90 bg-white/95 px-3 pt-3 shadow-[0_-10px_40px_-10px_rgba(219,39,119,0.15)] backdrop-blur-md pb-[max(12px,env(safe-area-inset-bottom,0px))] sm:px-6 sm:pt-4"
            role="toolbar"
            aria-label="Timer controls"
          >
            <div className="mx-auto grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <button
                type="button"
                disabled={running}
                onClick={() => startOrResume()}
                className={`${dockBtnPrimary} w-full`}
              >
                {startLabel}
              </button>
              <button type="button" disabled={!running} onClick={() => pause()} className={`${dockBtnOutlinePink} w-full`}>
                Pause
              </button>
              <button type="button" onClick={() => stopTimer()} className={`${dockBtnOutlineNeutral} w-full`}>
                Stop
              </button>
              <button type="button" onClick={() => void toggleFullscreen()} className={`${dockBtnOutlinePink} w-full`}>
                Exit fullscreen
              </button>
            </div>
          </div>
        )}
      </div>

      {alarmSoundOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="timer-alarm-sound-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setAlarmSoundOpen(false);
              stopAlarmPreview();
            }
          }}
        >
          <div className="flex max-h-[min(640px,90dvh)] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl ring-1 ring-pink-100">
            <div className="border-b border-pink-100 px-4 py-4 sm:px-5">
              <h2 id="timer-alarm-sound-title" className="text-lg font-semibold text-neutral-900">
                When time&apos;s up
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Choose a tone and how long it plays. The alarm eases out at the end so it doesn&apos;t stop abruptly.
                Previews run about{" "}
                <span className="font-semibold text-neutral-700 tabular-nums">
                  {Math.round(TIMER_ALARM_PREVIEW_DURATION_SECONDS * 10) / 10}s
                </span>{" "}
                (with the same fade).
              </p>
              <div className="mt-4 rounded-xl border border-pink-100 bg-pink-50/50 px-3 py-3 sm:px-4">
                <label htmlFor="timer-alarm-duration" className="block text-xs font-bold uppercase tracking-wider text-neutral-600">
                  Alarm length
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <input
                    id="timer-alarm-duration"
                    type="range"
                    min={TIMER_ALARM_DURATION_MIN}
                    max={TIMER_ALARM_DURATION_MAX}
                    step={1}
                    value={alarmDurationSeconds}
                    onChange={(e) => setAlarmDurationSeconds(Number.parseInt(e.target.value, 10))}
                    className="h-2 min-w-0 flex-1 cursor-pointer accent-pink-600"
                  />
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-900">
                    {alarmDurationSeconds}s
                  </span>
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  Fade-out: ~{Math.round(computeAlarmFadeOutSeconds(alarmDurationSeconds) * 10) / 10}s at the end (set
                  automatically).
                </p>
              </div>
            </div>
            <ul className="min-h-0 flex-1 overflow-auto px-3 py-2 sm:px-4">
              {ALARM_SOUND_OPTIONS.map((opt) => {
                const selected = alarmSoundId === opt.id;
                return (
                  <li
                    key={opt.id}
                    className={`rounded-xl border px-3 py-2.5 sm:px-3.5 sm:py-3 ${
                      selected ? "border-pink-400 bg-pink-50/80" : "border-transparent hover:bg-pink-50/40"
                    }`}
                  >
                    <div className="flex items-start gap-2 sm:gap-3">
                      <input
                        id={`timer-alarm-${opt.id}`}
                        type="radio"
                        name="workspace-timer-alarm"
                        checked={selected}
                        onChange={() => {
                          setAlarmSoundId(opt.id);
                          playAlarmPreview(opt.id);
                        }}
                        className="mt-1 h-4 w-4 shrink-0 accent-pink-600"
                      />
                      <label htmlFor={`timer-alarm-${opt.id}`} className="min-w-0 flex-1 cursor-pointer">
                        <span className="block text-sm font-semibold text-neutral-900">{opt.label}</span>
                        <span className="mt-0.5 block text-xs text-neutral-500">{opt.hint}</span>
                      </label>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          playAlarmPreview(opt.id);
                        }}
                        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-pink-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-pink-900 shadow-sm transition hover:bg-pink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
                      >
                        Preview
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-pink-100 px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => {
                  setAlarmSoundOpen(false);
                  stopAlarmPreview();
                }}
                className="inline-flex w-full min-h-[44px] items-center justify-center rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 px-4 text-sm font-semibold text-white shadow-md transition hover:brightness-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
