import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildQuestDeck } from "./kanji-quest.ts";
import { buildRushQuestions } from "./kanji-rush.ts";

const library = JSON.parse(readFileSync(new URL("../../data/kanji-lessons.json", import.meta.url), "utf8"));

test("all 656 kanji have four unique choices with exactly one valid lesson reading", () => {
  for (const lesson of library.lessons) {
    const deck = buildQuestDeck(lesson, "kanji");
    for (const random of [() => 0, () => 0.5, () => 0.99999]) {
      const questions = buildRushQuestions(deck, random);
      assert.equal(questions.length, 16);
      assert.equal(new Set(questions.map(question => question.card.id)).size, 16);
      for (const { card, choices } of questions) {
        assert.equal(new Set(choices).size, 4, `Lesson ${lesson.number}: ${card.prompt}`);
        assert.equal(choices.filter(choice => card.answers.includes(choice)).length, 1);
        assert.ok(choices.every(choice => /^[ぁ-ゖー]+$/u.test(choice)));
      }
    }
  }
});

test("a shared reading or alternative accepted reading can never be a wrong option", () => {
  const cards = [
    { id: "a", answers: ["し", "よん", "よ"] },
    { id: "b", answers: ["し", "に"] },
    { id: "c", answers: ["さん", "いち", "ご"] },
  ];
  const before = JSON.stringify(cards);
  const question = buildRushQuestions(cards, () => 0.5).find(question => question.card.id === "a");
  assert.equal(question.choices.filter(choice => ["し", "よん", "よ"].includes(choice)).length, 1);
  assert.equal(JSON.stringify(cards), before);
});
