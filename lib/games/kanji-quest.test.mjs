import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { acceptsQuestAnswer, buildQuestDeck, questReading, questStats } from "./kanji-quest.ts";

const library = JSON.parse(readFileSync(new URL("../../data/kanji-lessons.json", import.meta.url), "utf8"));

test("every lesson supplies all 16 kanji and enough complete vocabulary for either round length", () => {
  for (const lesson of library.lessons) {
    const kanji = buildQuestDeck(lesson, "kanji");
    const vocabulary = buildQuestDeck(lesson, "vocabulary");
    assert.equal(kanji.length, 16, `Lesson ${lesson.number}`);
    assert.ok(vocabulary.length >= 16);
    for (const deck of [kanji, vocabulary]) {
      assert.equal(new Set(deck.map(card => card.prompt)).size, deck.length);
      for (const card of deck) {
        assert.ok(card.answers.length);
        for (const reading of card.answers) assert.ok(acceptsQuestAnswer(card, reading));
        assert.equal(acceptsQuestAnswer(card, card.prompt), false);
      }
    }
    assert.ok(vocabulary.every(card => !/[～()X]/.test(card.prompt)));
  }
});

test("accepts alternate lesson readings, romaji, katakana, width and composed kana; rejects wrong or partial input", () => {
  const four = buildQuestDeck(library.lessons[0], "kanji").find(card => card.prompt === "四");
  for (const input of ["よん", "し", "yon", "shi", "ヨン", "  ＳＨＩ  "]) assert.equal(acceptsQuestAnswer(four, input), true, input);
  for (const input of ["", " ", "四", "よ", "y", "san", "よん!", "よ ん", "し/よん"]) {
    // よ is a valid kunyomi stem in the supplied lesson.
    assert.equal(acceptsQuestAnswer(four, input), input === "よ", input);
  }
  assert.equal(questReading("か\u3099く"), "がく");
  assert.equal(questReading("gakkou"), "がっこう");
  assert.equal(questReading("kan'i"), "かんい");
});

test("recovers missing kanji header readings from aligned vocabulary only", () => {
  const deck = buildQuestDeck(library.lessons[11], "kanji");
  assert.deepEqual(deck.find(card => card.prompt === "春").answers, ["はる"]);
  assert.deepEqual(deck.find(card => card.prompt === "冬").answers, ["ふゆ"]);
  assert.deepEqual(deck.find(card => card.prompt === "降").answers, ["ふ", "お"]);
  assert.equal(acceptsQuestAnswer(deck.find(card => card.prompt === "降"), "ふる"), false);
});

test("whole-word questions merge duplicate readings and never accept a kanji stem", () => {
  const lesson = { entries: [
    { id: "a", character: "日", vocabulary: [{ word: "日本", reading: "にほん", meaning: "Japan" }, { word: "～人", reading: "～にん", meaning: "people" }] },
    { id: "b", character: "本", vocabulary: [{ word: "日本", reading: "にっぽん", meaning: "Japan" }] },
  ] };
  const cards = buildQuestDeck(lesson, "vocabulary");
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].answers, ["にほん", "にっぽん"]);
  assert.ok(acceptsQuestAnswer(cards[0], "nippon"));
  assert.equal(acceptsQuestAnswer(cards[0], "に"), false);
});

test("hints give half points, misses break streaks, and each retry starts a fresh score", () => {
  const answers = [
    { correct: true, hinted: false }, { correct: true, hinted: true },
    { correct: false, hinted: false }, { correct: true, hinted: false },
  ];
  assert.deepEqual(questStats(answers), { correct: 3, points: 25, streak: 1, bestStreak: 2 });
  assert.deepEqual(questStats([]), { correct: 0, points: 0, streak: 0, bestStreak: 0 });
});
