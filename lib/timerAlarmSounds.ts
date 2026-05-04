/**
 * Timer alarm audio: procedural Web Audio presets plus one sampled clip.
 * vClock xylophone is served from /timer-sounds/ (same file as https://vclock.com/sound/xylophone.mp3 ).
 */

export type AlarmSoundId =
  | "soft-melody"
  | "radar"
  | "beacon"
  | "chimes"
  | "circuit"
  | "bells"
  | "signal"
  | "cosmic"
  | "custom-1";

export const TIMER_ALARM_STORAGE_KEY = "workspace-timer-alarm-sound-v1";

export const TIMER_ALARM_DURATION_STORAGE_KEY = "workspace-timer-alarm-duration-v1";

export const TIMER_ALARM_DURATION_MIN = 3;

export const TIMER_ALARM_DURATION_MAX = 45;

export const TIMER_ALARM_DURATION_DEFAULT_SECONDS = 8;

/** @deprecated Use TIMER_ALARM_DURATION_DEFAULT_SECONDS — kept for older imports. */
export const TIMER_FINISH_ALARM_DURATION_SECONDS = TIMER_ALARM_DURATION_DEFAULT_SECONDS;

/** Preview clip length in the settings dialog. */
export const TIMER_ALARM_PREVIEW_DURATION_SECONDS = 3.2;

/** Sampled “xylophone” alert from [vClock’s online timer](https://vclock.com/timer/) (bundled MP3). */
export const TIMER_SOUND_VCLOCK_XYLOPHONE_SRC = "/timer-sounds/vclock-xylophone.mp3";

export const ALARM_SOUND_OPTIONS: { id: AlarmSoundId; label: string; hint: string }[] = [
  { id: "soft-melody", label: "Classic tone", hint: "Steady two-tone (A/B) — serious smoke-timer style" },
  { id: "radar", label: "Radar", hint: "Controlled upward sweep, repeats calmly" },
  { id: "beacon", label: "Beacon", hint: "Two clear beeps per cycle" },
  { id: "chimes", label: "Chimes", hint: "Measured pentatonic phrase" },
  { id: "circuit", label: "Circuit", hint: "Even digital ticks" },
  { id: "bells", label: "Bells", hint: "Low chord strike, long decay" },
  { id: "signal", label: "Signal", hint: "Alternating interval tones" },
  { id: "cosmic", label: "Siren", hint: "Slow two-tone sweep (sine)" },
  {
    id: "custom-1",
    label: "Custom 1",
    hint: "vClock xylophone clip (same as their timer’s “xylophone” sound)",
  },
];

const DEFAULT_SOUND: AlarmSoundId = "soft-melody";

const VALID_IDS = new Set<string>(ALARM_SOUND_OPTIONS.map((o) => o.id));

export function parseStoredAlarmSound(raw: string | null): AlarmSoundId {
  if (raw && VALID_IDS.has(raw)) return raw as AlarmSoundId;
  return DEFAULT_SOUND;
}

function clampDurationSeconds(n: number): number {
  if (!Number.isFinite(n)) return TIMER_ALARM_DURATION_DEFAULT_SECONDS;
  return Math.min(
    TIMER_ALARM_DURATION_MAX,
    Math.max(TIMER_ALARM_DURATION_MIN, Math.round(n))
  );
}

export function parseStoredAlarmDuration(raw: string | null): number {
  if (raw == null || raw === "") return TIMER_ALARM_DURATION_DEFAULT_SECONDS;
  const parsed = Number.parseInt(raw, 10);
  return clampDurationSeconds(parsed);
}

/** Fade length at the end of the alarm (full volume until then). */
export function computeAlarmFadeOutSeconds(totalDuration: number): number {
  const d = Math.max(0, totalDuration);
  if (d <= 0) return 0;
  const raw = Math.min(1.35, Math.max(0.28, d * 0.16));
  return Math.min(raw, d * 0.42);
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

export type AlarmPlaybackHandle = { cancel: () => void };

/** Sine-forward, restrained attack — reads as “alarm”, not cartoon FX. */
function alarmBeep(
  ctx: AudioContext,
  freq: number,
  t0: number,
  len: number,
  peak: number,
  dest: AudioNode,
  type: OscillatorType = "sine"
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.connect(g);
  g.connect(dest);
  const atk = Math.min(0.02, len * 0.25);
  const rel = Math.min(0.04, len * 0.35);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(atk + 0.01, len - rel));
  osc.start(t0);
  osc.stop(t0 + len + 0.02);
}

function playSoftMelody(ctx: AudioContext, tStart: number, durationSec: number, dest: AudioNode) {
  const peak = 0.072;
  const period = 0.52;
  const toneLen = 0.38;
  const freqs = [800, 950] as const;
  let i = 0;
  for (let time = 0; time < durationSec - 0.08; time += period, i++) {
    alarmBeep(ctx, freqs[i % 2], tStart + time, toneLen, peak, dest, "sine");
  }
}

