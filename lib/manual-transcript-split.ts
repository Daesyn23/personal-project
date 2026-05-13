/** Strip whitespace so users can add readable spaces in the editor while matching JP tokens. */
export function normalizeTranscriptJoin(s: string): string {
  return s.replace(/\s+/g, "");
}

export type TimedWordLike = { word: string; startSec: number; endSec: number };

export function joinTimedWordsText(words: TimedWordLike[]): string {
  return words.map((w) => w.word).join("");
}

export type ManualSplitSegment = { startSec: number; endSec: number; text: string };

export type ManualSplitResult =
  | { ok: true; segments: ManualSplitSegment[] }
  | { ok: false; error: string };

/**
 * Each non-empty line in `draftWithNewlines` becomes one phrase. Timings are taken from the
 * contiguous timed words whose joined text (ignoring whitespace) matches that line.
 * The joined normalized lines must exactly match the joined normalized timed words.
 */
export function splitTimedWordsByTranscriptLines(
  words: TimedWordLike[],
  draftWithNewlines: string,
  durationSec: number
): ManualSplitResult {
  if (!words.length) {
    return {
      ok: false,
      error: "No word-level timings. Transcribe in Listen first mode with a backend that returns timed words.",
    };
  }
  const lines = draftWithNewlines
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) {
    return {
      ok: false,
      error: "Use at least two lines (one line break) so the lesson splits into two or more phrases.",
    };
  }
  const wordsNorm = normalizeTranscriptJoin(joinTimedWordsText(words));
  const linesNorm = normalizeTranscriptJoin(lines.join(""));
  if (wordsNorm !== linesNorm) {
    return {
      ok: false,
      error: `Text mismatch after ignoring spaces: timed words are ${wordsNorm.length} characters, your lines are ${linesNorm.length}. Use “Reset from timed words” and only add line breaks, or edit lines so the full text matches.`,
    };
  }

  const segments: ManualSplitSegment[] = [];
  let wi = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    const targetNorm = normalizeTranscriptJoin(line);
    if (targetNorm.length === 0) continue;
    const startWi = wi;
    let acc = "";
    while (wi < words.length && normalizeTranscriptJoin(acc).length < targetNorm.length) {
      acc += words[wi]!.word;
      wi++;
    }
    const accNorm = normalizeTranscriptJoin(acc);
    if (accNorm !== targetNorm) {
      return {
        ok: false,
        error: `Phrase ${li + 1} does not align with the next timed words (expected ${targetNorm.length} non-space characters).`,
      };
    }
    const w0 = words[startWi]!;
    const w1 = words[wi - 1]!;
    const startSec = Math.max(0, Math.min(w0.startSec, durationSec));
    const endSec = Math.max(startSec, Math.min(w1.endSec, durationSec));
    segments.push({
      startSec,
      endSec,
      text: line.replace(/\s+/g, " ").trim(),
    });
  }

  if (wi < words.length) {
    return {
      ok: false,
      error: `Timed words continue after your last line (${words.length - wi} word(s) left). Add another line or merge text upward.`,
    };
  }

  if (segments.length < 2) {
    return { ok: false, error: "Need at least two timed phrases." };
  }

  return { ok: true, segments };
}
