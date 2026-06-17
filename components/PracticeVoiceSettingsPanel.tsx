"use client";

import {
  DEFAULT_PRACTICE_VOICE_SETTINGS,
  PRACTICE_VOICE_PRESETS,
  PRACTICE_VOICE_SETTING_FIELDS,
  type PracticeVoiceSettings,
  type PracticeVoiceSettingsPreset,
  savePracticeVoiceSettings,
  settingBounds,
} from "@/lib/practice-voice-settings";

type Props = {
  settings: PracticeVoiceSettings;
  onChange: (settings: PracticeVoiceSettings) => void;
  disabled?: boolean;
};

export function PracticeVoiceSettingsPanel({ settings, onChange, disabled }: Props) {
  const applyPreset = (preset: PracticeVoiceSettingsPreset) => {
    const next = { ...PRACTICE_VOICE_PRESETS[preset].settings };
    onChange(next);
    savePracticeVoiceSettings(next);
  };

  const update = (key: keyof PracticeVoiceSettings, value: number) => {
    const next = { ...settings, [key]: value };
    onChange(next);
    savePracticeVoiceSettings(next);
  };

  const reset = () => {
    const next = { ...DEFAULT_PRACTICE_VOICE_SETTINGS };
    onChange(next);
    savePracticeVoiceSettings(next);
  };

  return (
    <div className="space-y-4 rounded-xl border border-pink-100 bg-pink-50/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-stone-900">Voice timing</p>
          <p className="mt-0.5 text-xs leading-relaxed text-stone-600">
            Calibrate how long Berry waits while you think. Try <span className="font-medium">Patient</span> if
            she cuts you off mid-sentence.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={disabled}
          className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm transition hover:border-pink-200 hover:bg-pink-50 disabled:opacity-45"
        >
          Reset defaults
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(PRACTICE_VOICE_PRESETS) as PracticeVoiceSettingsPreset[]).map((id) => {
          const preset = PRACTICE_VOICE_PRESETS[id];
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => applyPreset(id)}
              title={preset.hint}
              className="rounded-full border border-pink-200 bg-white px-3 py-1.5 text-xs font-bold text-pink-800 shadow-sm transition hover:bg-pink-100 disabled:opacity-45"
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {PRACTICE_VOICE_SETTING_FIELDS.map(({ key, label, hint, unit, format }) => {
          const bounds = settingBounds(key);
          const value = settings[key];
          const display = format ? format(value) : `${Math.round(value)}${unit ? ` ${unit}` : ""}`;
          return (
            <label key={key} className="block">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-stone-800">{label}</span>
                <span className="shrink-0 text-xs font-bold tabular-nums text-pink-700">{display}</span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-stone-500">{hint}</p>
              <input
                type="range"
                min={bounds.min}
                max={bounds.max}
                step={bounds.step}
                value={value}
                disabled={disabled}
                onChange={(e) => update(key, Number(e.target.value))}
                className="mt-2 h-2 w-full cursor-pointer accent-pink-600 disabled:opacity-45"
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
