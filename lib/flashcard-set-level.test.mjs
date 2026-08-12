import assert from "node:assert/strict";
import test from "node:test";

import { compareFlashcardSets } from "./flashcard-set-level.ts";

function set(id, name, jlptLevel) {
  return { id, name, jlpt_level: jlptLevel };
}

test("sorts flashcard sets by N5, N4, N3, then lesson number", () => {
  const sets = [
    set("n3-2", "Lesson 2", "n3"),
    set("n4-30", "Lesson 30", "n4"),
    set("n5-2", "Lesson 2", "n5"),
    set("n3-1", "Lesson 1", "n3"),
    set("n5-1", "Lesson 1", "n5"),
    set("n4-26", "Lesson 26", "n4"),
  ];

  assert.deepEqual(
    sets.sort(compareFlashcardSets).map((item) => item.id),
    ["n5-1", "n5-2", "n4-26", "n4-30", "n3-1", "n3-2"]
  );
});

test("places untagged collections after tagged JLPT collections", () => {
  const sets = [
    set("other", "Personal vocabulary", null),
    set("n3", "Lesson 1", "n3"),
  ];

  assert.deepEqual(sets.sort(compareFlashcardSets).map((item) => item.id), ["n3", "other"]);
});
