# Inkmark

A Chrome extension for highlighting web pages and PDFs, with unlimited export to Notion and Obsidian. Nothing is metered. There is no account.

Web Highlights puts Notion and Obsidian export behind a daily cap unless you pay. Inkmark connects with Notion OAuth (or an internal token) and writes straight into Obsidian through Local REST API. Nothing is metered.

## Install

1. Open `chrome://extensions`
2. Turn on Developer mode
3. Load unpacked
4. Pick `extension/` inside this folder

Pin the toolbar icon. On a page, select text and choose a color. `Option+S` / `Alt+S` highlights the selection. `Option+H` / `Alt+H` opens the sidebar.

### Local PDFs

PDF tabs open in Inkmark's viewer automatically, where you can select and highlight text like on any page (turn this off in Settings → **Open PDFs in Inkmark**). For files on disk, on the extension card turn on **Allow access to file URLs**, then reload the tab. Zoom with the − / + buttons or Ctrl/⌘ + / −; click the percentage to fit the width again. **Chrome viewer** in the header goes back to Chrome's own viewer.

Page 1 shows as soon as its bytes arrive; the rest downloads in the background. The finished file is cached in the browser (last 30 PDFs, up to 100 MB each), so reopening a PDF or opening it from the Library is instant, and files picked with **Open local file** reopen too. If the server reports a new version, the next open fetches it again.

## AI highlighting

