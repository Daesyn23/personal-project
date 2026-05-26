/** Sentence / clause boundaries for starting voice playback while the model is still streaming. */
const TERMINATOR = /[。！？!?…\n]+/;

/**
 * Pull newly completed speakable segments from a growing assistant reply.
 * Only returns text after `spokenUpTo` that ends on a strong boundary.
 */
export function pullSpeakableChunks(
  full: string,
  spokenUpTo: number
): { chunks: string[]; newSpokenUpTo: number } {
  const chunks: string[] = [];
  let cursor = spokenUpTo;

  while (cursor < full.length) {
    const slice = full.slice(cursor);
    const match = TERMINATOR.exec(slice);
    if (!match || match.index === undefined) break;

    const end = cursor + match.index + match[0].length;
    const piece = full.slice(cursor, end).trim();
    if (piece.length > 0) chunks.push(piece);
    cursor = end;
  }

  return { chunks, newSpokenUpTo: cursor };
}

export function remainingSpeakableTail(full: string, spokenUpTo: number): string {
  return full.slice(spokenUpTo).trim();
}
