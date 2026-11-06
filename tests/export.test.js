const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const lib = path.join(__dirname, "..", "extension", "lib");
const ctx = {
  console,
  Date,
  JSON,
  Object,
  Array,
  String,
  Math,
  Number,
  Error,
  URL,
  URLSearchParams,
  btoa,
  setTimeout,
  fetch: async () => ({ ok: false, json: async () => ({}) })
};
ctx.globalThis = ctx;
for (const file of ["util.js", "markdown.js", "notion.js"]) {
  vm.runInNewContext(fs.readFileSync(path.join(lib, file), "utf8"), ctx);
}

const page = {
  id: "p1",
  title: "A room of one's own",
  url: "https://example.com/woolf",
  tags: ["reading"],
  pageNote: "Reread the spider web paragraph.",
  createdAt: Date.parse("2026-04-09"),
  updatedAt: Date.parse("2026-04-09"),
  highlights: [
    {
      id: "h1",
      color: "yellow",
      text: "a woman must have money and a room of her own if she is to write fiction",
      note: "The lock is not a metaphor.",
      tags: ["money"],
      createdAt: Date.parse("2026-04-09")
    },
    {
      id: "h2",
      color: "mint",
      text: "Fiction is like a spider's web",
      note: "",
      tags: [],
      createdAt: Date.parse("2026-04-10")
    }
  ]
};

const md = ctx.Inkmark.pageToMarkdown(page);
assert.match(md, /# A room of one's own/);
assert.match(md, /example.com\/woolf/);
assert.match(md, /a woman must have money/);
assert.match(md, /The lock is not a metaphor/);
assert.match(md, /#reading|#money/);
assert.equal(ctx.Inkmark.filenameForPage(page), "2026-04-09-a-room-of-ones-own.md");

assert.match(md, /## Reference\n\n“A room of one's own\.” \*example\.com\*\. <https:\/\/example\.com\/woolf>\. Accessed 2026-04-09\./);
assert.ok(md.includes("[View in source](https://example.com/woolf#:~:text=a%20woman%20must%20have%20money,she%20is%20to%20write%20fiction)"));
assert.ok(md.includes("[View in source](https://example.com/woolf#:~:text=Fiction%20is%20like%20a%20spider's%20web)"));

const cited = ctx.Inkmark.pageToMarkdown(Object.assign({}, page, { author: "Virginia Woolf", site: "Hogarth", published: "1929-10-24" }));
assert.match(cited, /^author: Virginia Woolf$/m);
assert.match(cited, /Virginia Woolf\. “A room of one's own\.” \*Hogarth\*, 1929-10-24\./);
assert.equal(
  ctx.Inkmark.highlightLink({ url: "https://ex.com/a#top", kind: "web" }, { text: "well-known fact" }),
  "https://ex.com/a#:~:text=well%2Dknown%20fact"
);
const pdfMd = ctx.Inkmark.pageToMarkdown({ title: "Paper", url: "local-pdf://paper.pdf", kind: "pdf", highlights: [{ text: "x", color: "sky" }] });
assert.ok(!pdfMd.includes("View in source"));

assert.ok(!ctx.Inkmark.pageToMarkdown(Object.assign({}, page, { url: "https://example.com/woolf?utm_source=x" })).includes("utm_source"));

const many = ctx.Inkmark.pagesToMarkdown([page, page]);
assert.ok(many.split("\n---\n").length >= 2);
assert.match(many, /^# Inkmark export/);
assert.ok(!many.includes("source: inkmark"));

const blocks = ctx.Inkmark.pageToNotionBlocks(page);
assert.equal(blocks[0].type, "bookmark");
assert.equal(blocks[0].bookmark.url, page.url);
const quotes = blocks.filter((b) => b.type === "quote");
assert.equal(quotes.length, 2);
assert.equal(quotes[0].quote.color, "yellow_background");
assert.equal(quotes[1].quote.color, "green_background");
assert.ok(quotes[0].quote.rich_text[0].text.content.includes("room of her own"));

const collapsed = ctx.Inkmark._collapse
  ? null
  : true;
assert.equal(ctx.Inkmark.canonicalUrl("https://ex.com/a?utm_source=x#y"), "https://ex.com/a");
assert.equal(ctx.Inkmark.isPdfUrl("https://ex.com/paper.pdf"), true);
assert.equal(ctx.Inkmark.colorOf("lilac").notion, "purple_background");
assert.equal(
  ctx.Inkmark.parseNotionId("https://www.notion.so/My-Page-b55c9c91384d452b81dbd1ef79372b75"),
  "b55c9c91384d452b81dbd1ef79372b75"
);

const auth = ctx.Inkmark.notionAuthorizeUrl("abc", "https://ext.chromiumapp.org/notion", "st");
assert.match(auth, /api\.notion\.com\/v1\/oauth\/authorize/);
assert.match(auth, /client_id=abc/);
assert.match(auth, /owner=user/);
assert.match(auth, /state=st/);

const picked = ctx.Inkmark.pickDefaultParent([
  { id: "1", type: "page", title: "Random" },
  { id: "2", type: "database", title: "Inkmark" }
]);
assert.equal(picked.id, "2");

assert.equal(ctx.Inkmark.notionTitleOf({ object: "database", title: [{ plain_text: "Highlights" }] }), "Highlights");

console.log("ok", { markdownChars: md.length, notionBlocks: blocks.length });

// PDF detection looks at the path, not at text inside the query string.
assert.equal(ctx.Inkmark.isPdfUrl("https://www.google.com/search?q=chrome-extension%3A%2F%2Fx%2Fpdf%2Fviewer.html%3Ffile%3Dhttps%253A%252F%252Fa.com%252Fb.pdf"), false);
assert.equal(ctx.Inkmark.isPdfUrl("https://a.com/redirect?to=https://b.com/c.pdf"), false);
assert.equal(ctx.Inkmark.isPdfUrl("https://a.com/files/Report.PDF"), true);
assert.equal(ctx.Inkmark.isPdfUrl("https://a.com/doc.pdf?download=1#page=2"), true);
console.log("ok isPdfUrl");
