/**
 * Model IDs for {@link https://generativelanguage.googleapis.com Generative Language API}.
 * Short names like `gemini-1.5-flash` often return 404; use a current id or an alias below.
 */
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";

/** Retired / ambiguous names → supported model id (see Gemini API release notes). */
const GEMINI_MODEL_ALIASES: Record<string, string> = {
  "gemini-1.5-flash": "gemini-2.0-flash",
  "gemini-1.5-flash-latest": "gemini-2.0-flash",
  "gemini-1.5-pro": "gemini-2.0-flash",
  "gemini-1.5-pro-latest": "gemini-2.0-flash",
  "gemini-pro": "gemini-2.0-flash",
};

export function resolveGeminiModelId(raw?: string | null): string {
  const key = raw?.trim();
  if (!key) return DEFAULT_GEMINI_MODEL;
  const lower = key.toLowerCase();
  return GEMINI_MODEL_ALIASES[lower] ?? key;
}
