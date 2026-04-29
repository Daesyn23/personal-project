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

function geminiErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Parses "Please retry in 54.33s" from GoogleGenerativeAI / Generative Language API errors. */
export function parseRetryDelayMsFromGeminiError(error: unknown): number | null {
  const msg = geminiErrorText(error);
  const m = /retry in ([\d.]+)\s*s/i.exec(msg);
  if (!m) return null;
  const sec = Number.parseFloat(m[1]!);
  if (!Number.isFinite(sec) || sec < 0) return null;
  return Math.round(sec * 1000);
}

export function isGemini429OrQuotaError(error: unknown): boolean {
  const msg = geminiErrorText(error).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("too many requests") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted")
  );
}

/**
 * Free-tier Gemini (AI Studio API key) uses the same Flash / Flash-Lite model names as paid usage;
 * limits are RPM, RPD, and tokens — not a different "free model id". Callers can retry once after
 * RetryInfo to recover from per-minute spikes (still subject to daily caps).
 */
export async function withGemini429QuotaRetry<T>(
  run: () => Promise<T>,
  options?: { maxDelayMs?: number }
): Promise<T> {
  const maxDelayMs = options?.maxDelayMs ?? 90_000;
  try {
    return await run();
  } catch (first) {
    if (!isGemini429OrQuotaError(first)) throw first;
    const delay = parseRetryDelayMsFromGeminiError(first);
    const ms = delay == null ? 2000 : Math.min(Math.max(delay, 500), maxDelayMs);
    await new Promise((r) => setTimeout(r, ms));
    return await run();
  }
}

/** Appended to API error strings so users know 429 is billing/limits, not missing "free models". */
export function appendGeminiFreeTierQuotaHint(message: string): string {
  const m = message.trim();
  if (!m) return m;
  if (/ai\.google\.dev\/gemini-api\/docs\/rate-limits/i.test(m)) return m;
  return `${m}\n\nFree tier: Gemini Flash and Flash-Lite are already the standard low-cost models; 429 means per-minute or daily request/token limits for your API key (see https://ai.google.dev/gemini-api/docs/rate-limits ). Wait for the reset, try GEMINI_MODEL=gemini-2.5-flash-lite to reduce tokens, enable pay-as-you-go billing on the same Google Cloud / AI Studio project for higher limits, or use a separate API key/project.`;
}
