/**
 * Detects standalone reaction / backchannel lines (Japanese dialogue ASR) so we can
 * keep their own segment boundaries and optionally refine timings from word-level ASR.
 */

export type WordSpan = { word: string; startSec: number; endSec: number };

/** Whole-line interjections — not clause-internal fillers like 「ええと、それは…」. */
export function looksLikeStandaloneBackchannel(text: string): boolean {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t || t.length > 22) return false;

  if (/^(ええと|あのう|そのうち|なんか|まあね|というか)/u.test(t) && t.length > 5) return false;

  if (
    /^(うん|ううん|うーん|ふん|ふーん|ふ〜ん|はい|は〜い|ええ|えー+|えっ|んー?|そうそう|そう|そっか|なるほど|へえ|へぇ|まあ|おお|おぉ|わあ|うわ|げっ|はっ|ふっ|くっ|はあ|うわあ|え|あ|ん|おっ|よし|やれやれ|へっ|ほう|ふむ)[、。!！?？…⋯]*$/u.test(
      t
    )
  ) {
    return true;
  }

  if (/^(yeah|yep|nah|hmm|uh|um|oh|wow|ah|ha|ok|okay|right|no+|yes+)\.?[!?,…]*$/i.test(t)) {
    return true;
  }

  return false;
}

/**
 * Tightens or slightly expands short reaction segments using word timestamps when
 * Whisper’s segment boxes clip vowel tails or onsets.
 */
export function refineBackchannelBoundsWithWords<T extends { startSec: number; endSec: number; text: string }>(
  segments: T[],
  words: WordSpan[]
): T[] {
  if (!words.length || !segments.length) return segments;

  return segments.map((seg, i) => {
    if (!looksLikeStandaloneBackchannel(seg.text)) return seg;
    const dur = seg.endSec - seg.startSec;
    if (dur > 0.9) return seg;

    const prevEnd = i > 0 ? segments[i - 1]!.endSec : 0;
    const nextStart = i + 1 < segments.length ? segments[i + 1]!.startSec : Number.POSITIVE_INFINITY;

    const overlap = words.filter(
      (w) =>
        Number.isFinite(w.startSec) &&
        Number.isFinite(w.endSec) &&
        w.endSec > seg.startSec - 0.08 &&
        w.startSec < seg.endSec + 0.18
    );
    if (overlap.length === 0) return seg;

    let start = Math.min(seg.startSec, ...overlap.map((w) => w.startSec));
    let end = Math.max(seg.endSec, ...overlap.map((w) => w.endSec));
    const eps = 1e-4;
    start = Math.max(prevEnd + eps, start);
    end = Math.min(nextStart - eps, end);
    if (!Number.isFinite(end) || end - start < 0.02) return seg;
    return { ...seg, startSec: start, endSec: end };
  });
}
