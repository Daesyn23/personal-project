import type { QuestCard } from "./kanji-quest";

function shuffled<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}

export type RushQuestion = { card: QuestCard; choices: string[] };

/** Never offer another valid reading as a distractor, even when cards share readings. */
export function buildRushQuestions(cards: QuestCard[], random = Math.random): RushQuestion[] {
  const readings = [...new Set(cards.flatMap(card => card.answers))];
  return shuffled(cards, random).map(card => {
    const correct = card.answers[Math.floor(random() * card.answers.length)];
    const distractors = shuffled(readings.filter(reading => !card.answers.includes(reading)), random).slice(0, 3);
    return { card, choices: shuffled([correct, ...distractors], random) };
  });
}