function playRadar(ctx: AudioContext, tStart: number, durationSec: number, dest: AudioNode) {
  const period = 0.88;
  const sweepDur = 0.42;
  const peak = 0.07;
  for (let time = 0; time < durationSec - 0.06; time += period) {
    const t0 = tStart + time;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(720, t0);
    osc.frequency.exponentialRampToValueAtTime(1480, t0 + sweepDur * 0.92);
    osc.connect(g);
    g.connect(dest);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + sweepDur);
    osc.start(t0);
    osc.stop(t0 + sweepDur + 0.02);
  }
}

function playBeacon(ctx: AudioContext, tStart: number, durationSec: number, dest: AudioNode) {
  const f = 880;
  const peak = 0.075;
  const blip = 0.11;
  const between = 0.12;
  const cycle = 1.05;
  let time = 0;
  while (time < durationSec - 0.2) {
    const t0 = tStart + time;
    alarmBeep(ctx, f, t0, blip, peak, dest, "sine");
    alarmBeep(ctx, f, t0 + blip + between, blip, peak * 0.95, dest, "sine");
    time += cycle;
  }
}

function playChimes(ctx: AudioContext, tStart: number, durationSec: number, dest: AudioNode) {
  const notes = [523.25, 440, 392, 329.63, 261.63] as const;
  const peak = 0.055;
  const phraseLen = 1.15;
  let phrase = 0;
  for (let time = 0; time < durationSec - 0.15; time += phraseLen, phrase++) {
    const tPhrase = tStart + time;
    notes.forEach((freq, j) => {
      const t0 = tPhrase + j * 0.1;
      alarmBeep(ctx, freq, t0, 0.32, peak * (1 - j * 0.06), dest, "sine");
    });
  }
}

function playCircuit(ctx: AudioContext, tStart: number, durationSec: number, dest: AudioNode) {
  const peak = 0.068;
  const step = 0.34;
  let time = 0;
  while (time < durationSec - 0.05) {
    alarmBeep(ctx, 1000, tStart + time, 0.04, peak, dest, "sine");
    time += step;
  }
}

function playBells(ctx: AudioContext, tStart: number, durationSec: number, dest: AudioNode) {
  const peak = 0.05;
  const period = 1.15;
  const roots = [261.63, 293.66] as const;
  let i = 0;
  for (let time = 0; time < durationSec - 0.25; time += period, i++) {
    const root = roots[i % 2];
    const t0 = tStart + time;
    alarmBeep(ctx, root, t0, 0.85, peak, dest, "sine");
    alarmBeep(ctx, root * 1.25, t0 + 0.015, 0.75, peak * 0.55, dest, "sine");
    alarmBeep(ctx, root * 1.5, t0 + 0.03, 0.65, peak * 0.38, dest, "sine");
  }
}

function playSignal(ctx: AudioContext, tStart: number, durationSec: number, dest: AudioNode) {
  const peak = 0.07;
  const freqs = [440, 554.37] as const;
  const period = 0.48;
  let i = 0;
  for (let time = 0; time < durationSec - 0.08; time += period, i++) {
    alarmBeep(ctx, freqs[i % 2], tStart + time, 0.28, peak, dest, "sine");
  }
}

function playCosmic(ctx: AudioContext, tStart: number, durationSec: number, dest: AudioNode) {
  const period = 1.1;
  const peak = 0.068;
  let flip = 0;
  for (let time = 0; time < durationSec - 0.12; time += period, flip++) {
    const t0 = tStart + time;
    const lo = flip % 2 === 0 ? 600 : 800;
    const hi = flip % 2 === 0 ? 900 : 700;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(lo, t0);
    osc.frequency.linearRampToValueAtTime(hi, t0 + period * 0.48);
    osc.frequency.linearRampToValueAtTime(lo, t0 + period * 0.96);
    osc.connect(g);
    g.connect(dest);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + period * 0.98);
    osc.start(t0);
    osc.stop(t0 + period);
  }
}

function runPattern(
  ctx: AudioContext,
  soundId: AlarmSoundId,
  tStart: number,
  durationSec: number,
  dest: AudioNode
) {
  switch (soundId) {
    case "custom-1":
      break;
    case "soft-melody":
      playSoftMelody(ctx, tStart, durationSec, dest);
      break;
    case "radar":
      playRadar(ctx, tStart, durationSec, dest);
      break;
    case "beacon":
      playBeacon(ctx, tStart, durationSec, dest);
      break;
    case "chimes":
      playChimes(ctx, tStart, durationSec, dest);
      break;
    case "circuit":
      playCircuit(ctx, tStart, durationSec, dest);
      break;
    case "bells":
      playBells(ctx, tStart, durationSec, dest);
      break;
    case "signal":
      playSignal(ctx, tStart, durationSec, dest);
      break;
    case "cosmic":
      playCosmic(ctx, tStart, durationSec, dest);
      break;
    default:
      playSoftMelody(ctx, tStart, durationSec, dest);
  }
}

