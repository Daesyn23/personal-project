import { NextResponse } from "next/server";
import { isGroqConfigured } from "@/lib/groq-openai";

export const runtime = "nodejs";

export async function GET() {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const hasGroq = isGroqConfigured();
  const configured = hasGemini || hasGroq;
  return NextResponse.json({
    configured,
    /** Whether GEMINI_API_KEY is set (name must match exactly). */
    hasGemini,
    /** Whether GROQ_API_KEY is set (name must match exactly). */
    hasGroq,
  });
}
