import {
  PRESENTATION_ZOOM_MIN,
  PRESENTATION_ZOOM_MAX,
} from "@/hooks/usePresentationCardZoom";

const ZOOM_STEP = 0.05;

type Props = {
  zoom: number;
  onChange: (zoom: number) => void;
  className?: string;
};

function ZoomOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="M21 21l-4.35-4.35M8 11h6" />
    </svg>
  );
}

function ZoomInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="M21 21l-4.35-4.35M8 11h6M11 8v6" />
    </svg>
  );
}

export function PresentationCardZoomSlider({ zoom, onChange, className }: Props) {
  const percent = Math.round(zoom * 100);
  const minPct = Math.round(PRESENTATION_ZOOM_MIN * 100);
  const maxPct = Math.round(PRESENTATION_ZOOM_MAX * 100);

  const stepDown = () => onChange(Math.max(PRESENTATION_ZOOM_MIN, zoom - ZOOM_STEP));
  const stepUp = () => onChange(Math.min(PRESENTATION_ZOOM_MAX, zoom + ZOOM_STEP));

  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 sm:gap-2 ${className ?? ""}`}
      role="group"
      aria-label="Card zoom"
    >
      <button
        type="button"
        onClick={stepDown}
        disabled={zoom <= PRESENTATION_ZOOM_MIN}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-600 disabled:opacity-30"
        aria-label="Zoom out"
      >
        <ZoomOutIcon className="h-4 w-4" />
      </button>
      <input
        type="range"
        min={minPct}
        max={maxPct}
        step={5}
        value={percent}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="h-2 min-w-0 flex-1 cursor-pointer accent-pink-500"
        aria-label="Card zoom"
        aria-valuemin={minPct}
        aria-valuemax={maxPct}
        aria-valuenow={percent}
        aria-valuetext={`${percent}%`}
      />
      <button
        type="button"
        onClick={stepUp}
        disabled={zoom >= PRESENTATION_ZOOM_MAX}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-600 disabled:opacity-30"
        aria-label="Zoom in"
      >
        <ZoomInIcon className="h-4 w-4" />
      </button>
      <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-slate-500 sm:w-10">
        {percent}%
      </span>
    </div>
  );
}
