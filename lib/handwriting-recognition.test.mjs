import assert from "node:assert/strict";
import test from "node:test";
import { HANDWRITING_SYSTEM, handwritingPng, parseHandwritingResult, recognizeHandwriting } from "./handwriting-recognition.ts";
import { openaiChatCompletionMultimodal } from "./openai-chat.ts";

const response = (reading, legible = true) => JSON.stringify({ reading, legible });

test("transcription preserves small kana and voicing without converting other scripts", () => {
  assert.equal(parseHandwritingResult(response("きゃっ か\u3099\nく")), "きゃっがく");
  assert.equal(parseHandwritingResult('```json\n' + response("にほん") + '\n```'), "にほん");
  for (const value of ["", "ー", "日本", "ニホン", "nihon", "にほん!", "にほん/にっぽん", "あ".repeat(49)]) {
    assert.equal(parseHandwritingResult(response(value)), null, value);
  }
  assert.equal(parseHandwritingResult(response("にほん", false)), null);
  assert.throws(() => parseHandwritingResult("not JSON"));
  assert.throws(() => parseHandwritingResult("{}"));
});

test("provider failure falls back, but uncertain ink stays ungraded instead of trying to guess", async () => {
  let backups = 0;
  const backup = async () => { backups++; return response("いち"); };
  assert.equal(await recognizeHandwriting([async () => { throw new Error("service unavailable"); }, backup]), "いち");
  assert.equal(backups, 1);
  assert.equal(await recognizeHandwriting([async () => response("", false), backup]), null);
  assert.equal(backups, 1);
  assert.equal(await recognizeHandwriting([async () => "invalid JSON", backup]), "いち");
  await assert.rejects(recognizeHandwriting([async () => { throw new Error("down"); }]), /unavailable/);
});

test("only bounded PNG pad images are accepted, never remote URLs or arbitrarily large canvases", () => {
  const header = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(header);
  header.write("IHDR", 12); header.writeUInt32BE(960, 16); header.writeUInt32BE(640, 20);
  const url = () => `data:image/png;base64,${header.toString("base64")}`;
  assert.equal(handwritingPng(url()), header.toString("base64"));
  header.writeUInt32BE(100000, 16);
  assert.throws(() => handwritingPng(url()));
  for (const input of [null, "https://example.com/pad.png", "data:image/svg+xml;base64,AAAA", "data:image/png;base64,AAAA", "a".repeat(1_400_001)]) {
    assert.throws(() => handwritingPng(input));
  }
});

test("vision call supports structured transcription and propagates cancellation", async t => {
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only-key";
  t.after(() => { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; });
  const controller = new AbortController();
  const image = "data:image/png;base64,test-fixture";
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/chat/completions");
    assert.equal(options.signal, controller.signal);
    const payload = JSON.parse(options.body);
    assert.deepEqual(payload.response_format, { type: "json_object" });
    assert.equal(payload.messages[0].content, HANDWRITING_SYSTEM);
    assert.deepEqual(payload.messages[1].content, [{ type: "image_url", image_url: { url: image, detail: "high" } }]);
    return Response.json({ choices: [{ message: { content: response("いち") } }] });
  });
  const result = await openaiChatCompletionMultimodal({
    jsonMode: true, signal: controller.signal, maxTokens: 256,
    messages: [{ role: "system", content: HANDWRITING_SYSTEM }, { role: "user", content: [{ type: "image_url", image_url: { url: image, detail: "high" } }] }],
  });
  assert.equal(parseHandwritingResult(result.text), "いち");
});
