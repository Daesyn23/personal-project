import type { SpeechInputLang } from "@/lib/browser-speech-input";

/** Detected spoken/written language for practice turns. */
export type DetectedLanguage = "japanese" | "english" | "tagalog" | "mixed" | "unknown";

const TAGALOG_MARKERS =
  /\b(ang|ng|sa|ako|ikaw|ka|po|ba|ano|paano|kung|para|naman|lang|din|rin|ito|iyan|yung|siya|natin|tayo|mga|hindi|oo|kasi|talaga|pwede|gusto|sabihin|ibig|tandaan|halimbawa)\b/gi;

function countJapaneseChars(text: string): number {
  return (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) || []).length;
}

function countLatinLetters(text: string): number {
  return (text.match(/[a-zA-Z]/g) || []).length;
}

function countTagalogMarkers(text: string): number {
  const m = text.match(TAGALOG_MARKERS);
  return m ? m.length : 0;
}

/**
 * Heuristic language detection for Japanese / English / Tagalog / mixed utterances.
 */
export function detectUtteranceLanguage(text: string): DetectedLanguage {
  const t = text.trim();
  if (!t) return "unknown";

  const jp = countJapaneseChars(t);
  const latin = countLatinLetters(t);
  const tagalog = countTagalogMarkers(t);

  if (jp >= 2 && latin === 0 && tagalog === 0) return "japanese";
  if (tagalog >= 2 && jp === 0) return "tagalog";
  if (jp >= 1 && (latin >= 3 || tagalog >= 1)) return "mixed";
  if (latin >= 3 && jp === 0 && tagalog === 0) return "english";
  if (tagalog >= 1 && jp === 0) return "tagalog";
  if (jp >= 1) return "japanese";
  if (latin >= 1) return "english";
  return "unknown";
}

export function detectedLanguageLabel(lang: DetectedLanguage): string {
  switch (lang) {
    case "japanese":
      return "Japanese";
    case "english":
      return "English";
    case "tagalog":
      return "Tagalog";
    case "mixed":
      return "Mixed";
    default:
      return "Auto";
  }
}

/** Browser speech recognition locale for the detected language. */
export function detectedLanguageToSpeechLang(lang: DetectedLanguage, text?: string): SpeechInputLang {
  switch (lang) {
    case "english":
      return "en-US";
    case "tagalog":
      return "fil-PH";
    case "japanese":
      return "ja-JP";
    case "mixed": {
      if (text?.trim()) {
        const jp = countJapaneseChars(text);
        const latin = countLatinLetters(text);
        return latin > jp ? "en-US" : "ja-JP";
      }
      return "ja-JP";
    }
    default:
      return "ja-JP";
  }
}

/**
 * Pick mic language for the next listen pass from conversation history + live interim.
 */
export function inferListenSpeechLang(options: {
  messages: { role: "user" | "assistant"; content: string }[];
  interim?: string;
}): SpeechInputLang {
  if (options.interim?.trim()) {
    const live = detectUtteranceLanguage(options.interim);
    if (live !== "unknown") return detectedLanguageToSpeechLang(live, options.interim);
  }

  const lastUser = [...options.messages].reverse().find((m) => m.role === "user");
  if (lastUser?.content.trim()) {
    return detectedLanguageToSpeechLang(
      detectUtteranceLanguage(lastUser.content),
      lastUser.content
    );
  }

  const lastAssistant = [...options.messages].reverse().find((m) => m.role === "assistant");
  if (lastAssistant?.content.trim()) {
    const d = detectUtteranceLanguage(lastAssistant.content);
    if (d === "english" || d === "tagalog" || d === "mixed") {
      return detectedLanguageToSpeechLang(d, lastAssistant.content);
    }
  }

  return "ja-JP";
}

/** Whether TTS should use Japanese voice for this line. */
export function shouldSpeakAsJapanese(text: string): boolean {
  const d = detectUtteranceLanguage(text);
  return d === "japanese" || d === "mixed";
}
