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

/** OpenAI TTS speed — slightly brisk for natural back-and-forth (0.25–4.0). */
export const DEFAULT_OPENAI_TTS_SPEED = 1.1;

/** Prosody instructions for OpenAI gpt-4o-mini-tts (Berry practice). */
export function buildPracticeTtsInstructions(register: PracticeTtsRegister = "polite"): string {
  const registerNote =
    register === "polite"
      ? "Japanese lines use warm polite です／ます — friendly, not stiff broadcast Japanese."
      : "Japanese lines use casual plain speech — relaxed friend tone, not slangy host.";
  return [
    "You are Berry（ベリー）, a warm woman with a slightly deeper relaxed alto voice — friendly and natural, never squeaky, breathy-high, or childlike.",
    "Sound fully human and alive — NEVER flat, monotone, or text-to-speech robotic.",
    "The entire input is ONE continuous utterance — read it straight through like natural speech, not separate clips or a list.",
    "Do NOT pause at periods, 。, !, or ? — glide through them. Only a barely perceptible micro-pause at commas or 、.",
    "Never insert dramatic silence, breath holds, or end-of-sentence stops between phrases.",
    registerNote,
    "Taglish: like a real Manila friend — warm, light, mixed Tagalog-English, not announcer English.",
    "Conversational everyday pace; smile in your voice; finish the whole line smoothly.",
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

export function resolveOpenAiTtsSpeed(): number {
  const raw = process.env.OPENAI_TTS_SPEED?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0.25 && n <= 4) return n;
  }
  return DEFAULT_OPENAI_TTS_SPEED;
}

function supportsTtsInstructions(model: string): boolean {
  return model.includes("gpt-4o-mini");
}

export const MAX_TUTOR_TTS_CHARS = 4096;

/** Strip markdown and normalize punctuation so TTS flows without long breaks. */
export function textForTutorSpeech(raw: string): string {
  return raw
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/…+/g, "、")
    .replace(/\.{3,}/g, ",")
    .replace(/\s*[,，]\s*/g, "、")
    .replace(/\s*([。！？!?])\s*/g, "$1")
    .replace(/([。！？!?])\s+/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split long replies at sentence boundaries so TTS never cuts off mid-sentence. */
export function segmentTextForTutorTts(
  text: string,
  maxLen = MAX_TUTOR_TTS_CHARS
): string[] {
  const cleaned = textForTutorSpeech(text);
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];

  const segments: string[] = [];
  let rest = cleaned;

  while (rest.length > 0) {
    if (rest.length <= maxLen) {
      segments.push(rest);
      break;
    }

    const window = rest.slice(0, maxLen);
    const boundary = /[。！？!?.\n]\s*/g;
    let splitAt = -1;
    let match: RegExpExecArray | null;
    while ((match = boundary.exec(window)) !== null) {
      splitAt = match.index + match[0].length;
    }
    if (splitAt < Math.floor(maxLen * 0.35)) {
      const spaceAt = window.lastIndexOf(" ", maxLen);
      splitAt = spaceAt >= Math.floor(maxLen * 0.35) ? spaceAt + 1 : maxLen;
    }

    const piece = rest.slice(0, splitAt).trim();
    if (!piece) break;
    segments.push(piece);
    rest = rest.slice(splitAt).trim();
  }

  return segments;
}

export async function openaiTextToSpeechMp3(
  text: string,
  options?: { register?: PracticeTtsRegister }
): Promise<{ bytes: Uint8Array; voice: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const input = textForTutorSpeech(text);
  if (!input) throw new Error("Nothing to speak.");
  if (input.length > MAX_TUTOR_TTS_CHARS) {
    throw new Error(`Text exceeds ${MAX_TUTOR_TTS_CHARS} characters for one TTS request.`);
  }

  const register = options?.register === "casual" ? "casual" : "polite";
  const voice = resolveOpenAiTtsVoice();
  const model = resolveOpenAiTtsModel();
  const instructions = resolveOpenAiTtsInstructions(register);
  const speed = resolveOpenAiTtsSpeed();

  const payload: Record<string, unknown> = {
    model,
    voice,
    input,
    response_format: "mp3",
    speed,
  };
  if (instructions && supportsTtsInstructions(model)) {
    payload.instructions = instructions;
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
