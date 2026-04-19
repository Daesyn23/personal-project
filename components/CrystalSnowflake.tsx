"use client";

const ROTATIONS = [0, 60, 120, 180, 240, 300] as const;

const OUTLINE_PAD = 1.35;
/** Soft cool edge so white reads on blush pink (not colored snow). */
const EDGE = "rgba(148, 163, 184, 0.42)";
const EDGE_SOFT = "rgba(148, 163, 184, 0.34)";
const EDGE_MUTE = "rgba(148, 163, 184, 0.3)";
const SNOW = "#ffffff";

type Variant = 0 | 1 | 2;

type Props = {
  className?: string;
  sizeRem?: number;
  variant?: Variant;
};

/** Six-fold dendrite flake: white crystal + light slate under-stroke for definition. */
export function CrystalSnowflake({ className, sizeRem = 1.4, variant = 0 }: Props) {
  const arm =
    variant === 0 ? (
      <g strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 32 L32 11" fill="none" strokeWidth={1.75 + OUTLINE_PAD} stroke={EDGE} />
        <path d="M32 26 L25.5 21.5 M32 26 L38.5 21.5" strokeWidth={1.2 + OUTLINE_PAD} stroke={EDGE_SOFT} />
        <path d="M32 21.5 L27 17 M32 21.5 L37 17" strokeWidth={1.05 + OUTLINE_PAD} stroke={EDGE_SOFT} />
        <path d="M32 17 L28.5 13.5 M32 17 L35.5 13.5" strokeWidth={0.95 + OUTLINE_PAD} stroke={EDGE_MUTE} />
        <path d="M32 13 L29.5 9.8 M32 13 L34.5 9.8" strokeWidth={0.85 + OUTLINE_PAD} stroke={EDGE_MUTE} />
        <circle cx="32" cy="8.5" r={1.75 + OUTLINE_PAD * 0.35} fill={EDGE} />
        <path d="M30 14 L32 11 L34 14" fill="none" strokeWidth={0.65 + OUTLINE_PAD} stroke={EDGE_MUTE} />

        <path d="M32 32 L32 11" fill="none" strokeWidth="1.75" stroke={SNOW} />
        <path d="M32 26 L25.5 21.5 M32 26 L38.5 21.5" strokeWidth="1.2" stroke={SNOW} />
        <path d="M32 21.5 L27 17 M32 21.5 L37 17" strokeWidth="1.05" stroke={SNOW} />
        <path d="M32 17 L28.5 13.5 M32 17 L35.5 13.5" strokeWidth="0.95" stroke={SNOW} />
        <path d="M32 13 L29.5 9.8 M32 13 L34.5 9.8" strokeWidth="0.85" stroke={SNOW} />
        <circle cx="32" cy="8.5" r="1.75" fill={SNOW} />
        <path d="M30 14 L32 11 L34 14" fill="none" strokeWidth="0.65" stroke={SNOW} opacity={0.98} />
      </g>
    ) : variant === 1 ? (
      <g strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 32 L32 12" fill="none" strokeWidth={1.65 + OUTLINE_PAD} stroke={EDGE} />
        <path d="M32 25 L24 19 M32 25 L40 19" strokeWidth={1.25 + OUTLINE_PAD} stroke={EDGE_SOFT} />
        <path d="M32 19.5 L26.5 15 M32 19.5 L37.5 15" strokeWidth={1.05 + OUTLINE_PAD} stroke={EDGE_SOFT} />
        <path d="M32 15 L27 11.5 M32 15 L37 11.5" strokeWidth={0.92 + OUTLINE_PAD} stroke={EDGE_MUTE} />
        <path d="M29 22 L26 19 M35 22 L38 19" strokeWidth={0.78 + OUTLINE_PAD} stroke={EDGE_MUTE} />
        <path d="M29 16 L27 13 M35 16 L37 13" strokeWidth={0.72 + OUTLINE_PAD} stroke={EDGE_MUTE} />
        <circle cx="32" cy="9.5" r={1.55 + OUTLINE_PAD * 0.35} fill={EDGE} />

        <path d="M32 32 L32 12" fill="none" strokeWidth="1.65" stroke={SNOW} />
        <path d="M32 25 L24 19 M32 25 L40 19" strokeWidth="1.25" stroke={SNOW} />
        <path d="M32 19.5 L26.5 15 M32 19.5 L37.5 15" strokeWidth="1.05" stroke={SNOW} />
        <path d="M32 15 L27 11.5 M32 15 L37 11.5" strokeWidth="0.92" stroke={SNOW} />
        <path d="M29 22 L26 19 M35 22 L38 19" strokeWidth="0.78" stroke={SNOW} opacity={0.98} />
        <path d="M29 16 L27 13 M35 16 L37 13" strokeWidth="0.72" stroke={SNOW} opacity={0.98} />
        <circle cx="32" cy="9.5" r="1.55" fill={SNOW} />
      </g>
    ) : (
      <g strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 32 L32 13" fill="none" strokeWidth={1.82 + OUTLINE_PAD} stroke={EDGE} />
        <path d="M32 26.5 L26 22 M32 26.5 L38 22" strokeWidth={1.18 + OUTLINE_PAD} stroke={EDGE_SOFT} />
        <path d="M32 22 L27.5 18 M32 22 L36.5 18" strokeWidth={1.05 + OUTLINE_PAD} stroke={EDGE_SOFT} />
        <path d="M32 17.5 L28 14 M32 17.5 L36 14" strokeWidth={0.92 + OUTLINE_PAD} stroke={EDGE_MUTE} />
        <path d="M32 13.5 L29.5 10.5 M32 13.5 L34.5 10.5" strokeWidth={0.8 + OUTLINE_PAD} stroke={EDGE_MUTE} />
        <path d="M31 10 L32 7 L33 10" fill="none" strokeWidth={0.72 + OUTLINE_PAD} stroke={EDGE_MUTE} />
        <circle cx="32" cy="7.2" r={1.4 + OUTLINE_PAD * 0.35} fill={EDGE} />

        <path d="M32 32 L32 13" fill="none" strokeWidth="1.82" stroke={SNOW} />
        <path d="M32 26.5 L26 22 M32 26.5 L38 22" strokeWidth="1.18" stroke={SNOW} />
        <path d="M32 22 L27.5 18 M32 22 L36.5 18" strokeWidth="1.05" stroke={SNOW} />
        <path d="M32 17.5 L28 14 M32 17.5 L36 14" strokeWidth="0.92" stroke={SNOW} />
        <path d="M32 13.5 L29.5 10.5 M32 13.5 L34.5 10.5" strokeWidth="0.8" stroke={SNOW} />
        <path d="M31 10 L32 7 L33 10" fill="none" strokeWidth="0.72" stroke={SNOW} />
        <circle cx="32" cy="7.2" r="1.4" fill={SNOW} />
      </g>
    );

  return (
    <svg
      className={className}
      width={`${sizeRem}rem`}
      height={`${sizeRem}rem`}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <g>
        {ROTATIONS.map((deg) => (
          <g key={deg} transform={`rotate(${deg} 32 32)`}>
            {arm}
          </g>
        ))}
        <circle cx="32" cy="32" r={2.35 + OUTLINE_PAD * 0.4} fill={EDGE} />
        <circle cx="32" cy="32" r="2.35" fill={SNOW} />
      </g>
    </svg>
  );
}
