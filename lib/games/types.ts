export type GameId =
  | "match"
  | "multipleChoice"
  | "typeAnswer"
  | "trueFalse"
  | "wordScramble";

export type PlayableCard = {
  id: string;
  /** Display Japanese (kanji preferred, else kana / native_script) */
  jp: string;
  /** Reading for typing answers (kana preferred) */
  reading: string;
  /** English meaning */
  en: string;
};

export type GameSessionResult = {
  gameId: GameId;
  correct: number;
  wrong: number;
  total: number;
  /** Extra label e.g. moves, seconds left */
  detail?: string;
};

export const GAME_META: Record<
  GameId,
  { title: string; blurb: string; hint: string; minCards: number }
> = {
  match: {
    title: "Match",
    blurb: "Tap Japanese and English pairs until the board is clear.",
    hint: "Pairs",
    minCards: 2,
  },
  multipleChoice: {
    title: "Multiple choice",
    blurb: "Pick the right meaning — switch JP→EN or EN→JP anytime.",
    hint: "Quiz",
    minCards: 2,
  },
  typeAnswer: {
    title: "Type the answer",
    blurb: "See the English meaning and type the Japanese reading.",
    hint: "Write",
    minCards: 1,
  },
  trueFalse: {
    title: "True or false",
    blurb: "See a Japanese–English pair and decide if they match.",
    hint: "Decide",
    minCards: 2,
  },
  wordScramble: {
    title: "Word scramble",
    blurb: "Unscramble the Japanese letters to match the English clue.",
    hint: "Letters",
    minCards: 1,
  },
};

export const ALL_GAME_IDS: GameId[] = [
  "match",
  "multipleChoice",
  "typeAnswer",
  "trueFalse",
  "wordScramble",
];
