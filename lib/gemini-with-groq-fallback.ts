import { shouldAttemptNextGeminiModel } from "@/lib/gemini-model";
import { groqChatCompletionText, isGroqConfigured, type GroqChatMessage } from "@/lib/groq-openai";

export type LlmTextResult = { text: string; provider: "gemini" | "groq"; model: string };

/** Do not call Groq if Gemini failed for an invalid Google API key (misconfiguration). */
export function shouldUseGroqAfterGeminiFailure(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (msg.includes("api key not valid") || msg.includes("api_key_invalid")) return false;
  return true;
}

/**
 * Runs Gemini across `modelAttempts`, then a single Groq chat completion with the same semantics
 * (system + user messages / JSON mode) when Groq is configured and Gemini did not return text.
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

  if (!isGroqConfigured()) {
    if (lastErr instanceof Error) throw lastErr;
    if (lastErr) throw new Error(String(lastErr));
    throw new Error("No LLM configured: set GEMINI_API_KEY and/or GROQ_API_KEY in .env.local.");
  }

  if (lastErr !== undefined && !shouldUseGroqAfterGeminiFailure(lastErr)) {
    if (lastErr instanceof Error) throw lastErr;
    throw new Error(String(lastErr));
  }

  console.warn(`[${logLabel}] Using Groq fallback`, lastErr ?? "(Gemini not configured)");
  const { text, model } = await groqChatCompletionText({
    messages: groq.messages,
    jsonMode: groq.jsonMode,
    temperature: groq.temperature,
  });
  return { text: text.trim(), provider: "groq", model };
}
