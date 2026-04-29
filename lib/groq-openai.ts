/**
 * Groq OpenAI-compatible chat completions (https://console.groq.com/).
 */

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Default model; override with GROQ_MODEL in .env (see Groq console for current ids). */
export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

export type GroqChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

export function resolveGroqModelId(): string {
  const raw = process.env.GROQ_MODEL?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_GROQ_MODEL;
}

export async function groqChatCompletionText(options: {
  messages: GroqChatMessage[];
  jsonMode?: boolean;
  model?: string;
  temperature?: number;
}): Promise<{ text: string; model: string }> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set.");
  }

  const model = (options.model ?? resolveGroqModelId()).trim();

  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: 8192,
  };
  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Groq API returned non-JSON (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    const errMsg =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error?: { message?: string } }).error?.message ?? raw.slice(0, 400))
        : raw.slice(0, 400);
    throw new Error(`Groq error (${res.status}): ${errMsg}`);
  }

  const text = (data as { choices?: { message?: { content?: string | null } }[] })?.choices?.[0]?.message
    ?.content;
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) {
    throw new Error("Groq returned an empty response.");
  }
  return { text: trimmed, model };
}
