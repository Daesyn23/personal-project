export const STORAGE_HISTORY = "workspace-en-ja-translation-history-v1";
export const STORAGE_DIRECTION = "workspace-translation-direction-v1";
export const MAX_HISTORY = 24;
export const MAX_SOURCE = 4000;

export type Tone = "neutral" | "polite" | "casual";
export type TranslateDirection = "en-ja" | "ja-en";

export type HistoryRow = {
  id: string;
  at: number;
  direction: TranslateDirection;
  source: string;
  translation: string;
  reading: string | null;
  tone: Tone;
};

export type TranslateEnJaResponse = {
  japanese: string;
  reading: string | null;
  nuance: string | null;
  error?: string;
};

export type TranslateJaEnResponse = {
  english: string;
  nuance: string | null;
  error?: string;
};

export type TranslateResultEnJa = {
  direction: "en-ja";
  japanese: string;
  reading: string | null;
  nuance: string | null;
};

export type TranslateResultJaEn = {
  direction: "ja-en";
  english: string;
  nuance: string | null;
};

export type TranslateResult = TranslateResultEnJa | TranslateResultJaEn;

export function loadDirection(): TranslateDirection {
  if (typeof window === "undefined") return "en-ja";
  try {
    const raw = localStorage.getItem(STORAGE_DIRECTION);
    if (raw === "ja-en" || raw === "en-ja") return raw;
  } catch {
    /* ignore */
  }
  return "en-ja";
}

export function saveDirection(d: TranslateDirection) {
  try {
    localStorage.setItem(STORAGE_DIRECTION, d);
  } catch {
    /* quota */
  }
}

export function loadHistory(): HistoryRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    const out: HistoryRow[] = [];
    for (const row of p) {
      if (!row || typeof row !== "object") continue;
      const id = (row as { id?: unknown }).id;
      const at = (row as { at?: unknown }).at;
      const source = (row as { source?: unknown }).source;
      const translationRaw = (row as { translation?: unknown }).translation;
      const japaneseLegacy = (row as { japanese?: unknown }).japanese;
      const reading = (row as { reading?: unknown }).reading;
      const tone = (row as { tone?: unknown }).tone;
      const directionRaw = (row as { direction?: unknown }).direction;
      if (typeof id !== "string" || typeof at !== "number") continue;
      if (typeof source !== "string") continue;
      if (tone !== "neutral" && tone !== "polite" && tone !== "casual") continue;
      const translation =
        typeof translationRaw === "string"
          ? translationRaw
          : typeof japaneseLegacy === "string"
            ? japaneseLegacy
            : "";
      if (!translation) continue;
      const direction: TranslateDirection =
        directionRaw === "ja-en" || directionRaw === "en-ja" ? directionRaw : "en-ja";
      const r = reading === null || typeof reading === "string" ? reading : null;
      out.push({
        id,
        at,
        direction,
        source,
        translation,
        reading: direction === "ja-en" ? null : r,
        tone,
      });
    }
    return out.slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

export function saveHistory(rows: HistoryRow[]) {
  try {
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(rows.slice(0, MAX_HISTORY)));
  } catch {
    /* quota */
  }
}

export async function runTranslation(opts: {
  direction: TranslateDirection;
  text: string;
  tone: Tone;
  includeReading: boolean;
  context?: string;
}): Promise<TranslateResult> {
  const { direction, text, tone, includeReading, context } = opts;
  if (direction === "en-ja") {
    const res = await fetch("/api/translate/en-ja", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        style: tone,
        includeReading,
        context: context?.trim() || undefined,
      }),
    });
    const data = (await res.json()) as TranslateEnJaResponse;
    if (!res.ok) throw new Error(data.error || "Translation failed.");
    return {
      direction: "en-ja",
      japanese: data.japanese,
      reading: data.reading,
      nuance: data.nuance,
    };
  }
  const res = await fetch("/api/translate/ja-en", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      style: tone,
      context: context?.trim() || undefined,
    }),
  });
  const data = (await res.json()) as TranslateJaEnResponse;
  if (!res.ok) throw new Error(data.error || "Translation failed.");
  return {
    direction: "ja-en",
    english: data.english,
    nuance: data.nuance,
  };
}

/** System Japanese stack (no extra font download). */
export const jpFontClass =
  "[font-family:ui-sans-serif,'Hiragino_Sans','Hiragino_Kaku_Gothic_ProN','Yu_Gothic_UI','Yu_Gothic',Meiryo,sans-serif]";

export function toneBtnClass(active: boolean, compact = false) {
  const pad = compact ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-xs sm:px-4 sm:text-sm";
  return `rounded-xl border font-semibold transition ${pad} ${
    active
      ? "border-pink-400 bg-pink-50 text-pink-950 shadow-sm ring-1 ring-pink-200"
      : "border-neutral-200/90 bg-white text-neutral-600 hover:border-pink-200 hover:bg-pink-50/50"
  }`;
}
