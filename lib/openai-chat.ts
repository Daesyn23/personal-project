/**
 * OpenAI Chat Completions (https://platform.openai.com/docs/api-reference/chat).
 * Used as a backup after Gemini and Groq for text tasks.
 */

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

/** Default chat model for fallbacks; override with OPENAI_CHAT_MODEL. */
export const DEFAULT_OPENAI_CHAT_MODEL = "gpt-4o-mini";

export type OpenAiChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function isOpenAiChatConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function resolveOpenAiChatModelId(): string {
  const raw = process.env.OPENAI_CHAT_MODEL?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_OPENAI_CHAT_MODEL;
}

export async function openaiChatCompletionText(options: {
  messages: OpenAiChatMessage[];
  jsonMode?: boolean;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ text: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const model = (options.model ?? resolveOpenAiChatModelId()).trim();

  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 8192,
  };
  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(OPENAI_CHAT_URL, {
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
    throw new Error(`OpenAI Chat API returned non-JSON (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    const errMsg =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error?: { message?: string } }).error?.message ?? raw.slice(0, 400))
        : raw.slice(0, 400);
    throw new Error(`OpenAI Chat error (${res.status}): ${errMsg}`);
  }

  const text = (data as { choices?: { message?: { content?: string | null } }[] })?.choices?.[0]?.message
    ?.content;
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) {
    throw new Error("OpenAI returned an empty response.");
  }
  return { text: trimmed, model };
}

/**
 * Stream chat completion deltas (OpenAI SSE). Yields content token strings.
 */
export async function* openaiChatCompletionStream(options: {
  messages: OpenAiChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): AsyncGenerator<string, { model: string }, void> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const model = (options.model ?? resolveOpenAiChatModelId()).trim();

  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 8192,
      stream: true,
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    let errMsg = raw.slice(0, 400);
    try {
      const data = JSON.parse(raw) as { error?: { message?: string } };
      errMsg = data.error?.message ?? errMsg;
    } catch {
      /* use raw slice */
    }
    throw new Error(`OpenAI Chat error (${res.status}): ${errMsg}`);
  }

  if (!res.body) {
    throw new Error("OpenAI stream returned no body.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return { model };
        try {
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: string | null } }[];
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            yield delta;
          }
        } catch {
          /* skip malformed SSE line */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { model };
}

/** OpenAI Chat Completions `messages[].content` may be a string or multimodal parts. */
export type OpenAiMultimodalContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

export type OpenAiMultimodalMessage = {
  role: "system" | "user" | "assistant";
  content: string | OpenAiMultimodalContentPart[];
};

/**
 * Chat with images (vision). Uses the same API key as text chat; prefer a vision-capable model
 * (default `gpt-4o-mini` via OPENAI_CHAT_MODEL).
 */
export async function openaiChatCompletionMultimodal(options: {
  messages: OpenAiMultimodalMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ text: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const model = (options.model ?? resolveOpenAiChatModelId()).trim();

  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 4096,
  };

  const res = await fetch(OPENAI_CHAT_URL, {
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
    throw new Error(`OpenAI Chat API returned non-JSON (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    const errMsg =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error?: { message?: string } }).error?.message ?? raw.slice(0, 400))
        : raw.slice(0, 400);
    throw new Error(`OpenAI Chat error (${res.status}): ${errMsg}`);
  }

  const text = (data as { choices?: { message?: { content?: string | null } }[] })?.choices?.[0]?.message
    ?.content;
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) {
    throw new Error("OpenAI returned an empty response.");
  }
  return { text: trimmed, model };
}
