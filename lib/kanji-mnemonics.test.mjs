import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const library = JSON.parse(readFileSync(new URL("../data/kanji-lessons.json", import.meta.url), "utf8"));
const mnemonics = JSON.parse(readFileSync(new URL("../data/kanji-mnemonics.json", import.meta.url), "utf8"));
const original = readFileSync(new URL("../data/kanji-mnemonics.txt", import.meta.url), "utf8");

test("every lesson kanji has its own complete memory story and visual cue", () => {
  const characters = library.lessons.flatMap(lesson => lesson.entries.map(entry => entry.character));
  assert.equal(characters.length, 656);
  assert.deepEqual(Object.keys(mnemonics).sort(), [...characters].sort());
  const stories = new Set();
  for (const character of characters) {
    const mnemonic = mnemonics[character];
    assert.ok(mnemonic.story.length >= 40, `${character} needs a complete story`);
    assert.ok(mnemonic.story.split(/\s+/).length <= 40, `${character} story should be short`);
    assert.ok(!stories.has(mnemonic.story), `${character} has a reused story`);
    stories.add(mnemonic.story);
    assert.ok(mnemonic.scene && mnemonic.cues.length > 0 && mnemonic.cues.length <= 3);
    assert.ok(mnemonic.cues.every(cue => cue.trim()));
    assert.ok(!/TODO|placeholder|coming soon/i.test(mnemonic.story));
  }
});

test("generated content matches the editable originals and stays separate from PDF imports", () => {
  const parsed = {};
  for (const line of original.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [character, cues, scene, story] = line.split("|").map(field => field.trim());
    parsed[character] = { cues: cues.split(/\s+/), scene, story };
  }
  assert.deepEqual(mnemonics, parsed);
  const importer = readFileSync(new URL("../scripts/import-kanji-materials.mjs", import.meta.url), "utf8");
  assert.ok(!importer.includes("kanji-mnemonics"));
});

test("reference-style stories link familiar pictures to the correct meanings", () => {
  assert.match(mnemonics["何"].story, /person.*parcel.*What/is);
  assert.match(mnemonics["休"].story, /person.*tree.*rest/is);
  assert.match(mnemonics["聞"].story, /ear.*gate.*Listen/is);
  assert.match(mnemonics["鳴"].story, /bird.*chirps/is);
});