Inkmark can highlight the important passages for you, in the spirit of [unbaited](https://unbaited.danielpetho.com/): a model reads the page, and every passage it picks is painted in, colored by kind, with a one-line reason as its note.

| Color | Kind |
| --- | --- |
| Yellow | Key point |
| Blue | Evidence |
| Green | Definition |
| Orange | Takeaway |
| Pink | Caveat |

Settings → **AI highlighting**: pick a provider, paste a key, click **Test connection**. Presets: Cerebras (default, `qwen-3.8-27b`), Anthropic, OpenAI, Google Gemini, OpenRouter, Groq, Ollama on this computer, or any OpenAI-compatible base URL. Then use **Highlight key ideas** in the sidebar, the popup, the PDF and document viewers' headers, or the page's right-click menu. A shortcut can be set at `chrome://extensions/shortcuts`.

- **What matters to you** steers the picks (one line per thing to look for). **How much to highlight** sets the density.
- **Highlight articles automatically** runs once on each long article you open. Pages you cleared stay cleared.
- AI highlights are ordinary highlights: recolor, annotate, delete, export. **Clear AI** removes only the ones AI added. Hover a mark to see why it was picked.
- Quotes are matched back to the page while ignoring punctuation, case and spacing, so a model's small slips (curly quotes, PDF hyphenation) still land. Quotes that aren't on the page are dropped and counted in the sidebar.
- Long documents are read in 40,000-character parts, up to 160,000 characters. Past that the sidebar says how much was read.

**Firecrawl (optional).** Add a Firecrawl key to fetch the article through Firecrawl's `/v2/scrape` (main content only) when a page has little readable text, or for every page. Firecrawl can't see pages behind your login.

## Documents (Word, PowerPoint, Excel, EPUB…)

Popup → **Open a document**, or right-click a link to a `.docx`/`.pptx`/`.xlsx`/… → **Open document in Inkmark**. Files convert to Markdown on this computer with [anydoc](https://github.com/firecrawl/anydoc) (WebAssembly, vendored under `extension/vendor/anydoc/`, MIT) and render as a page you can highlight by hand or with AI. Supported: doc, docx, odt, rtf, epub, ppt, pptx, odp, xls, xlsx, ods, csv. Converted text is cached (last 50 files), so Library links reopen them. Markdown rendering uses [marked](https://github.com/markedjs/marked) (MIT); raw HTML inside a document is shown as text.

## Notion

**Sign in with Notion** (same Allow-access popup as Web Highlights):

1. Settings → copy the Redirect URL
2. Create a *public* integration at [notion.so/my-integrations](https://www.notion.so/my-integrations)
3. Paste that redirect URL into the integration
4. Paste the client ID and secret into Inkmark (once)
5. Click **Connect Notion**, pick the pages Inkmark may use, then pick a destination from the list

After that, export is one click. No page IDs. No daily cap.

**Faster path:** create an Internal integration, share a page with it, paste the token, click **Use this token**. Inkmark lists those pages so you still never copy an ID.

## Obsidian

Best path: install the community plugin [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api), enable its HTTP server (port 27123), paste the API key in Settings, click **Connect Local REST API**. Sidebar **Send to Obsidian** writes the note into `Inkmark/` in your vault.

Also available: connect a vault folder, copy Markdown, download `.md`, or `obsidian://` as a fallback.

## Markdown

Sidebar → **Copy Markdown** / **Download .md**. The toolbar popup and each Library card offer the same. Each note carries its reference:

- Frontmatter with `url`, `site`, `author`, `published` (read from the page's meta tags when present)
- A **View in source** link under every quote that scrolls to the passage (`#:~:text=` fragment)
- A `## Reference` citation at the end: Author. “Title.” *Site*, date. URL. Accessed date.

Tracking params (`utm_*`, `fbclid`, …) are removed from exported links.

## Data

Highlights live in this browser (IndexedDB). Settings, including the Notion token and AI/Firecrawl keys, stay in `chrome.storage.local`. Settings has a JSON backup.

## Demo without installing

`demo/article.html` runs the highlighter against an in-page store. Open it as a file or serve the repo.

## Chrome Web Store

```bash
./pack.sh
```

That writes `dist/inkmark.zip`. `manifest.json` is at the zip root. Upload that file at [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole) → New item.

Host `extension/privacy.html` at a public HTTPS URL (GitHub Pages is enough) and paste that URL in the listing’s Privacy tab. Local storage still counts as user data, so the policy is required.

### Listing

**Name.** Inkmark

**Short.** Highlight any webpage or PDF. Unlimited export to Notion and Obsidian.

**Single purpose.** Save highlights and notes from web pages and PDFs, then export them as Markdown, to Notion, or to Obsidian.

**Description.**

Inkmark highlights web pages and PDFs in this browser. There is no account and no daily cap.

Select text, pick a color, add a note. Option+S (Alt+S) highlights. Option+H (Alt+H) opens the sidebar. Marks come back when you return to the page.

Copy Markdown or download a .md file whenever you want. Connect Notion or Obsidian in Settings if you want the same notes in a vault. Export is not metered.

PDFs open in Inkmark’s viewer so you can mark them the same way. Highlights, notes, and tokens stay on this device until you export.

**Screenshots.** 1280×800 or 640×400 PNG. Promo video: `intro/out/inkmark-intro.mp4` (upload to YouTube, paste the link).

### Privacy tab

Check: user activity, website content, authentication information (only if they connect Notion). Uncheck sale of data, creditworthiness, and unrelated use.

Data use: provide the extension’s features. When the user adds an AI provider key and asks for AI highlights (or turns on automatic highlighting), that provider receives the page's text; Firecrawl receives the page URL if the user adds a Firecrawl key. Notion receives a page’s highlights when the user clicks export. Obsidian Local REST API on this machine receives Markdown when the user clicks export.

### Permission justifications

- **storage / unlimitedStorage.** Highlights, notes, and the PDF cache live in this browser.
- **tabs.** Know the current page so the popup, PDF handoff, and shortcut can act on it.
- **scripting.** Inject the highlighter when you select text or open the sidebar.
- **contextMenus.** “Highlight with Inkmark” on a selection.
- **identity.** Notion’s Allow-access popup (`launchWebAuthFlow`).
- **Host access to all sites.** A highlighter has to run on the page you are reading. It also lets the extension call the AI provider and Firecrawl endpoints the user configures.
- **`wasm-unsafe-eval` (extension pages only).** The document reader runs anydoc as WebAssembly.

The `key` field in `manifest.json` keeps the unpacked extension ID stable so the Notion redirect URL does not change. Leave it in the zip on first upload.

PDF rendering uses Mozilla pdf.js (Apache 2.0), vendored under `extension/pdf/`.

## Development

No build step: `extension/` is the unpacked extension. Load it from `chrome://extensions` (Developer mode → Load unpacked) and reload the card after edits.

```bash
npm test        # unit tests (Node 22, no dependencies)
./pack.sh       # dist/inkmark.zip for the Chrome Web Store
```

| Path | What |
| --- | --- |
| `extension/background.js` | Service worker: storage, exports, AI and Firecrawl calls, context menus |
| `extension/content/` | Highlighter injected into pages: selection toolbar, sidebar, marks |
| `extension/lib/` | Shared code: store (IndexedDB), text anchoring, Markdown/Notion/Obsidian export, AI providers |
| `extension/pdf/` | PDF viewer (pdf.js) |
| `extension/doc/` | Document reader (anydoc → Markdown → page) |
| `extension/vendor/` | anydoc (WebAssembly) and marked, with their licenses |
| `demo/` | The highlighter on a sample article without installing |
| `intro/` | Remotion project for the promo video |
| `tests/` | Node unit tests |
