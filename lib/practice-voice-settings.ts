/**
 * User-tunable hands-free mic timing for Berry practice.
 * Persisted in localStorage so you can calibrate pause sensitivity.
 */

export type PracticeVoiceSettings = {
  /** Silence while phrase looks mid-sentence (ms). */
  silenceMsIncomplete: number;
  /** Silence after a finalized STT chunk that still looks incomplete (ms). */
  silenceMsIncompleteAfterFinal: number;
  /** Max total wait while mid-thought before sending (ms). */
  maxIncompleteWaitMs: number;
  /** Silence when the phrase looks clearly finished (ms). */
  silenceMsAfterFinal: number;
  /** General silence before send when completion is unclear (ms). */
  silenceMs: number;
  /** Fast cutoff when end-of-phrase is detected (ms). */
  completePhraseCutoffMs: number;
  /** Delay before mic reopens after Berry finishes (ms). */
  listenAfterSpeakMs: number;
  /** Mic level deadband while Berry speaks (0–0.3). */
  berrySpeakingNoiseFloor: number;
};

export const PRACTICE_VOICE_SETTINGS_KEY = "berry-voice-settings-v1";

export const DEFAULT_PRACTICE_VOICE_SETTINGS: PracticeVoiceSettings = {
  silenceMsIncomplete: 2400,
  silenceMsIncompleteAfterFinal: 2800,
  maxIncompleteWaitMs: 9000,
  silenceMsAfterFinal: 240,
  silenceMs: 700,
  completePhraseCutoffMs: 200,
  listenAfterSpeakMs: 360,
  berrySpeakingNoiseFloor: 0.15,
};

export type PracticeVoiceSettingsPreset = "patient" | "balanced" | "quick";

function formatWaitTime(ms: number): string {
  const sec = ms / 1000;
  if (sec >= 10) return `${Math.round(sec)} sec`;
  if (Math.abs(sec - Math.round(sec)) < 0.05) return `${Math.round(sec)} sec`;
  return `${sec.toFixed(1)} sec`;
}

function formatEchoGuard(level: number): string {
  if (level < 0.11) return "Low";
  if (level < 0.18) return "Medium";
  return "High";
}

export const PRACTICE_VOICE_PRESETS: Record<
  PracticeVoiceSettingsPreset,
  { label: string; hint: string; settings: PracticeVoiceSettings }
> = {
  patient: {
    label: "Patient",
    hint: "Berry waits longer — use this if she talks over you",
    settings: {
      silenceMsIncomplete: 3200,
      silenceMsIncompleteAfterFinal: 3800,
      maxIncompleteWaitMs: 14000,
      silenceMsAfterFinal: 300,
      silenceMs: 850,
      completePhraseCutoffMs: 240,
      listenAfterSpeakMs: 450,
      berrySpeakingNoiseFloor: 0.15,
    },
  },
  balanced: {
    label: "Balanced",
    hint: "Works well for most people",
    settings: { ...DEFAULT_PRACTICE_VOICE_SETTINGS },
  },
  quick: {
    label: "Quick",
    hint: "Berry replies sooner — less waiting",
    settings: {
      silenceMsIncomplete: 1400,
      silenceMsIncompleteAfterFinal: 1700,
      maxIncompleteWaitMs: 5500,
      silenceMsAfterFinal: 180,
      silenceMs: 520,
      completePhraseCutoffMs: 160,
      listenAfterSpeakMs: 220,
      berrySpeakingNoiseFloor: 0.12,
    },
  },
};

const BOUNDS: Record<keyof PracticeVoiceSettings, { min: number; max: number; step: number }> = {
  silenceMsIncomplete: { min: 800, max: 5000, step: 100 },
  silenceMsIncompleteAfterFinal: { min: 1000, max: 6000, step: 100 },
  maxIncompleteWaitMs: { min: 4000, max: 20000, step: 500 },
  silenceMsAfterFinal: { min: 100, max: 900, step: 20 },
  silenceMs: { min: 300, max: 1800, step: 50 },
  completePhraseCutoffMs: { min: 80, max: 600, step: 10 },
  listenAfterSpeakMs: { min: 80, max: 1200, step: 20 },
  berrySpeakingNoiseFloor: { min: 0.06, max: 0.28, step: 0.01 },
};

export const PRACTICE_VOICE_SETTING_FIELDS: {
  key: keyof PracticeVoiceSettings;
  label: string;
  hint: string;
  format: (v: number) => string;
}[] = [
  {
    key: "silenceMsIncomplete",
    label: "Pause while you think",
    hint: "How long you can stop in the middle of a sentence before Berry answers",
    format: formatWaitTime,
  },
  {
    key: "silenceMsIncompleteAfterFinal",
    label: "Extra thinking time",
    hint: "If you said a few words then paused, Berry waits this much longer",
    format: formatWaitTime,
  },
  {
    key: "maxIncompleteWaitMs",
    label: "Longest wait for you",
    hint: "The most Berry will wait while you are still working on your thought",
    format: formatWaitTime,
  },
  {
    key: "silenceMsAfterFinal",
    label: "When you clearly finished",
    hint: "Short pause after a full sentence — then Berry replies",
    format: formatWaitTime,
  },
  {
    key: "silenceMs",
    label: "When Berry is unsure",
    hint: "If it is not obvious you are done, Berry waits this long before replying",
    format: formatWaitTime,
  },
  {
    key: "completePhraseCutoffMs",
    label: "Speed when you are done",
    hint: "How fast Berry responds once she hears a clear ending (like a period or です)",
    format: formatWaitTime,
  },
  {
    key: "listenAfterSpeakMs",
    label: "After Berry speaks",
    hint: "Short pause when Berry finishes, before the mic turns back on for you",
    format: formatWaitTime,
  },
  {
    key: "berrySpeakingNoiseFloor",
    label: "Ignore Berry's voice",
    hint: "Higher means your mic is less likely to hear Berry from your speakers",
    format: formatEchoGuard,
  },
];

function clampField(key: keyof PracticeVoiceSettings, value: number): number {
  const { min, max, step } = BOUNDS[key];
  const stepped = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, stepped));
}

export function clampPracticeVoiceSettings(
  raw: Partial<PracticeVoiceSettings>
): PracticeVoiceSettings {
  const base = { ...DEFAULT_PRACTICE_VOICE_SETTINGS };
  for (const key of Object.keys(base) as (keyof PracticeVoiceSettings)[]) {
    const v = raw[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      base[key] = clampField(key, v);
    }
  }
  return base;
}

export function loadPracticeVoiceSettings(): PracticeVoiceSettings {
  if (typeof window === "undefined") return { ...DEFAULT_PRACTICE_VOICE_SETTINGS };
  try {
    const raw = localStorage.getItem(PRACTICE_VOICE_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_PRACTICE_VOICE_SETTINGS };
    return clampPracticeVoiceSettings(JSON.parse(raw) as Partial<PracticeVoiceSettings>);
  } catch {
    return { ...DEFAULT_PRACTICE_VOICE_SETTINGS };
  }
}

export function savePracticeVoiceSettings(settings: PracticeVoiceSettings): void {
  try {
    localStorage.setItem(
      PRACTICE_VOICE_SETTINGS_KEY,
      JSON.stringify(clampPracticeVoiceSettings(settings))
    );
  } catch {
    /* ignore */
  }
}

export function settingBounds(key: keyof PracticeVoiceSettings) {
  return BOUNDS[key];
}
