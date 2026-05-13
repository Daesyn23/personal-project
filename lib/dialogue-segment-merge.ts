/**
 * Post-process ASR segments into lesson-sized sections: pause / punctuation / duration heuristics,
 * optional same-speaker glue when diarization labels exist.
 */

import { nextStartsNumberedListeningPrompt, startsWithGluedNumberedListeningItem } from "@/lib/jlpt-listening-number-split";
import { looksLikeStandaloneBackchannel } from "@/lib/reaction-backchannel";

export type LessonTimedSegment = {
  startSec: number;
  endSec: number;
  text: string;
  speaker?: string;
};

/** Merge consecutive diarized lines from the same speaker when separated by a short gap. */
export function mergeAdjacentSameSpeakerTurns(segments: LessonTimedSegment[]): LessonTimedSegment[] {
  if (segments.length <= 1) return segments;

  const out: LessonTimedSegment[] = [];
  let acc = { ...segments[0]! };

  for (let i = 1; i < segments.length; i++) {
    const next = segments[i]!;
    const gap = next.startSec - acc.endSec;
    const spA = acc.speaker?.trim();
    const spB = next.speaker?.trim();
    const sameSpeaker = Boolean(spA && spB && spA === spB);
    const tight = gap < 0.55 && gap >= -0.08;

    if (sameSpeaker && tight) {
      acc = {
        startSec: acc.startSec,
        endSec: Math.max(acc.endSec, next.endSec),
        text: `${acc.text.trim()} ${next.text.trim()}`.trim(),
        speaker: spA,
      };
    } else {
      out.push(acc);
      acc = { ...next };
    }
  }
  out.push(acc);
  return out;
}

const MAX_SECTION_SEC = 14;
/** Within one textbook/JLPT numbered item (`1 …` / `2 …`), allow long gaps before splitting. */
const LISTENING_ITEM_BLOCK_MAX_SEC = 120;
/**
 * Max silence while still merging one numbered item (dialogue + recap). Textbook inserts ~2–4s
 * between conversation and summary; the next item still splits on {@link nextStartsNumberedListeningPrompt}.
 */
const LISTENING_ITEM_SUPER_HARD_GAP_SEC = 6;
/** Pause at or above this → almost always a new section (breath / turn). */
const HARD_GAP_SEC = 0.64;
/** Long pause after a full sentence → new section. */
const STRONG_END_SPLIT_GAP_SEC = 0.24;
/** In the “medium” pause band, split if the line already sounds complete. */
const MID_GAP_SPLIT_SEC = 0.44;

function hasStrongSentenceEnd(text: string): boolean {
  const t = text.trimEnd();
  return /[。！？…」』】］）]$/u.test(t) || /[.!?\]"')>]$/u.test(t);
}

/** Clause continues (comma, ellipsis, trailing conjunctive stem). */
function hasSoftClauseEnd(text: string): boolean {
  const t = text.trimEnd();
  if (/[、，,]$/u.test(t)) return true;
  if (/[…⋯····]$/u.test(t)) return true;
  if (/(て|で|から|けど|けれど|のに|ので|って|という|し|ば|たら|なら|だし)$/u.test(t)) return true;
  return false;
}

/** Next fragment likely belongs to the same utterance as the previous line. */
function nextLooksLikeContinuation(text: string): boolean {
  const n = text.trimStart();
  if (!n) return false;
  if (/^(て|で|から|けど|が|の|に|を|は|も|と|や|って|という|です|ます|ません)/u.test(n)) return true;
  if (n.length <= 4 && !/[。！？]/.test(n)) return true;
  return false;
}

/** Accumulator is one listening block: `1 …` / `3 …`, or Diet passage when `4` was omitted in ASR. */
function accStartsNumberedListeningItemLine(text: string): boolean {
  const t = text.trimStart();
  if (/^[1-9１-９]\s+/u.test(t) || /^[1１\uFF11]\s+/u.test(t)) return true;
  if (/^国会議事堂を見学/u.test(t)) return true;
  if (startsWithGluedNumberedListeningItem(t)) return true;
  return false;
}

function combineSpeaker(a?: string, b?: string): string | undefined {
  const x = a?.trim();
  const y = b?.trim();
  if (x && y && x === y) return x;
  if (x && !y) return x;
  if (y && !x) return y;
  return undefined;
}

