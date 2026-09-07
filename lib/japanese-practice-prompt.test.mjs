import assert from "node:assert/strict";
import test from "node:test";

import {
  buildJapanesePracticeRealtimeInstruction,
  buildJapanesePracticeSystemInstruction,
  buildPracticeTurnLanguageHint,
} from "./japanese-practice-prompt.ts";
import { practiceVadEagerness } from "./practice-realtime-client.ts";

test("N5 instructions enforce an N5-only ceiling", () => {
  const prompt = buildJapanesePracticeSystemInstruction("N5", "polite");

  assert.match(prompt, /Every word and grammar pattern.*must be N5/s);
  assert.match(prompt, /Do not use N4 or harder language/);
  assert.match(prompt, /Hard ceiling: \*\*N5 only\*\*/);
});

test("N4 instructions allow N5 and N4 but reject harder language", () => {
  const prompt = buildJapanesePracticeSystemInstruction("N4", "casual");

  assert.match(prompt, /must be N5 or N4/);
  assert.match(prompt, /Do not use N3 or harder language/);
  assert.match(prompt, /Hard ceiling: \*\*N5\/N4 only\*\*/);
});

test("per-turn hint keeps the selected N5 ceiling", () => {
  const hint = buildPracticeTurnLanguageHint("japanese", "polite", "N5");

  assert.match(hint, /N5 words and grammar only/);
  assert.doesNotMatch(hint, /N5\/N4 words/);
});

test("Realtime instructions require the whole utterance rather than its gist", () => {
  const prompt = buildJapanesePracticeRealtimeInstruction("N5", "polite");

  assert.match(prompt, /learner's complete turn/);
  assert.match(prompt, /never reduce the turn to only its main point/);
  assert.doesNotMatch(prompt, /Start speaking as soon as you understand their intent/);
});

test("Realtime VAD gives balanced and patient speakers enough time", () => {
  assert.equal(practiceVadEagerness(1400), "high");
  assert.equal(practiceVadEagerness(2400), "medium");
  assert.equal(practiceVadEagerness(3200), "low");
});
