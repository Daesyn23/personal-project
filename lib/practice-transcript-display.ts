import { hasKanji } from "@/lib/japanese-tokens";

export type PracticeTranscriptScript = "normal" | "kana";

export function normalizePracticeTranscriptScript(raw: unknown): PracticeTranscriptScript {
  return raw === "kana" ? "kana" : "normal";
}

/** True when batch-reading can improve display (kanji present). */
export function lineNeedsKanaReading(text: string): boolean {
  return hasKanji(text.trim());
}

/**
 * Hiragana readings for lines with kanji; katakana and existing hiragana unchanged (batch-reading API).
 */
export async function fetchKanaReadings(lines: string[]): Promise<string[]> {
  if (lines.length === 0) return [];

  const res = await fetch("/api/japanese/batch-reading", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines }),
  });
  const data = (await res.json()) as { readings?: string[]; error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Could not load hiragana readings.");
  }
  const readings = data.readings;
  if (!Array.isArray(readings) || readings.length !== lines.length) {
    throw new Error("Invalid hiragana response from server.");
  }
  return readings.map((r) => (typeof r === "string" ? r : "").trim());
}

export function displayTranscriptLine(
  original: string,
  script: PracticeTranscriptScript,
  kanaReading: string | undefined
): string {
  if (script === "normal") return original;
  if (!lineNeedsKanaReading(original)) return original;
  const reading = kanaReading?.trim();
  return reading || original;
}
