/**
 * Heuristics for whether hands-free STT text looks like a finished phrase
 * vs. a mid-sentence pause (so we wait longer before sending to the tutor).
 */

export type PhraseEndKind = "empty" | "complete" | "incomplete";

/** Japanese sentence-final endings (kana / common kanji). */
const JA_COMPLETE_SUFFIX =
  /(?:です|でした|だよ|だね|ですね|ますね|ますか|ません|ませんでした|ました|ましょう|でしょう|かな|よね|じゃん|だわ|なの|のよ|かしら|ってね|ってよ|だろう|であります|でございます|か[。？?]?|[ねよなわぞぜさ]。?)$/u;

/** Hiragana particles / connectors that usually continue the clause. */
const JA_INCOMPLETE_SUFFIX =
  /(?:は|が|を|に|で|と|も|の|へ|や|て|ば|から|ので|けど|けれど|し|ながら|って|という|みたいに|ように|ほうが|より|まで|だけ|ばかり|くらい|など|、)$/u;

/** Romaji STT: polite / sentence-final. */
const ROMAJI_COMPLETE_SUFFIX =
  /\b(desu|masu|masen|masen deshita|mashita|mashou|deshita|deshou|dane|desune|masune|masuka|kana|yone|jan|dayo)\s*[.!?]?\s*$/i;

/** Romaji STT: trailing particles (still talking). */
const ROMAJI_INCOMPLETE_SUFFIX =
  /\b(wa|ga|o|wo|ni|de|to|mo|no|he|e|ya|te|ba|kara|kedo|node|noni|shi|nagara|tte|toiu|mitai ni|you ni|hou ga|made|dake|bakari|kurai|nado)\s*$/i;

/** English / Taglish: terminal punctuation. */
const LATIN_TERMINAL = /[.!?]\s*$/;

/** English: dangling function words. */
const EN_INCOMPLETE_SUFFIX =
  /\b(the|a|an|to|and|or|but|if|when|because|so|that|this|these|those|my|your|his|her|our|their|is|are|was|were|am|be|been|have|has|had|will|would|can|could|should|may|might|do|does|did|i|you|he|she|we|they|it|in|on|at|for|with|of|from|as|by|about|into|through|after|before|between|under|over|up|down|out|off|than|then|there|here|what|which|who|whom|whose|where|why|how)\s*$/i;

/** Tagalog particles often mid-phrase. */
const TL_INCOMPLETE_SUFFIX = /\b(ang|ng|sa|na|ay|mga|ko|mo|niya|nila|kay|para|kung|pero|at|o)\s*$/i;

export function classifyPhraseEnd(text: string): PhraseEndKind {
  const t = text.trim();
  if (!t) return "empty";

  if (LATIN_TERMINAL.test(t)) return "complete";
  if (JA_COMPLETE_SUFFIX.test(t)) return "complete";
  if (ROMAJI_COMPLETE_SUFFIX.test(t)) return "complete";

  if (JA_INCOMPLETE_SUFFIX.test(t)) return "incomplete";
  if (ROMAJI_INCOMPLETE_SUFFIX.test(t)) return "incomplete";
  if (EN_INCOMPLETE_SUFFIX.test(t)) return "incomplete";
  if (TL_INCOMPLETE_SUFFIX.test(t)) return "incomplete";

  /** Short backchannels / greetings without a dangling particle. */
  if (t.length <= 12 && !/[、,]$/.test(t)) {
    if (
      /^(?:はい|いいえ|うん|ううん|そう|そうです|ねえ|あの|ええと|ok|okay|yes|no|oo|opo|hindi|sige|ayos)\s*$/iu.test(
        t
      )
    ) {
      return "complete";
    }
  }

  /**
   * No clear ender — treat longer pauses as complete only if substantial
   * (user likely finished an informal sentence without です).
   */
  const charCount = t.replace(/\s+/g, "").length;
  if (charCount >= 18 && !/[、,]$/.test(t)) return "complete";

  return "incomplete";
}

export function isPhraseLikelyComplete(text: string): boolean {
  return classifyPhraseEnd(text) === "complete";
}
