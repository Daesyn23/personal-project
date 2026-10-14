import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { resolveGeminiModelId } from "@/lib/gemini-model";
import { openaiChatCompletionMultimodal } from "@/lib/openai-chat";
import { HANDWRITING_SYSTEM, handwritingFailure, handwritingPng, recognizeHandwriting } from "@/lib/handwriting-recognition";

export const runtime = "nodejs";
export const maxDuration = 60;

function reply(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let base64: string;
  try {
    // Bound even chunked bodies before parsing JSON or forwarding an image.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Write your answer before pressing Done." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_450_000) { await reader.cancel(); return reply({ error: "The writing pad is too large. Clear it and try again." }, 413); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    base64 = handwritingPng(body?.image);
  } catch {
    return reply({ error: "The writing pad could not be read. Please try again." }, 400);
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!openaiKey && !geminiKey) return reply({
    error: "Handwriting recognition isn’t connected yet. You can switch to Type to keep playing.",
  }, 503);

  const providers: (() => Promise<string>)[] = [];
  if (openaiKey) providers.push(async () => {
    const model = process.env.OPENAI_HANDWRITING_MODEL?.trim() || "gpt-5.4";
    const reasoning = /^gpt-[5-9](?:[.-]|$)/.test(model);
    const response = await openaiChatCompletionMultimodal({
      model, reasoningEffort: reasoning ? "low" : undefined,
      jsonMode: true, temperature: 0, maxTokens: reasoning ? 1024 : 256,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(22_000)]),
      messages: [
        { role: "system", content: HANDWRITING_SYSTEM },
        { role: "user", content: [{ type: "image_url", image_url: { url: `data:image/png;base64,${base64}`, detail: "high" } }] },
      ],
    });
    return response.text;
  });
  if (geminiKey) providers.push(async () => {
    request.signal.throwIfAborted();
    const model = new GoogleGenerativeAI(geminiKey).getGenerativeModel({
      model: resolveGeminiModelId(process.env.GEMINI_MODEL),
      systemInstruction: HANDWRITING_SYSTEM,
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    });
    const response = await model.generateContent([{ inlineData: { mimeType: "image/png", data: base64 } }], {
      signal: request.signal, timeout: 22_000,
    });
    return response.response.text();
  });

  try {
    const reading = await recognizeHandwriting(providers);
    if (!reading) return reply({ error: "I couldn’t read that clearly. Try larger hiragana with a little space between each character. Your score hasn’t changed." }, 422);
    return reply({ reading });
  } catch (error) {
    return reply({ error: handwritingFailure(error) }, 503);
  }
}
