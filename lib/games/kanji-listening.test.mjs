import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildQuestDeck} from './kanji-quest.ts';
import {buildListeningQuestions} from './kanji-listening.ts';
const library=JSON.parse(readFileSync(new URL('../../data/kanji-lessons.json',import.meta.url)));
test('all lessons provide eight playable listening questions without ambiguous homophones',()=>{
 for(const lesson of library.lessons){
  const questions=buildListeningQuestions(buildQuestDeck(lesson,'vocabulary'));
  assert.equal(questions.length,8,`Lesson ${lesson.number}`);
  for(const question of questions){
   assert.equal(question.choices.length,4);
   assert.equal(new Set(question.choices.map(card=>card.id)).size,4);
   assert.equal(question.choices.filter(card=>card.answers.includes(question.reading)).length,1);
  }
 }
});
