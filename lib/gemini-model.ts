/**
 * Model IDs for {@link https://generativelanguage.googleapis.com Generative Language API}.
 * Short names like `gemini-1.5-flash` often return 404; use a current id or an alias below.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/**
 * When the primary model fails (quota, 404, etc.), try these in order.
 * Keep Flash / Flash-Lite first for typical free-tier usage.
 */
export const GEMINI_FALLBACK_MODEL_IDS: readonly string[] = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
];

/** Retired / ambiguous names → supported model id (see Gemini API release notes). */
const GEMINI_MODEL_ALIASES: Record<string, string> = {
  "gemini-1.5-flash": "gemini-2.5-flash",
  "gemini-1.5-flash-latest": "gemini-2.5-flash",
  "gemini-1.5-pro": "gemini-2.5-flash",
  "gemini-1.5-pro-latest": "gemini-2.5-flash",
  "gemini-pro": "gemini-2.5-flash",
  "gemini-2.0-flash": "gemini-2.5-flash",
  "gemini-2.0-flash-latest": "gemini-2.5-flash",
};

export function resolveGeminiModelId(raw?: string | null): string {
  const key = raw?.trim();
  if (!key) return DEFAULT_GEMINI_MODEL;
  const lower = key.toLowerCase();
  return GEMINI_MODEL_ALIASES[lower] ?? key;
}

/** Ordered unique list: env primary first, then fallbacks (for quota / 404 retries). */
export function geminiModelAttemptOrder(primaryResolved: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [primaryResolved, ...GEMINI_FALLBACK_MODEL_IDS]) {
    const t = id.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Whether trying another model id might help (vs bad API key or client mistake). */
export function shouldAttemptNextGeminiModel(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (
    msg.includes("api key not valid") ||
    msg.includes("api_key_invalid") ||
    msg.includes("permission denied")
  ) {
    return false;
  }
  return (
    msg.includes("429") ||
    msg.includes("too many requests") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("503") ||
    msg.includes("unavailable") ||
    msg.includes("404") ||
    msg.includes("not found") ||
    msg.includes("does not exist") ||
    msg.includes("is not found")
  );
}
