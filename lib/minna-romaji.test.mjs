import assert from "node:assert/strict";
import test from "node:test";

import {
  minnaSpacedRomaji,
  romajiMatchesKana,
  validateGeneratedMinnaRomaji,
} from "./minna-romaji.ts";

test("creates deterministic Minna-style romaji from kana", () => {
  assert.equal(minnaSpacedRomaji("くれます"), "ku re masu");
  assert.equal(minnaSpacedRomaji("なおします"), "na o shi masu");
  assert.equal(minnaSpacedRomaji("つれていきます"), "tsu re te i ki masu");
  assert.equal(minnaSpacedRomaji("しょうかいします"), "shou ka i shi masu");
  assert.equal(minnaSpacedRomaji("がっこう"), "ga kkou");
  assert.equal(minnaSpacedRomaji("コーヒー"), "koo hii");
});

test("keeps valid AI spelling and its preferred spacing", () => {
  assert.equal(
    validateGeneratedMinnaRomaji("しょうかいします", "shou kai shi masu"),
    "shou kai shi masu"
  );
  assert.equal(validateGeneratedMinnaRomaji("はらいます", "HA RA I MASU"), "ha ra i masu");
});

test("replaces incorrect AI romaji with deterministic romaji", () => {
  assert.equal(validateGeneratedMinnaRomaji("わすれます", "wa su le masu"), "wa su re masu");
  assert.equal(validateGeneratedMinnaRomaji("きって", "ki te"), "ki tte");
  assert.equal(validateGeneratedMinnaRomaji("なくします", null), "na ku shi masu");
});

test("detects existing romaji that does not match its kana", () => {
  assert.equal(romajiMatchesKana("わすれます", "wa su re masu"), true);
  assert.equal(romajiMatchesKana("わすれます", "wa su le masu"), false);
  assert.equal(romajiMatchesKana("きって", "ki te"), false);
});

test("does not pretend to validate kana fields containing kanji", () => {
  assert.equal(validateGeneratedMinnaRomaji("忘れます", "wa su re masu"), "wa su re masu");
});
