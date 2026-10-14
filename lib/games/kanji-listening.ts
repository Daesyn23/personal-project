import type { QuestCard } from './kanji-quest';
export type ListeningQuestion = { card: QuestCard; reading: string; choices: QuestCard[] };
export function buildListeningQuestions(cards: QuestCard[], random = Math.random): ListeningQuestion[] {
 const shuffle = <T,>(values: T[]): T[] => { const result = [...values]; for(let i=result.length-1;i>0;i--) {const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result; };
 return shuffle(cards).map(card => {
  const reading=card.answers[0];
  const alternatives=shuffle(cards.filter(other => other.id !== card.id && !other.answers.includes(reading))).slice(0,3);
  return {card,reading,choices:shuffle([card,...alternatives])};
 }).filter(question=>question.choices.length===4).slice(0,8);
}
