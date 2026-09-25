import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { matchesKanji } from "./kanji-learning.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const library = JSON.parse(readFileSync(new URL("../data/kanji-lessons.json", import.meta.url), "utf8"));
const find = (lesson, character) => library.lessons[lesson].entries.find(entry => entry.character === character);

test("imports all 41 lessons and all 656 cells, with every source page and image available", () => {
  assert.equal(library.lessons.length, 41);
  const ids = new Set();
  let pageCount = 0;
  for (const [number, lesson] of library.lessons.entries()) {
    assert.equal(lesson.number, number);
    assert.equal(lesson.entries.length, 16);
    assert.ok(existsSync(`${root}public${lesson.pdf}`));
    const pages = [];
    for (const entry of lesson.entries) {
      assert.ok(!ids.has(entry.id));
      ids.add(entry.id);
      assert.ok(entry.meaning && entry.lessonMeaning, `${number}: ${entry.character} needs a meaning`);
      assert.ok(entry.vocabulary.length && entry.pages.length);
      assert.ok(existsSync(`${root}public${entry.strokeImage}`));
      for (const page of entry.pages) {
        assert.ok(existsSync(`${root}public${page.image}`));
        pages.push(page.number);
      }
      for (const row of entry.vocabulary) {
        assert.ok(row.word && row.reading && row.meaning, `${number}: ${entry.character} incomplete vocabulary`);
        assert.ok(entry.pages.some(page => page.number === row.page));
      }
    }
    // Cover page is intentionally omitted; no detail page may be lost or mapped twice.
    assert.deepEqual(pages.sort((a, b) => a - b), Array.from({ length: pages.length }, (_, i) => i + 2));
    pageCount += pages.length;
  }
  assert.equal(ids.size, 656);
  assert.equal(pageCount, 741);
});

test("maps by character when source lessons use a different order and retains continuation pages", () => {
  assert.deepEqual(find(4, "語").pages.map(page => page.number), [17]);
  assert.deepEqual(find(4, "国").pages.map(page => page.number), [16]);
  assert.deepEqual(find(23, "準").pages.map(page => page.number), [4]);
  assert.deepEqual(find(39, "希").pages.map(page => page.number), [9]);
  assert.deepEqual(find(1, "日").pages.map(page => page.number), [2, 3, 4, 5, 6]);
  assert.equal(find(1, "日").vocabulary.length, 23);
});

test("preserves wrapped meanings, superscript ordinal dates and differences between index and lesson glosses", () => {
  assert.equal(find(1, "日").vocabulary.find(row => row.word === "一日").meaning, "1st day, 1 day");
  assert.equal(find(19, "勝").vocabulary.find(row => row.word === "優勝").meaning, "overall victory, championship");
  assert.equal(find(36, "各").vocabulary.find(row => row.word === "各位").meaning, "everyone (usually used in email, documents)");
  assert.equal(find(31, "組").lessonMeaning, "group");
  assert.equal(find(39, "史").lessonMeaning, "history");
});

test("searches meanings, characters, readings and vocabulary with kana and case normalization", () => {
  const one = find(0, "一");
  assert.ok(matchesKanji(one, "一"));
  assert.ok(matchesKanji(one, "ONE"));
  assert.ok(matchesKanji(one, "ヒトツ"));
  assert.ok(matchesKanji(one, "counter"));
  assert.ok(matchesKanji(one, ""));
  assert.ok(!matchesKanji(one, "elephant"));
  assert.ok(matchesKanji(find(39, "史"), "history"));
});
