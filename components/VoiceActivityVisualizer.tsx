"use client";

type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

type Props = {
  phase: VoicePhase;
  level: number;
  speechDetected: boolean;
};

const BAR_COUNT = 11;

export function VoiceActivityVisualizer({ phase, level, speechDetected }: Props) {
  const listening = phase === "listening";
  const active = listening && (speechDetected || level > 0.02);
  const idlePulse = listening && !active;

  return (
    <div
      className="flex h-12 items-end justify-center gap-[3px]"
      role="img"
      aria-hidden
    >
      {Array.from({ length: BAR_COUNT }).map((_, i) => {
        const center = (BAR_COUNT - 1) / 2;
        const dist = Math.abs(i - center) / center;
        const envelope = Math.pow(1 - dist * 0.45, 1.2);
        const wave = active
          ? 0.35 + 0.65 * envelope * (0.25 + level * 0.75)
          : idlePulse
            ? 0.2 + 0.08 * envelope
            : 0.12;
        const h = Math.max(4, Math.round(wave * 48));
        return (
          <span
            key={i}
            className={`w-[5px] rounded-full transition-all duration-100 ${
              phase === "speaking"
                ? "bg-pink-500"
                : phase === "thinking"
                  ? "bg-amber-400"
                  : active
                    ? "bg-rose-500"
                    : listening
                      ? "bg-rose-200/90"
                      : "bg-stone-200/80"
            }`}
            style={{
              height: `${h}px`,
              opacity: active ? 0.95 : idlePulse ? 0.55 : 0.35,
              boxShadow: active ? "0 0 8px rgba(244,63,94,0.35)" : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
