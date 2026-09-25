import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { kanjiShapeUrl, kanjiPartLabel } from "./kanji-shape.ts";

const library = JSON.parse(readFileSync(new URL("../data/kanji-lessons.json", import.meta.url), "utf8"));
const shapeFor = character => JSON.parse(readFileSync(new URL(`../public${kanjiShapeUrl(character)}`, import.meta.url), "utf8"));

test("every kanji has a local drawing whose component groups cover every stroke exactly once", () => {
  let count = 0;
  for (const lesson of library.lessons) for (const entry of lesson.entries) {
    const shape = shapeFor(entry.character);
    assert.equal(shape.character, entry.character);
    assert.ok(shape.paths.length > 0);
    assert.ok(shape.paths.every(path => /^M\s*[-\d.]/i.test(path) && !/NaN|undefined|</.test(path)));
    assert.ok(shape.parts.length > 0);
    const covered = shape.parts.flatMap(part => part.strokes).sort((a, b) => a - b);
    assert.deepEqual(covered, shape.paths.map((_, i) => i), `${entry.character}: incomplete or overlapping parts`);
    assert.ok(shape.parts.every(part => part.strokes.length));
    count++;
  }
  assert.equal(count, 656);
});

test("familiar character components align to real stroke positions", () => {
  assert.deepEqual(shapeFor("休").parts.map(part => [part.label, part.strokes]), [["亻", [0, 1]], ["木", [2, 3, 4, 5]]]);
  assert.deepEqual(shapeFor("何").parts.map(part => part.label), ["亻", "可"]);
  assert.deepEqual(shapeFor("聞").parts.map(part => part.label), ["門", "耳"]);
  assert.deepEqual(shapeFor("明").parts.map(part => part.label), ["日", "月"]);
  assert.equal(shapeFor("一").parts.length, 1);
  // An interrupted enclosure must remain one selectable group, including its closing stroke.
  const garden = shapeFor("園");
  assert.deepEqual(garden.parts[0].strokes, [0, 1, 12]);
});

test("guide URLs, readable part names, and source attribution are included", () => {
  assert.equal(kanjiShapeUrl("休"), "/learning/kanji/shapes/04f11.json");
  assert.throws(() => kanjiShapeUrl(""));
  assert.throws(() => kanjiShapeUrl("休木"));
  assert.equal(kanjiPartLabel(shapeFor("休").parts[0], 0), "亻 · person");
  const notice = readFileSync(new URL("../public/learning/kanji/shapes/NOTICE.txt", import.meta.url), "utf8");
  assert.match(notice, /Ulrich Apel/);
  assert.match(notice, /creativecommons.org\/licenses\/by-sa\/3.0/);
  assert.ok(existsSync(new URL("../public/learning/kanji/shapes/COPYING.txt", import.meta.url)));
});