function playSampledVclockXylophone(durationSeconds: number): AlarmPlaybackHandle {
  if (typeof window === "undefined") return { cancel: () => {} };

  const audio = new Audio(TIMER_SOUND_VCLOCK_XYLOPHONE_SRC);
  audio.loop = true;
  const baseVol = 0.95;
  audio.volume = baseVol;

  const dur = Math.max(0.5, durationSeconds);
  const fadeSec = computeAlarmFadeOutSeconds(dur);
  const totalMs = dur * 1000;
  const fadeStartMs = Math.max(0, totalMs - fadeSec * 1000);

  let raf = 0;
  let disposed = false;
  const start = performance.now();

  const finish = () => {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = baseVol;
  };

  const tick = () => {
    if (disposed) return;
    const elapsed = performance.now() - start;
    if (elapsed >= totalMs) {
      finish();
      return;
    }
    if (fadeSec > 0.02 && elapsed >= fadeStartMs) {
      const u = (elapsed - fadeStartMs) / (fadeSec * 1000);
      audio.volume = Math.max(0, baseVol * (1 - Math.min(1, u)));
    }
    raf = requestAnimationFrame(tick);
  };

  void audio.play().catch(() => {
    /* autoplay */
  });

  raf = requestAnimationFrame(tick);

  const timeoutId = window.setTimeout(() => {
    cancelAnimationFrame(raf);
    if (!disposed) finish();
  }, totalMs + 200);

  return {
    cancel: () => {
      disposed = true;
      window.clearTimeout(timeoutId);
      cancelAnimationFrame(raf);
      finish();
    },
  };
}

function scheduleMasterFadeOut(master: GainNode, t0: number, durationSec: number): void {
  const dur = Math.max(0.5, durationSec);
  const fade = computeAlarmFadeOutSeconds(dur);
  const tEnd = t0 + dur;
  master.gain.setValueAtTime(1, t0);
  if (fade >= dur - 0.05) {
    master.gain.linearRampToValueAtTime(0.0001, tEnd);
    return;
  }
  const tFade = tEnd - fade;
  master.gain.setValueAtTime(1, t0);
  master.gain.setValueAtTime(1, tFade);
  master.gain.linearRampToValueAtTime(0.0001, tEnd);
}

/**
 * Play alarm for `durationSeconds`. Returns handle to cancel.
 * Output fades out at the end so it does not sound abruptly cut off.
 */
function normalizePlaybackDuration(seconds: number, clampToUserRange: boolean): number {
  if (clampToUserRange) return clampDurationSeconds(seconds);
  const s = Number(seconds);
  if (!Number.isFinite(s)) return TIMER_ALARM_PREVIEW_DURATION_SECONDS;
  return Math.max(0.5, Math.min(120, s));
}

export function playTimerAlarm(soundId: AlarmSoundId, durationSeconds: number): AlarmPlaybackHandle {
  return playTimerAlarmInternal(soundId, durationSeconds, true);
}

function playTimerAlarmInternal(
  soundId: AlarmSoundId,
  durationSeconds: number,
  clampToUserRange: boolean
): AlarmPlaybackHandle {
  const dur = normalizePlaybackDuration(durationSeconds, clampToUserRange);

  if (soundId === "custom-1") {
    return playSampledVclockXylophone(dur);
  }

  const ctx = getAudioContext();
  if (!ctx) return { cancel: () => {} };

  const timeouts: number[] = [];
  let disposed = false;
  const safeClose = () => {
    if (disposed) return;
    disposed = true;
    void ctx.close();
  };
  const cancel = () => {
    timeouts.forEach((id) => window.clearTimeout(id));
    safeClose();
  };

  void ctx.resume().then(() => {
    try {
      const t0 = ctx.currentTime;
      const master = ctx.createGain();
      master.connect(ctx.destination);
      scheduleMasterFadeOut(master, t0, dur);
      runPattern(ctx, soundId, t0, dur, master);
      const tid = window.setTimeout(safeClose, (dur + 0.45) * 1000);
      timeouts.push(tid);
    } catch {
      safeClose();
    }
  });

  return { cancel };
}

/** Short sample for the settings panel (user gesture unlocks audio on mobile). */
export function playTimerAlarmPreview(soundId: AlarmSoundId): AlarmPlaybackHandle {
  return playTimerAlarmInternal(soundId, TIMER_ALARM_PREVIEW_DURATION_SECONDS, false);
}
