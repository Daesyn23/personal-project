import { GoogleGenerativeAI, type Content } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { unpackChatMessageContent } from "@/lib/chat-vision-pack";
import { generateTextGeminiThenGroq, isAnyTextLlmConfigured } from "@/lib/gemini-with-groq-fallback";
import { geminiModelAttemptOrder, resolveGeminiModelId } from "@/lib/gemini-model";
import {
  isOpenAiChatConfigured,
  openaiChatCompletionMultimodal,
  type OpenAiMultimodalMessage,
} from "@/lib/openai-chat";

export const runtime = "nodejs";

type ChatRole = "user" | "assistant" | "system";

type IncomingMessage = {
  role: ChatRole;
  content: string;
};

const MAX_MESSAGE_CHARS = 32_000;
/** Reject packed image payloads larger than this (base64 + JSON overhead). */
const MAX_PACKED_IMAGE_CHARS = 5_500_000;

function normalizeMessages(raw: unknown): IncomingMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const out: IncomingMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant" && role !== "system") return null;
    if (typeof content !== "string") return null;
    if (content.length > MAX_PACKED_IMAGE_CHARS) return null;
    const trimmed = content.trim();
    if (role !== "system" && trimmed.length === 0) return null;
    if (role === "system" && trimmed.length === 0) return null;
    if (trimmed.length > MAX_MESSAGE_CHARS && !trimmed.startsWith("{")) return null;
    out.push({ role, content: trimmed });
  }
  if (out.length === 0) return null;
  if (out.length > 40) return null;
  return out;
}

type UnpackedTurn = {
  role: "user" | "assistant";
  text: string;
  imageDataUrl?: string;
};

function dataUrlToInline(dataUrl: string): { mimeType: string; data: string } {
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!m) throw new Error("Invalid image data URL.");
  return { mimeType: m[1]!.trim(), data: m[2]!.trim() };
}

function toOpenAiMessages(
  systemInstruction: string,
  nonSystem: UnpackedTurn[]
): OpenAiMultimodalMessage[] {
  const out: OpenAiMultimodalMessage[] = [];
  if (systemInstruction) {
    out.push({ role: "system", content: systemInstruction });
  }
  for (const m of nonSystem) {
    if (m.role === "assistant") {
      out.push({ role: "assistant", content: m.text });
    } else if (m.imageDataUrl) {
      out.push({
        role: "user",
        content: [
          { type: "text", text: m.text || " " },
          { type: "image_url", image_url: { url: m.imageDataUrl, detail: "high" } },
        ],
      });
    } else {
      out.push({ role: "user", content: m.text });
    }
  }
  return out;
}

function toGeminiHistory(nonSystem: UnpackedTurn[]): Content[] {
  const out: Content[] = [];
  for (const m of nonSystem) {
    if (m.role === "assistant") {
      out.push({ role: "model", parts: [{ text: m.text }] });
    } else if (m.imageDataUrl) {
      const { mimeType, data } = dataUrlToInline(m.imageDataUrl);
      out.push({
        role: "user",
        parts: [{ text: m.text || " " }, { inlineData: { mimeType, data } }],
      });
    } else {
      out.push({ role: "user", parts: [{ text: m.text }] });
    }
  }
  return out;
}

