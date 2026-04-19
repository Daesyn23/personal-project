/**
 * Static “spring meets winter” floor: soft drift + faint blossom silhouettes.
 * Single SVG — cheap to paint, no animation.
 */
export function SakuraSpringHorizon() {
  return (
    <svg
      className="seasonal-horizon-svg pointer-events-none absolute bottom-0 left-0 right-0 h-[min(32vh,240px)] w-full select-none"
      viewBox="0 0 1200 200"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="seasonal-horizon-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(253 242 248)" stopOpacity="0.55" />
          <stop offset="50%" stopColor="rgb(255 251 235)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="rgb(255 255 255)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="seasonal-horizon-snow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(255 255 255)" stopOpacity="0.42" />
          <stop offset="100%" stopColor="rgb(255 250 252)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* snow drift at feet of the scene */}
      <path
        d="M0,120 C200,95 400,130 600,105 C800,80 1000,115 1200,90 L1200,200 L0,200 Z"
        fill="url(#seasonal-horizon-snow)"
      />
      {/* warm spring glow hugging the bottom */}
      <path
        d="M0,145 C280,110 520,165 780,125 C950,100 1080,135 1200,115 L1200,200 L0,200 Z"
        fill="url(#seasonal-horizon-fade)"
      />
      {/* stylized sakura clusters — minimal paths */}
      <g fill="rgb(251 207 232)" fillOpacity="0.24" stroke="rgb(244 114 182)" strokeOpacity="0.18" strokeWidth="0.4">
        <ellipse cx="180" cy="118" rx="14" ry="10" transform="rotate(-12 180 118)" />
        <ellipse cx="210" cy="128" rx="11" ry="8" transform="rotate(8 210 128)" />
        <ellipse cx="980" cy="122" rx="16" ry="11" transform="rotate(15 980 122)" />
        <ellipse cx="1010" cy="132" rx="10" ry="7" transform="rotate(-6 1010 132)" />
        <ellipse cx="520" cy="138" rx="12" ry="9" transform="rotate(-4 520 138)" />
      </g>
    </svg>
  );
}
