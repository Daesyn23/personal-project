export type TranscribedWord = {
  word: string;
  startSec: number;
  endSec: number;
};

export type TimedTextSlice = {
  startSec: number;
  endSec: number;
  text: string;
};

function normalizeForCompare(s: string): string {
  return s.replace(/\s+/gu, "").normalize("NFKC").toLowerCase();
}

function buildCharSpans(words: TranscribedWord[]): { c0: number; c1: number; t0: number; t1: number }[] {
  let pos = 0;
  return words.map((w) => {
    const L = w.word.length;
    const row = { c0: pos, c1: pos + L, t0: w.startSec, t1: w.endSec };
    pos += L;
    return row;
  });
}

function endTimeExclusiveEndChar(spans: { c0: number; c1: number; t0: number; t1: number }[], exclusiveEndChar: number): number {
  if (exclusiveEndChar <= 0) return spans[0]?.t0 ?? 0;
  const lastChar = exclusiveEndChar - 1;
  for (const s of spans) {
    if (lastChar >= s.c0 && lastChar < s.c1) return s.t1;
  }
  return spans.at(-1)!.t1;
}

function timeAtJoinedChar(spans: { c0: number; c1: number; t0: number; t1: number }[], charIdx: number): number {
  const maxC = spans.at(-1)?.c1 ?? 0;
  const x = Math.max(0, Math.min(charIdx, maxC));
  for (const s of spans) {
    if (x <= s.c1) {
      if (x <= s.c0) return s.t0;
      const denom = Math.max(1e-6, s.c1 - s.c0);
      const r = (x - s.c0) / denom;
      return s.t0 + r * (s.t1 - s.t0);
    }
  }
  return spans.at(-1)!.t1;
}

/**
 * Character offsets in the joined Whisper `words` string where a new listening “part” should start.
 * JLPT / textbook: `第n課問題m番` + `1…`, glued `…か2ひ…`, `2 …` / `3 …`, party→国会, etc.
 */
export function jlptListeningCutCharIndices(joined: string): number[] {
  const cuts = new Set<number>([0, joined.length]);

  /* Textbook section line: "2番 " at line / string start */
  for (const m of joined.matchAll(/(^|[\n\r])([ \t\u3000]*)([0-9０-９\uFF10-\uFF19]+)\s*番\s*/gu)) {
    cuts.add(m.index + m[0].length);
  }

  /* Glued item after digit+番: "2番1ミラー…" / "2 番1…" */
  for (const m of joined.matchAll(/([0-9０-９\uFF10-\uFF19]\s*番)([1-9])(?=[ぁ-んァ-ヺ一-龯])/gu)) {
    cuts.add(m.index + m[1].length);
  }

  /* Line-leading question numbers: "\n1 ミラー" (space after digit); not "1月" (no space before 月) */
  for (const m of joined.matchAll(/(^|[\n\r])([ \t\u3000]*)([1-9])\s+(?=[ぁ-んァ-ヺ一-龯])/gu)) {
    cuts.add(m.index + m[1].length + m[2].length);
  }

  for (const m of joined.matchAll(/(問題[0-9０-９\uFF10-\uFF19]+番)(\s*)([1１\uFF11])(?=[ぁ-んァ-ヺ一-龯])/gu)) {
    cuts.add(m.index + m[1].length + m[2].length);
  }

  /* JLPT glued Q2–Q9: "…ますか2ひらがな" — only after か/？/。/ASCII ?! so "が4つ" is not split */
  for (const m of joined.matchAll(/(?<=[か？。．?!])([2-9２-９])(?=[ぁ-んァ-ヺ一-龯])/gu)) {
    cuts.add(m.index);
  }

  for (const m of joined.matchAll(/(^|[\s\u3000])([2-9])(?![番])(?=\s+[a-zA-Z])/gu)) {
    cuts.add(m.index + m[1].length);
  }

  for (const m of joined.matchAll(/(?<=[ぁ-んァ-ヺ一-龯a-zA-Z.!?])([2-9])(?=\s+[a-zA-Zァ-ヺ一-龯ぁ-ん])/gu)) {
    cuts.add(m.index);
  }

  for (const m of joined.matchAll(/(^|[\s\u3000])([２-９])(?=\s+[a-zA-Zァ-ヺ一-龯ぁ-ん])/gu)) {
    cuts.add(m.index + m[1].length);
  }

  /* After sentence / line end — not "メキシコ2", not clock/calendar "4時", "3月" */
  for (const m of joined.matchAll(
    /(?<=[。．！？\n\r\u3000])(\s*)([2-9])(?![番月日時分秒年])(?=[一-龯ぁ-んァ-ヺ])/gu,
  )) {
    cuts.add(m.index + m[1].length);
  }

  /* Party scene ends → Diet passage (often no spoken “4 ” in the transcript) */
  for (const m of joined.matchAll(/パーティーがあります[。．]?\s*(?=国会議事堂を見学)/gu)) {
    cuts.add(m.index + m[0].length);
  }

  const sorted = [...cuts].sort((a, b) => a - b);
  const dedup: number[] = [];
  for (const c of sorted) {
    if (dedup.length === 0 || c > dedup[dedup.length - 1]!) dedup.push(c);
  }
  return dedup.filter((c) => {
    if (c <= 0 || c >= joined.length) return true;
    const ch = joined[c]!;
    const nxt = joined[c + 1];
    if (/^[0-9０-９\uFF10-\uFF19]$/u.test(ch) && nxt === "番") return false;
    return true;
  });
}