/** Merge segments whose text is a single digit into the following segment (not into another lone digit). */
export function mergeOrphanSingleDigitStubs(segments: LessonTimedSegment[]): LessonTimedSegment[] {
  if (segments.length <= 1) return segments;
  let cur = segments;
  for (let guard = 0; guard < 24; guard++) {
    const out: LessonTimedSegment[] = [];
    let i = 0;
    while (i < cur.length) {
      const seg = cur[i]!;
      const t = seg.text.trim();
      const onlyDigit = /^[0-9０-９\uFF10-\uFF19]{1}$/u.test(t);
      const nxt = cur[i + 1];
      const nxtTrim = nxt?.text.trim() ?? "";
      const nextIsLoneDigit = /^[0-9０-９\uFF10-\uFF19]{1}$/u.test(nxtTrim);
      if (
        onlyDigit &&
        nxt &&
        !nextIsLoneDigit &&
        !nextStartsNumberedListeningPrompt(nxt.text)
      ) {
        out.push({
          startSec: Math.min(seg.startSec, nxt.startSec),
          endSec: Math.max(seg.endSec, nxt.endSec),
          text: `${t} ${nxtTrim}`.trim(),
          speaker: combineSpeaker(seg.speaker, nxt.speaker),
        });
        i += 2;
      } else {
        out.push(seg);
        i += 1;
      }
    }
    const unchanged =
      out.length === cur.length && out.every((s, j) => s.text === cur[j]!.text && s.startSec === cur[j]!.startSec);
    if (unchanged) return out;
    cur = out;
  }
  return cur;
}

/**
 * Merge Whisper-style micro-segments into natural lesson sections using pauses,
 * sentence endings, clause boundaries, and a maximum utterance length.
 */
export function smartSectionWhisperFragments(segments: LessonTimedSegment[]): LessonTimedSegment[] {
  if (segments.length <= 1) return segments;

  const out: LessonTimedSegment[] = [];
  let acc = { ...segments[0]! };

  for (let i = 1; i < segments.length; i++) {
    const next = segments[i]!;
    const gap = next.startSec - acc.endSec;
    const proposedEnd = Math.max(acc.endSec, next.endSec);
    const proposedDur = proposedEnd - acc.startSec;

    const strong = hasStrongSentenceEnd(acc.text);
    const soft = hasSoftClauseEnd(acc.text);
    const cont = nextLooksLikeContinuation(next.text);
    const accDur = acc.endSec - acc.startSec;

    let split = false;

    const nextIsNewPrompt = nextStartsNumberedListeningPrompt(next.text);
    const stickyListeningItem = accStartsNumberedListeningItemLine(acc.text) && !nextIsNewPrompt;

    if (nextIsNewPrompt) split = true;
    else if (stickyListeningItem) {
      /* One PART per question: dialogue + short answers + recap until `2 …` / `3 …` / `N番` etc. */
      if (proposedDur > LISTENING_ITEM_BLOCK_MAX_SEC) split = true;
      else if (gap >= LISTENING_ITEM_SUPER_HARD_GAP_SEC) split = true;
      else split = false;
    } else if (proposedDur > MAX_SECTION_SEC) split = true;
    else if (gap >= HARD_GAP_SEC) split = true;
    else if (strong && gap >= STRONG_END_SPLIT_GAP_SEC) split = true;
    else if (gap >= MID_GAP_SPLIT_SEC) {
      if (strong && gap >= 0.36) split = true;
      else if (!soft && !cont && gap >= 0.52) split = true;
    } else if (accDur >= 11 && gap >= 0.28 && !cont) {
      /* Avoid run-on monologue chunks */
      split = true;
    }

    if (
      looksLikeStandaloneBackchannel(acc.text.trim()) ||
      looksLikeStandaloneBackchannel(next.text.trim())
    ) {
      split = true;
    }

    if (!split) {
      const spacer = gap > 0.055 ? " " : "";
      acc = {
        startSec: acc.startSec,
        endSec: proposedEnd,
        text: `${acc.text.trim()}${spacer}${next.text.trim()}`.trim(),
        speaker: combineSpeaker(acc.speaker, next.speaker),
      };
    } else {
      out.push(acc);
      acc = { ...next };
    }
  }
  out.push(acc);
  return out;
}

/** @deprecated Use {@link smartSectionWhisperFragments}; kept for explicit imports. */
export function mergeWhisperFragmentsIntoConversationTurns(segments: LessonTimedSegment[]): LessonTimedSegment[] {
  return smartSectionWhisperFragments(segments);
}

export function postProcessLessonTimedSegments(segments: LessonTimedSegment[]): LessonTimedSegment[] {
  const stubMerged = mergeOrphanSingleDigitStubs(segments);
  const hasAnySpeaker = stubMerged.some((s) => Boolean(s.speaker?.trim()));
  const glued = hasAnySpeaker ? mergeAdjacentSameSpeakerTurns(stubMerged) : stubMerged;
  return smartSectionWhisperFragments(glued);
}