export async function POST(req: Request) {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!isAnyTextLlmConfigured(geminiKey)) {
    return NextResponse.json(
      {
        error:
          "LLM is not configured. Add GEMINI_API_KEY, GROQ_API_KEY, and/or OPENAI_API_KEY to .env.local and restart the server.",
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON object." }, { status: 400 });
  }

  const messages = normalizeMessages((body as { messages?: unknown }).messages);
  if (!messages) {
    return NextResponse.json({ error: "Invalid messages array." }, { status: 400 });
  }

  const systemInstruction = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n")
    .trim();

  const nonSystemRaw = messages.filter((m) => m.role !== "system");
  const last = nonSystemRaw[nonSystemRaw.length - 1];
  if (!last || last.role !== "user") {
    return NextResponse.json({ error: "Last message must be from the user." }, { status: 400 });
  }

  const nonSystemUnpacked: UnpackedTurn[] = nonSystemRaw.map((m) => {
    const u = unpackChatMessageContent(m.content);
    return { role: m.role as "user" | "assistant", text: u.text, imageDataUrl: u.imageDataUrl };
  });

  const hasVision = nonSystemUnpacked.some((m) => Boolean(m.imageDataUrl));

  const primaryModel = resolveGeminiModelId(process.env.GEMINI_MODEL);
  const modelAttempts = geminiModelAttemptOrder(primaryModel);
  const genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;

  const groqChatMsgs = messages.map((m) => ({
    role: m.role as "system" | "user" | "assistant",
    content: m.content,
  }));

  try {
    if (hasVision) {
      if (isOpenAiChatConfigured()) {
        try {
          const openAiMsgs = toOpenAiMessages(systemInstruction, nonSystemUnpacked);
          const { text, model } = await openaiChatCompletionMultimodal({
            messages: openAiMsgs,
            maxTokens: 4096,
          });
          if (!text?.trim()) {
            return NextResponse.json({ error: "Empty model response." }, { status: 502 });
          }
          return NextResponse.json({ text: text.trim(), model, provider: "openai" });
        } catch (openErr) {
          console.warn("[gemini/chat] OpenAI vision failed, trying Gemini:", openErr);
        }
      }

      if (genAI) {
        let lastGeminiErr: unknown;
        for (let i = 0; i < modelAttempts.length; i++) {
          const modelName = modelAttempts[i]!;
          try {
            const model = genAI.getGenerativeModel({
              model: modelName,
              ...(systemInstruction ? { systemInstruction } : {}),
            });
            const history = toGeminiHistory(nonSystemUnpacked.slice(0, -1));
            const chat = model.startChat({ history });
            const lastTurn = nonSystemUnpacked[nonSystemUnpacked.length - 1]!;
            const parts =
              lastTurn.imageDataUrl && lastTurn.role === "user"
                ? (() => {
                    const { mimeType, data } = dataUrlToInline(lastTurn.imageDataUrl);
                    return [{ text: lastTurn.text || " " }, { inlineData: { mimeType, data } }];
                  })()
                : [{ text: lastTurn.text }];
            const result = await chat.sendMessage(parts);
            const text = result.response.text()?.trim();
            if (!text) throw new Error("Empty model response.");
            return NextResponse.json({ text, model: modelName, provider: "gemini" });
          } catch (e) {
            lastGeminiErr = e;
            console.warn(`[gemini/chat] Gemini vision ${modelName} failed:`, e);
          }
        }
        const msg =
          lastGeminiErr instanceof Error ? lastGeminiErr.message : String(lastGeminiErr ?? "Gemini vision failed.");
        return NextResponse.json(
          { error: `${msg} Set OPENAI_API_KEY to use OpenAI for image chat, or fix Gemini model access.` },
          { status: 502 }
        );
      }

      return NextResponse.json(
        {
          error:
            "Image messages require OPENAI_API_KEY (preferred) or a working GEMINI_API_KEY with a vision-capable model.",
        },
        { status: 503 }
      );
    }

    const history: Content[] = nonSystemRaw.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const { text, model, provider } = await generateTextGeminiThenGroq({
      logLabel: "gemini/chat",
      geminiApiKey: geminiKey,
      modelAttempts,
      runGemini: async (modelName) => {
        if (!genAI) throw new Error("Gemini not configured");
        const model = genAI.getGenerativeModel({
          model: modelName,
          ...(systemInstruction ? { systemInstruction } : {}),
        });
        const chat = model.startChat({ history });
        const result = await chat.sendMessage(last.content);
        return result.response.text();
      },
      groq: { messages: groqChatMsgs, jsonMode: false },
    });
    if (!text?.trim()) {
      return NextResponse.json({ error: "Empty model response." }, { status: 502 });
    }
    return NextResponse.json({ text: text.trim(), model, provider });
  } catch (e) {
    let msg = e instanceof Error ? e.message : "LLM request failed.";
    if (msg.includes("404") && msg.includes("not found")) {
      msg += ` Tried Gemini: ${modelAttempts.join(", ")}. Set GEMINI_MODEL to a current id in .env.local or check API access.`;
    }
    console.error("[gemini/chat]", e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
