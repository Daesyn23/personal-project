import assert from "node:assert/strict";
import test from "node:test";

import {
  clampLessonToLevel,
  defaultLessonForLevel,
  isLessonAvailableForLevel,
  lessonRangeForLevel,
} from "./jlpt-lesson-range.ts";

test("defines the available lesson ranges for each JLPT level", () => {
  assert.deepEqual(lessonRangeForLevel("n5"), { min: 1, max: 25 });
  assert.deepEqual(lessonRangeForLevel("n4"), { min: 26, max: 50 });
  assert.deepEqual(lessonRangeForLevel("n3"), { min: 1, max: 16 });
});

test("uses the first available lesson as each level default", () => {
  assert.equal(defaultLessonForLevel("n5"), 1);
  assert.equal(defaultLessonForLevel("n4"), 26);
  assert.equal(defaultLessonForLevel("n3"), 1);
});

test("validates and clamps lessons to the selected level", () => {
  assert.equal(isLessonAvailableForLevel("n4", 25), false);
  assert.equal(isLessonAvailableForLevel("n4", 26), true);
  assert.equal(isLessonAvailableForLevel("n4", 50), true);
  assert.equal(isLessonAvailableForLevel("n4", 51), false);
  assert.equal(clampLessonToLevel("n5", 40), 25);
  assert.equal(clampLessonToLevel("n4", 1), 26);
  assert.equal(clampLessonToLevel("n3", 99), 16);
});
