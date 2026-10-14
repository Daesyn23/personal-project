import assert from "node:assert/strict";
import test from "node:test";
import { emptyProgress, parseProgress, progressTotals, recordRound, studyDate, studyStreak } from "./kanji-progress.ts";

const answer = (id, correct = true, hinted = false) => ({ card: { id }, correct, hinted });
const round = (overrides = {}) => ({ id: "round-1", lesson: 0, mode: "kanji", completed: true, answers: [answer("0-0"), answer("0-1", true, true), answer("0-2", false)], ...overrides });
const today = new Date(2026, 9, 15, 0, 5);

test("both games accumulate XP and coverage without duplicating a saved round", () => {
  const progress = recordRound(emptyProgress(), round(), today);
  assert.deepEqual(progressTotals(progress), { answered: 3, correct: 2, xp: 15, rounds: 1, practiced: 3 });
  assert.equal(progress.bestStreak, 2);
  assert.equal(progress.perfectRounds, 0);
  assert.strictEqual(recordRound(progress, round(), today), progress);
  const retry = recordRound(progress, round({ id: "retry", answers: [answer("0-2")] }), today);
  assert.deepEqual(progressTotals(retry), { answered: 4, correct: 3, xp: 25, rounds: 2, practiced: 3 });
  assert.equal(retry.perfectRounds, 1);
  assert.deepEqual(parseProgress(JSON.stringify(retry)), retry);
});

test("vocabulary contributes XP and accuracy, but never inflates single-kanji coverage", () => {
  const progress = recordRound(emptyProgress(), round({ mode: "vocabulary", answers: [answer("0:日本")] }), today);
  assert.deepEqual(progressTotals(progress), { answered: 1, correct: 1, xp: 10, rounds: 1, practiced: 0 });
  const anotherLesson = recordRound(progress, round({ id: "lesson-40", lesson: 40, answers: [answer("40-0")] }), today);
  assert.equal(anotherLesson.lastLesson, 40);
  assert.equal(anotherLesson.lessons[40].kanjiIds.length, 1);
});

test("empty rounds do not create activity, partial rounds save only checked answers", () => {
  const empty = emptyProgress();
  assert.strictEqual(recordRound(empty, round({ answers: [] }), today), empty);
  const partial = recordRound(empty, round({ completed: false, answers: [answer("0-0")] }), today);
  assert.equal(partial.perfectRounds, 0);
  assert.equal(progressTotals(partial).answered, 1);
  // Handwriting rewrites remove the disputed answer before the round is saved.
  const corrected = recordRound(empty, round({ answers: [answer("0-0", false)].slice(0, -1).concat(answer("0-0")) }), today);
  assert.equal(progressTotals(corrected).correct, 1);
  assert.equal(progressTotals(corrected).answered, 1);
});

test("daily counts and study streak use local calendar dates and allow yesterday", () => {
  assert.equal(studyDate(today), "2026-10-15");
  const progress = emptyProgress();
  progress.days = { "2026-10-12": 2, "2026-10-13": 4, "2026-10-14": 5 };
  assert.equal(studyStreak(progress, today), 3);
  progress.days["2026-10-15"] = 10;
  assert.equal(studyStreak(progress, today), 4);
  assert.equal(studyStreak(progress, new Date(2026, 9, 17)), 0);
  progress.days = { "2026-09-30": 2, "2026-10-01": 1 };
  assert.equal(studyStreak(progress, new Date(2026, 9, 2)), 2);
  const updated = recordRound(progress, round(), today);
  assert.equal(updated.days["2026-10-15"], 3);
});

test("missing, damaged, or unsupported saved data safely starts a new record", () => {
  for (const raw of [null, "{", "[]", "null", '{"version":2}', JSON.stringify({ ...emptyProgress(), lessons: { 0: { answered: 1, correct: 7 } } }), JSON.stringify({ ...emptyProgress(), days: { yesterday: 5 } }), JSON.stringify({ ...emptyProgress(), bestStreak: -1 })]) {
    assert.deepEqual(parseProgress(raw), emptyProgress());
  }
});
