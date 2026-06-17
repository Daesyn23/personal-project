/** Sentence boundaries for starting voice playback while the model is still streaming. */
const TERMINATOR = /[。！？!?…\n]+/;

/** Merge later sentences so fewer TTS round-trips (shorter gaps at punctuation). */
const MERGED_CHUNK_MAX = 480;

type SentenceSpan = { text: string; end: number };

function collectCompleteSentences(full: string, from: number): SentenceSpan[] {
  const sentences: SentenceSpan[] = [];
  let cursor = from;

  while (cursor < full.length) {
    const slice = full.slice(cursor);
    const match = TERMINATOR.exec(slice);
    if (!match || match.index === undefined) break;

    const end = cursor + match.index + match[0].length;
    const piece = full.slice(cursor, end).trim();
    if (piece.length > 0) sentences.push({ text: piece, end });
    cursor = end;
  }

  return sentences;
}

function mergeSentenceSpans(spans: SentenceSpan[]): string[] {
  if (spans.length === 0) return [];

  const chunks: string[] = [];
  let merged = spans[0]!.text;
  for (let i = 1; i < spans.length; i++) {
    const next = spans[i]!.text;
    const candidate = `${merged} ${next}`;
    if (candidate.length > MERGED_CHUNK_MAX) {
      chunks.push(merged);
      merged = next;
    } else {
      merged = candidate;
    }
  }
  chunks.push(merged);
  return chunks;
}

/**
 * Pull newly completed speakable segments from a growing assistant reply.
 * First chunk is one sentence (fast start); later chunks merge sentences to reduce TTS gaps.
 */
export function pullSpeakableChunks(
  full: string,
  spokenUpTo: number
): { chunks: string[]; newSpokenUpTo: number } {
  const sentences = collectCompleteSentences(full, spokenUpTo);
  if (sentences.length === 0) {
    return { chunks: [], newSpokenUpTo: spokenUpTo };
  }

  if (spokenUpTo === 0) {
    return {
      chunks: [sentences[0]!.text],
      newSpokenUpTo: sentences[0]!.end,
    };
  }

  const chunks = mergeSentenceSpans(sentences);
  return {
    chunks,
    newSpokenUpTo: sentences[sentences.length - 1]!.end,
  };
}

export function remainingSpeakableTail(full: string, spokenUpTo: number): string {
  return full.slice(spokenUpTo).trim();
}
