const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const lib = path.join(__dirname, "..", "extension", "lib");
const calls = [];
let reply = null;
const ctx = {
  console, Date, JSON, Object, Array, String, Math, Number, Error, URL, URLSearchParams, Set, Promise, RegExp,
  fetch: async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return reply(url, init);
  }
};
ctx.globalThis = ctx;
for (const file of ["util.js", "ai.js", "locator.js"]) {
  vm.runInNewContext(fs.readFileSync(path.join(lib, file), "utf8"), ctx);
}
const I = ctx.Inkmark;
const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });

(async () => {
  // JSON comes back bare, fenced, or wrapped in prose.
  assert.strictEqual(I.parseAiJson('{"highlights":[{"quote":"A  b","category":"key","reason":"r"}]}')[0].quote, "A b");
  assert.strictEqual(I.parseAiJson('Sure!\n```json\n{"highlights":[{"quote":"x","category":"nope","reason":""}]}\n```')[0].category, "key");
  assert.strictEqual(I.parseAiJson('Here: {"highlights":[{"quote":"y","category":"caveat","reason":"z"}]} done').length, 1);
  assert.throws(() => I.parseAiJson("no json here"), /JSON/);

  // Chunks split on paragraph breaks and lose no text.
  const para = "Sentence one is here. ".repeat(40);
  const doc = Array.from({ length: 12 }, () => para).join("\n\n");
  const chunks = I.chunkText(doc, 2000);
  assert.ok(chunks.length > 1 && chunks.every((c) => c.length <= 2000));
  assert.strictEqual(chunks.join(" ").replace(/\s+/g, " "), doc.replace(/\s+/g, " ").trim());

  // A reply cut off at the output limit keeps its complete highlights.
  const cut = I.parseAiJson('{"highlights":[{"quote":"one","category":"key","reason":"a"},{"quote":"two","category":"evidence","reason":"b"},{"quote":"thr');
  assert.strictEqual(cut.length, 2);
  assert.strictEqual(I.parseAiJson('{"highlights":[]}').length, 0);
  // Paragraph-sized picks are dropped.
  assert.strictEqual(I.parseAiJson(JSON.stringify({ highlights: [{ quote: "word ".repeat(60), category: "key", reason: "" }, { quote: "short phrase", category: "key", reason: "" }] })).length, 1);

  // Firecrawl markdown loses link targets, emphasis and heading marks.
  assert.strictEqual(
    I.markdownToText("## Title\n\nRead **the** [docs](https://x.y/z) now.\n\n![img](a.png)"),
    "Title\n\nRead the docs now."
  );

  // Quotes match through curly quotes, dashes, case, and PDF hyphenation.
  const hay = "It’s the “central” claim — and the evi- dence is strong.";
  const at = I.fuzzyFind(hay, `it's the "central" claim - and the evidence is strong`);
  assert.strictEqual(JSON.stringify(at), JSON.stringify([0, hay.length - 1]));
  assert.strictEqual(I.fuzzyFind(hay, "short"), null);

  // Anthropic: right endpoint, headers, structured output, no sampling params.
  const settings = { aiProvider: "anthropic", aiKey: "sk-ant-test", aiDensity: "normal" };
  assert.ok(I.aiReady(settings));
  assert.ok(!I.aiReady({ aiProvider: "openai" }));
  assert.ok(I.aiReady({ aiProvider: "ollama" }));
  const text = "The tide rises twice a day because of the moon. ".repeat(20);
  reply = () => ok({
    stop_reason: "end_turn",
    content: [{ type: "text", text: '{"highlights":[{"quote":"The tide rises twice a day because of the moon.","category":"key","reason":"Core fact"}]}' }]
  });
  const out = await I.aiPickHighlights(settings, { title: "Tides", url: "https://e.x/t" }, text);
  assert.strictEqual(out.items.length, 1);
  assert.strictEqual(out.model, "claude-opus-5-5");
  const a = calls[0];
  assert.strictEqual(a.url, "https://api.anthropic.com/v1/messages");
  assert.strictEqual(a.init.headers["x-api-key"], "sk-ant-test");
  assert.strictEqual(a.init.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.strictEqual(a.body.output_config.format.type, "json_schema");
  assert.ok(!("temperature" in a.body));
  assert.ok(a.body.messages[0].content.includes("<document>"));
  // No cap on how many passages the model may pick.
  assert.ok(!/at most \d+/i.test(a.body.system + a.body.messages[0].content));
  assert.ok(/no limit/i.test(a.body.system));

  // OpenAI-compatible: falls back without response_format when the server rejects it.
  calls.length = 0;
  let n = 0;
  reply = () => {
    n += 1;
    if (n === 1) return { ok: false, status: 400, text: async () => '{"error":{"message":"response_format unsupported"}}' };
    return ok({ choices: [{ message: { content: '{"highlights":[{"quote":"q1 is long enough","category":"evidence","reason":"r"}]}' } }] });
  };
  const out2 = await I.aiPickHighlights({ aiProvider: "groq", aiKey: "gsk" }, { title: "T" }, text);
  assert.strictEqual(calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.strictEqual(calls[0].body.response_format.type, "json_object");
  assert.ok(!("response_format" in calls[1].body));
  assert.strictEqual(calls[1].init.headers.Authorization, "Bearer gsk");
  assert.strictEqual(out2.items[0].category, "evidence");

  // Auth errors read as auth errors.
  reply = () => ({ ok: false, status: 401, text: async () => "{}" });
  await assert.rejects(I.aiPickHighlights(settings, {}, text), /rejected the API key/);

  // Firecrawl v2 request shape.
  calls.length = 0;
  reply = () => ok({ success: true, data: { markdown: "# Hi", metadata: { title: "Hi" } } });
  const fc = await I.firecrawlScrape("https://e.x/a", "fc-1");
  assert.strictEqual(calls[0].url, "https://api.firecrawl.dev/v2/scrape");
  assert.strictEqual(calls[0].init.headers.Authorization, "Bearer fc-1");
  assert.deepStrictEqual(calls[0].body, { url: "https://e.x/a", formats: ["markdown"], onlyMainContent: true });
  assert.strictEqual(fc.markdown, "# Hi");

  console.log("ai tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
