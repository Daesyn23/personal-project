/** Compile the original, human-readable mnemonic collection; never overwrite it during PDF imports. */
import { readFileSync, writeFileSync } from "node:fs";

const input = new URL("../data/kanji-mnemonics.txt", import.meta.url);
const output = new URL("../data/kanji-mnemonics.json", import.meta.url);
const library = JSON.parse(readFileSync(new URL("../data/kanji-lessons.json", import.meta.url), "utf8"));
const expected = new Set(library.lessons.flatMap(lesson => lesson.entries.map(entry => entry.character)));
const stories = {};

for (const [index, raw] of readFileSync(input, "utf8").split(/\r?\n/).entries()) {
  if (!raw.trim() || raw.startsWith("#")) continue;
  const fields = raw.split("|").map(field => field.trim());
  if (fields.length !== 4 || fields.some(field => !field)) throw new Error(`Invalid mnemonic on line ${index + 1}`);
  const [character, pictures, scene, story] = fields;
  if (!expected.has(character)) throw new Error(`Unexpected kanji: ${character}`);
  if (stories[character]) throw new Error(`Duplicate mnemonic: ${character}`);
  stories[character] = { cues: pictures.split(/\s+/), scene, story };
}
const missing = [...expected].filter(character => !stories[character]);
if (missing.length) throw new Error(`Missing mnemonics: ${missing.join(" ")}`);
writeFileSync(output, JSON.stringify(stories, null, 2) + "\n");
console.log(`Built ${Object.keys(stories).length} original kanji mnemonics.`);
