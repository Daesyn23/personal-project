import { shouldAttemptNextGeminiModel } from "@/lib/gemini-model";
import { groqChatCompletionText, isGroqConfigured, type GroqChatMessage } from "@/lib/groq-openai";
import { isOpenAiChatConfigured, openaiChatCompletionText, type OpenAiChatMessage } from "@/lib/openai-chat";

export type LlmTextResult = { text: string; provider: "gemini" | "groq" | "openai"; model: string };

/** True when at least one text LLM provider is available (Gemini key and/or Groq and/or OpenAI). */
export function isAnyTextLlmConfigured(geminiApiKey: string | undefined): boolean {
  return Boolean(geminiApiKey?.trim()) || isGroqConfigured() || isOpenAiChatConfigured();
}

/** Do not call Groq if Gemini failed for an invalid Google API key (misconfiguration). */
export function shouldUseGroqAfterGeminiFailure(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (msg.includes("api key not valid") || msg.includes("api_key_invalid")) return false;
  return true;
}

function toOpenAiMessages(messages: GroqChatMessage[]): OpenAiChatMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Runs Gemini across `modelAttempts`, then Groq chat completion, then OpenAI Chat Completions,
 * using the same message list (system + user + assistant) and JSON mode when requested.
 */
export async function generateTextGeminiThenGroq(options: {
  logLabel: string;
  geminiApiKey: string | undefined;
  modelAttempts: string[];
  runGemini: (modelName: string) => Promise<string>;
  groq: { messages: GroqChatMessage[]; jsonMode?: boolean; temperature?: number };
}): Promise<LlmTextResult> {
  const { logLabel, geminiApiKey, modelAttempts, runGemini, groq } = options;
  let lastErr: unknown;

  if (geminiApiKey) {
    for (let i = 0; i < modelAttempts.length; i++) {
      const modelName = modelAttempts[i]!;
      try {
        const text = await runGemini(modelName);
        const t = text?.trim();
        if (!t) throw new Error("Empty model response.");
        return { text: t, provider: "gemini", model: modelName };
      } catch (e) {
        lastErr = e;
        const canTryNext = i < modelAttempts.length - 1 && shouldAttemptNextGeminiModel(e);
        if (canTryNext) {
          console.warn(`[${logLabel}] Gemini model ${modelName} failed, trying next:`, e);
          continue;
        }
        break;
      }
    }
  }

  const canTryGroq =
    isGroqConfigured() && (lastErr === undefined || shouldUseGroqAfterGeminiFailure(lastErr));

  if (canTryGroq) {
    try {
      console.warn(`[${logLabel}] Using Groq fallback`, lastErr ?? "(Gemini not configured)");
      const { text, model } = await groqChatCompletionText({
        messages: groq.messages,
        jsonMode: groq.jsonMode,
        temperature: groq.temperature,
      });
      return { text: text.trim(), provider: "groq", model };
    } catch (e) {
      lastErr = e;
      console.warn(`[${logLabel}] Groq failed:`, e);
    }
  }

  if (isOpenAiChatConfigured()) {
    try {
      console.warn(`[${logLabel}] Using OpenAI fallback`, lastErr ?? "(prior providers unavailable)");
      const { text, model } = await openaiChatCompletionText({
        messages: toOpenAiMessages(groq.messages),
        jsonMode: groq.jsonMode,
        temperature: groq.temperature,
      });
      return { text: text.trim(), provider: "openai", model };
    } catch (e) {
      lastErr = e;
      console.warn(`[${logLabel}] OpenAI failed:`, e);
    }
  }

  if (lastErr instanceof Error) throw lastErr;
  if (lastErr) throw new Error(String(lastErr));
  throw new Error(
    "No LLM configured: set GEMINI_API_KEY, GROQ_API_KEY, and/or OPENAI_API_KEY in .env.local."
  );
}
