import type { DetectedLanguage } from "@/lib/detect-utterance-language";
import type { JlptPracticeLevel } from "@/lib/japanese-practice-prompt";

export type PracticeStreamResult = {
  text: string;
  model?: string;
  detectedLanguage?: DetectedLanguage;
};

/**
 * POST practice-chat with SSE streaming; calls `onDelta` for each token chunk.
 */
export async function streamPracticeChat(
  options: {
    jlptLevel: JlptPracticeLevel;
    messages: { role: "user" | "assistant"; content: string }[];
    signal?: AbortSignal;
  },
  onDelta: (accumulated: string) => void
): Promise<PracticeStreamResult> {
  const res = await fetch("/api/japanese/practice-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jlptLevel: options.jlptLevel,
      messages: options.messages,
      stream: true,
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Practice chat failed (${res.status}).`);
  }

  if (!res.body) {
    throw new Error("Practice chat stream returned no body.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        const line = event
          .split("\n")
          .map((l) => l.trim())
          .find((l) => l.startsWith("data:"));
        if (!line) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;

        let payload: {
          delta?: string;
          done?: boolean;
          text?: string;
          error?: string;
          model?: string;
          detectedLanguage?: DetectedLanguage;
        };
        try {
          payload = JSON.parse(raw) as typeof payload;
        } catch {
          continue;
        }

        if (payload.error) {
          throw new Error(payload.error);
        }
        if (typeof payload.delta === "string") {
          accumulated += payload.delta;
          onDelta(accumulated);
        }
        if (payload.done) {
          const text = (payload.text ?? accumulated).trim();
          if (!text) throw new Error("Empty response from tutor.");
          return {
            text,
            model: payload.model,
            detectedLanguage: payload.detectedLanguage,
          };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (accumulated.trim()) {
    return { text: accumulated.trim() };
  }
  throw new Error("Practice chat stream ended without a reply.");
}
