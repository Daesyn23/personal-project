import { GoogleGenerativeAI, type Content } from "@google/generative-ai";
import { NextResponse } from "next/server";
import {
  geminiModelAttemptOrder,
  resolveGeminiModelId,
  shouldAttemptNextGeminiModel,
} from "@/lib/gemini-model";

export const runtime = "nodejs";

type ChatRole = "user" | "assistant" | "system";

type IncomingMessage = {
  role: ChatRole;
  content: string;
};

function normalizeMessages(raw: unknown): IncomingMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const out: IncomingMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant" && role !== "system") return null;
    if (typeof content !== "string") return null;
    const trimmed = content.trim();
    if (role !== "system" && trimmed.length === 0) return null;
    if (trimmed.length > 32_000) return null;
    out.push({ role, content: trimmed });
  }
  if (out.length === 0) return null;
  if (out.length > 40) return null;
  return out;
}

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { error: "Gemini is not configured. Add GEMINI_API_KEY to .env.local and restart the server." },
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

  const nonSystem = messages.filter((m) => m.role !== "system");
  const last = nonSystem[nonSystem.length - 1];
  if (!last || last.role !== "user") {
    return NextResponse.json({ error: "Last message must be from the user." }, { status: 400 });
  }

  const history: Content[] = nonSystem.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const primaryModel = resolveGeminiModelId(process.env.GEMINI_MODEL);
  const modelAttempts = geminiModelAttemptOrder(primaryModel);
  const genAI = new GoogleGenerativeAI(key);

  for (let i = 0; i < modelAttempts.length; i++) {
    const modelName = modelAttempts[i]!;
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        ...(systemInstruction ? { systemInstruction } : {}),
      });
      const chat = model.startChat({ history });
      const result = await chat.sendMessage(last.content);
      const text = result.response.text();
      if (!text?.trim()) {
        const emptyErr = new Error("Empty model response.");
        if (i < modelAttempts.length - 1 && shouldAttemptNextGeminiModel(emptyErr)) {
          continue;
        }
        return NextResponse.json({ error: "Empty model response." }, { status: 502 });
      }
      return NextResponse.json({ text, model: modelName });
    } catch (e) {
      const canTryNext = i < modelAttempts.length - 1 && shouldAttemptNextGeminiModel(e);
      if (canTryNext) {
        console.warn(`[gemini/chat] model ${modelName} failed, trying fallback:`, e);
        continue;
      }
      let msg = e instanceof Error ? e.message : "Gemini request failed.";
      if (msg.includes("404") && msg.includes("not found")) {
        msg += ` Tried: ${modelAttempts.join(", ")}. Set GEMINI_MODEL to a current id in .env.local or check API access.`;
      }
      console.error("[gemini/chat]", e);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "No Gemini model candidates." }, { status: 500 });
}
