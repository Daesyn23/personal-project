"use client";

import { memo, useMemo } from "react";

type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

type Props = {
  phase: VoicePhase;
  level: number;
  speechDetected: boolean;
};

const BAR_COUNT = 11;

function VoiceActivityVisualizerInner({ phase, level, speechDetected }: Props) {
  const listening = phase === "listening";
  const active = listening && (speechDetected || level > 0.07);
  const idlePulse = listening && !active;
  const quantizeLevel = (level: number) => Math.round(level * 10) / 10;
  const quantizedLevel = quantizeLevel(level);

  const bars = useMemo(() => {
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      const center = (BAR_COUNT - 1) / 2;
      const dist = Math.abs(i - center) / center;
      const envelope = Math.pow(1 - dist * 0.45, 1.2);
      const wave = active
        ? 0.35 + 0.65 * envelope * (0.25 + quantizedLevel * 0.75)
        : idlePulse
          ? 0.2 + 0.08 * envelope
          : 0.12;
      const scale = Math.max(0.08, wave);
      return { scale, active };
    });
  }, [active, idlePulse, quantizedLevel]);

  return (
    <div
      className="flex h-12 items-end justify-center gap-[3px]"
      role="img"
      aria-hidden
    >
      {bars.map((bar, i) => (
        <span
          key={i}
          className={`h-12 w-[5px] origin-bottom rounded-full ${
            phase === "speaking"
              ? "bg-pink-500"
              : phase === "thinking"
                ? "bg-amber-400"
                : bar.active
                  ? "bg-rose-500"
                  : listening
                    ? "bg-rose-200/90"
                    : "bg-stone-200/80"
          }`}
          style={{
            transform: `scaleY(${bar.scale})`,
            opacity: bar.active ? 0.95 : idlePulse ? 0.55 : 0.35,
            boxShadow: bar.active ? "0 0 8px rgba(244,63,94,0.35)" : undefined,
            transition: "transform 180ms ease-out, opacity 180ms ease-out",
          }}
        />
      ))}
    </div>
  );
}

export const VoiceActivityVisualizer = memo(VoiceActivityVisualizerInner);
