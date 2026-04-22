"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

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

/** Wider typography in fullscreen (`05 : 00` or `1 : 30 : 00`). */
function formatClockSpaced(totalSeconds: number, finished: boolean): string {
  if (finished) return "00 : 00";
  return formatClock(totalSeconds).replace(/:/g, " : ");
}

const FINISH_ALARM_SECONDS = 5;

/** ~5s soft repeating tones when the countdown completes — even level (no fade), Web Audio. */
function playTimerFinishedChime() {
  if (typeof window === "undefined") return;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    const peak = 0.038;
    const beep = (freq: number, t0: number, len: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t0);
      osc.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len - 0.04);
      osc.start(t0);
      osc.stop(t0 + len);
    };
    const t = ctx.currentTime;
    const step = 0.62;
    const beepLen = 0.28;
    const freqs = [392, 440, 349.23, 392] as const;
    for (let time = 0, i = 0; time < FINISH_ALARM_SECONDS - 0.06; time += step, i++) {
      beep(freqs[i % freqs.length], t + time, beepLen);
    }
    window.setTimeout(() => void ctx.close(), (FINISH_ALARM_SECONDS + 0.5) * 1000);
  } catch {
    /* autoplay or AudioContext unsupported */
  }
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

export function WorkspaceTimerSection() {
  const panelRef = useRef<HTMLDivElement>(null);
  const playedFinishChimeRef = useRef(false);
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

  const syncDurationFromInputs = useCallback(() => {
    const next = parseDurationHms(hoursInput, minutesInput, secondsInput);
    if (next <= 0) return false;
    setDurationSeconds(next);
    setRemainingSeconds(next);
    setFinished(false);
    return true;
  }, [hoursInput, minutesInput, secondsInput]);

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
    playTimerFinishedChime();
  }, [finished]);

  useLayoutEffect(() => {
    if (!finished) {
      setFinishDigitPhase("none");
      return;
    }
    setFinishDigitPhase("pulse");
  }, [finished]);

  useEffect(() => {
    if (!finished) return;
    const tid = window.setTimeout(() => setFinishDigitPhase("solid"), FINISH_ALARM_SECONDS * 1000);
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

  return (
    <section className="overflow-hidden rounded-2xl border border-pink-200/80 bg-white/95 shadow-lg shadow-pink-200/30 sm:rounded-3xl">
      <div className="border-b border-pink-100/90 bg-gradient-to-r from-pink-50/80 via-white to-rose-50/50 px-5 py-6 sm:px-8 sm:py-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-pink-600">Focus</p>
        <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">Countdown timer</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-600">
          Pick a preset or set your own time, then go fullscreen when you only want the clock on screen.
        </p>
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
          </>
        )}

        <div
          className={`relative z-[1] flex w-full flex-col items-center px-4 py-10 sm:px-8 sm:py-12 ${
            fullscreenFocusLayout ? "min-h-0 flex-1 justify-center" : ""
          }`}
        >
        <div className={`flex w-full flex-col items-center gap-3 ${fullscreen ? "max-w-2xl" : "max-w-lg"}`}>
          <div
            className={`relative w-full rounded-3xl px-6 py-8 text-center sm:px-10 sm:py-10 ${
              fullscreen
                ? "border border-pink-100/80 bg-white/95 shadow-lg shadow-pink-200/25 ring-1 ring-pink-100/90"
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
              className={`font-mono font-bold tabular-nums tracking-tight ${
                fullscreen ? "text-[min(14vw,6.5rem)] tracking-wide" : "text-5xl sm:text-6xl"
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
              {fullscreen ? formatClockSpaced(remainingSeconds, finished) : finished ? "00:00" : formatClock(remainingSeconds)}
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
    </section>
  );
}
