/** Normalize typed Japanese/English answers for lenient classroom comparison. */
export function normalizeAnswer(raw: string): string {
  let s = raw.trim().toLowerCase();
  // Full-width ASCII → half-width
  s = s.replace(/[\uff01-\uff5e]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
  s = s.replace(/\u3000/g, " ");
  // Katakana → hiragana
  s = s.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
  // Collapse whitespace
  s = s.replace(/\s+/g, " ");
  return s;
}

export function answersMatch(typed: string, expected: string): boolean {
  const a = normalizeAnswer(typed);
  const b = normalizeAnswer(expected);
  if (!a || !b) return false;
  if (a === b) return true;
  // Allow either side when expected has slash alternatives: "a / b"
  const alts = b.split(/\s*[/|]\s*/).filter(Boolean);
  if (alts.length > 1 && alts.some((x) => x === a)) return true;
  return false;
}
