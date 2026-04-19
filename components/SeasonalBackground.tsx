"use client";

import { CrystalSnowflake } from "@/components/CrystalSnowflake";
import { SakuraSpringHorizon } from "@/components/SakuraSpringHorizon";

/**
 * “Spring thaw sky” — layered CSS snow (cheap), few petals & crystal flakes, static horizon art.
 * Deterministic positions for stable SSR/hydration.
 */

const PETALS = 10;
const SNOW_SPARKLE = 12;
const FLAKES = 7;

function pct(seed: number, mod: number): string {
  return `${(seed * 37 + 11) % mod}%`;
}

export function SeasonalBackground() {
  const petals = Array.from({ length: PETALS }, (_, i) => ({
    id: `sakura-${i}`,
    left: pct(i, 96),
    delay: `${(i * 0.45) % 9}s`,
    duration: `${12 + (i % 9)}s`,
    variant: i % 3,
  }));

  const snow = Array.from({ length: SNOW_SPARKLE }, (_, i) => ({
    id: `snow-${i}`,
    left: pct(i + 3, 100),
    delay: `${(i * 0.35) % 6}s`,
    duration: `${9 + (i % 10)}s`,
    size: 2 + (i % 3),
  }));

  const flakes = Array.from({ length: FLAKES }, (_, i) => ({
    id: `flake-${i}`,
    left: pct(i + 7, 94),
    delay: `${(i * 0.7) % 10}s`,
    duration: `${14 + (i % 7)}s`,
    sizeRem: 1.35 + (i % 6) * 0.22,
    variant: (i % 3) as 0 | 1 | 2,
  }));

  return (
    <div
      className="seasonal-backdrop pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ contain: "layout paint" }}
      aria-hidden
    >
      {/* winter sky + spring light — new palette */}
      <div className="seasonal-backdrop-gradient absolute inset-0" />

      {/* soft snow field: two parallax tiles (GPU-friendly transform only) */}
      <div className="seasonal-snow-field seasonal-snow-field-a absolute inset-[-15%_0_-10%_0]" />
      <div className="seasonal-snow-field seasonal-snow-field-b absolute inset-[-15%_0_-10%_0]" />

      {/* a few larger snow specks for depth */}
      {snow.map((s) => (
        <span
          key={s.id}
          className="seasonal-snow seasonal-motion absolute rounded-full bg-white/90"
          style={{
            left: s.left,
            top: "-4%",
            width: s.size,
            height: s.size,
            animationDuration: s.duration,
            animationDelay: s.delay,
          }}
        />
      ))}

      <SakuraSpringHorizon />

      {/* sakura petals */}
      {petals.map((p) => (
        <span
          key={p.id}
          className={`seasonal-petal seasonal-motion absolute ${p.variant === 0 ? "seasonal-petal-a" : p.variant === 1 ? "seasonal-petal-b" : "seasonal-petal-c"}`}
          style={{
            left: p.left,
            top: "-6%",
            animationDuration: p.duration,
            animationDelay: p.delay,
          }}
        />
      ))}

      {/* crystal snowflakes — no CSS filter glow (outline is in SVG) */}
      {flakes.map((f) => (
        <span
          key={f.id}
          className="seasonal-flake seasonal-motion absolute flex items-center justify-center"
          style={{
            left: f.left,
            top: "-6%",
            animationDuration: f.duration,
            animationDelay: f.delay,
          }}
        >
          <CrystalSnowflake variant={f.variant} sizeRem={f.sizeRem} />
        </span>
      ))}
    </div>
  );
}
