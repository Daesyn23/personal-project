/**
 * OpenAI Text-to-Speech — one consistent tutor voice across languages.
 * https://platform.openai.com/docs/api-reference/audio/createSpeech
 */

const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";

/** Warm, expressive default for Berry (override with OPENAI_TTS_VOICE). */
export const DEFAULT_OPENAI_TTS_VOICE = "coral";
/** gpt-4o-mini-tts supports naturalness via `instructions`; tts-1 is faster but flatter. */
export const DEFAULT_OPENAI_TTS_MODEL = "gpt-4o-mini-tts";

export type PracticeTtsRegister = "polite" | "casual";

/** Prosody instructions for OpenAI gpt-4o-mini-tts (Berry practice). */
export function buildPracticeTtsInstructions(register: PracticeTtsRegister = "polite"): string {
  const registerNote =
    register === "polite"
      ? "Japanese lines use warm polite です／ます — friendly, not stiff broadcast Japanese."
      : "Japanese lines use casual plain speech — relaxed friend tone, not slangy host.";
  return [
    "You are Berry（ベリー）, a warm young woman voice-chatting with a friend in the Philippines.",
    "Sound fully human and alive — NEVER flat, monotone, or text-to-speech robotic.",
    "Vary pitch and energy: lift slightly on questions, soften on empathy, gentle brightness on greetings and いいね moments.",
    "Use natural conversational rhythm with brief pauses at commas and 、; phrase boundaries should breathe.",
    registerNote,
    "Taglish: like a real Manila friend — warm, light, mixed Tagalog-English, not announcer English.",
    "Keep an easy everyday pace; smile in your voice; never rush or drone.",
  ].join(" ");
}

export function isOpenAiTtsConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function resolveOpenAiTtsVoice(): string {
  const raw = process.env.OPENAI_TTS_VOICE?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_OPENAI_TTS_VOICE;
}

export function resolveOpenAiTtsModel(): string {
  const raw = process.env.OPENAI_TTS_MODEL?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_OPENAI_TTS_MODEL;
}

export function resolveOpenAiTtsInstructions(register: PracticeTtsRegister = "polite"): string | undefined {
  const raw = process.env.OPENAI_TTS_INSTRUCTIONS?.trim();
  if (raw && raw.length > 0) return raw;
  const model = resolveOpenAiTtsModel();
  if (model.includes("gpt-4o-mini-tts") || model.includes("gpt-4o-mini")) {
    return buildPracticeTtsInstructions(register);
  }
  return undefined;
}

function supportsTtsInstructions(model: string): boolean {
  return model.includes("gpt-4o-mini");
}

/** Strip characters that sound odd in TTS. */
export function textForTutorSpeech(raw: string): string {
  return raw
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function openaiTextToSpeechMp3(
  text: string,
  options?: { register?: PracticeTtsRegister }
): Promise<{ bytes: Uint8Array; voice: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const input = textForTutorSpeech(text);
  if (!input) throw new Error("Nothing to speak.");

  const register = options?.register === "casual" ? "casual" : "polite";
  const voice = resolveOpenAiTtsVoice();
  const model = resolveOpenAiTtsModel();
  const instructions = resolveOpenAiTtsInstructions(register);

  const payload: Record<string, unknown> = {
    model,
    voice,
    input: input.slice(0, 4096),
    response_format: "mp3",
  };
  if (instructions && supportsTtsInstructions(model)) {
    payload.instructions = instructions;
  } else {
    payload.speed = 1;
  }

  const res = await fetch(OPENAI_SPEECH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI TTS error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const buf = await res.arrayBuffer();
  return { bytes: new Uint8Array(buf), voice };
}