/**
 * Re-segment using word timestamps: header `…問題n番`, then each numbered question `1…` `2…` `3…`.
 * Returns `null` if the word stream does not align with the API transcript (caller keeps coarse segments).
 */
export function splitLessonSegmentsByJlptWordCuts(options: {
  fullText: string;
  words: TranscribedWord[];
  fallbackSegments: TimedTextSlice[];
}): TimedTextSlice[] | null {
  const { fullText, words, fallbackSegments } = options;
  if (words.length < 2) return null;

  const joined = words.map((w) => w.word).join("");
  const altFull = fallbackSegments.map((s) => s.text).join("");
  const jn = normalizeForCompare(joined);
  if (jn !== normalizeForCompare(fullText) && jn !== normalizeForCompare(altFull)) {
    return null;
  }

  const cuts = jlptListeningCutCharIndices(joined);
  if (cuts.length <= 2) return null;

  const spans = buildCharSpans(words);
  const out: TimedTextSlice[] = [];

  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i]!;
    const b = cuts[i + 1]!;
    if (b <= a) continue;
    const slice = joined.slice(a, b).trim();
    if (slice.length < 1) continue;
    const startSec = Math.max(0, timeAtJoinedChar(spans, a));
    const endSec = Math.max(startSec + 0.02, endTimeExclusiveEndChar(spans, b));
    out.push({ startSec, endSec, text: slice });
  }

  return out.length > 0 ? out : null;
}

/** If the next ASR fragment begins a new numbered listening prompt, do not merge into the previous part. */
export function nextStartsNumberedListeningPrompt(text: string): boolean {
  const n = text.trimStart();
  if (/^[1１\uFF11](?=\s*[ぁ-んァ-ヺ一-龯])/u.test(n)) return true;
  if (/^[0-9０-９\uFF10-\uFF19]+\s*番/u.test(n)) return true;
  /* Textbook "2 今晩…" / "5 昨日…" — digit + spaces + kana (glued "2今…" covered below) */
  if (/^[2-9２-９]\s+(?=[ぁ-んァ-ヺ一-龯])/u.test(n)) return true;
  /* Next passage when “4 ” was not transcribed */
  if (/^国会議事堂を見学/u.test(n)) return true;
  if (/^[2-9]\s+[a-zA-Z]/u.test(n)) return true;
  if (/^[2-9](?![番月日時分秒年])(?=[ァ-ヺ一-龯ぁ-んa-zA-Z])/u.test(n)) return true;
  if (/^[２-９]\s/u.test(n)) return true;
  return false;
}
