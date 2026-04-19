/** Hiragana + katakana (no kanji). Includes halfwidth ｱｲｳ… for pre-normalized strings. */
export function isKanaOnly(s: string): boolean {
  if (!s.trim()) return false;
  return /^[\u3040-\u309F\u30A0-\u30FF\uFF66-\uFF9Fー〜・]+$/u.test(s) && !/[\u4E00-\u9FFF]/.test(s);
}

export function hasKanji(s: string): boolean {
  return /[\u4E00-\u9FFF]/.test(s);
}

/** Single-token romaji (lesson vocabulary), not a full English gloss */
export function looksLikeRomajiWord(s: string): boolean {
  const t = s.trim();
  if (!t || t.includes(" ") || t.length > 18) return false;
  return /^[a-zA-ZāēīōūĀĒĪŌŪ.\-]+$/u.test(t);
}

export function looksLikeEnglishGloss(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/^[\u3040-\u9FFF]/.test(t)) return false;
  return (
    /\s/.test(t) ||
    /^(to|a|an|the|be|is|are|in|on|at)\s/i.test(t) ||
    t.length > 14 ||
    /^[A-Z]/.test(t)
  );
}
