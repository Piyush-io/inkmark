importScripts(
  "lib/util.js",
  "lib/store.js",
  "lib/markdown.js",
  "lib/notion.js",
  "lib/obsidian.js",
  "lib/ai.js"
);

const Inkmark = self.Inkmark;

// Office, e-book and spreadsheet files anydoc converts (PDFs keep their own viewer).
const DOC_EXTS = ["docx", "doc", "docm", "odt", "rtf", "epub", "pptx", "ppt", "odp", "xlsx", "xls", "ods", "csv"];

const FULL_FILES = [
  "lib/util.js",
  "lib/ai.js",
  "lib/locator.js",
  "lib/dom-highlight.js",
  "lib/client.js",
  "content/ui.js",
  "content/content.js"
];

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "inkmark-highlight",
      title: "Highlight with Inkmark",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: "inkmark-bookmark",
      title: "Save page to Inkmark",
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: "inkmark-ai",
      title: "Highlight key ideas with AI",
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: "inkmark-doc",
      title: "Open document in Inkmark",
      contexts: ["link"],
      targetUrlPatterns: DOC_EXTS.map((ext) => "*://*/*." + ext + "*")
    });
    chrome.contextMenus.create({
      id: "inkmark-pdf",
      title: "Open PDF in Inkmark",
      contexts: ["page", "link"]
    });
  });
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome/welcome.html") });
  }
  Inkmark.store.rebuildIndex();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || tab.id == null) return;
  if (info.menuItemId === "inkmark-highlight") {
    await ensureContent(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: "HIGHLIGHT_SELECTION" });
  } else if (info.menuItemId === "inkmark-bookmark") {
    await ensureContent(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: "BOOKMARK_PAGE" });
  } else if (info.menuItemId === "inkmark-ai") {
    await ensureContent(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: "AI_HIGHLIGHT_PAGE" });
  } else if (info.menuItemId === "inkmark-doc") {
    if (info.linkUrl) openDocViewer(tab.id, info.linkUrl);
  } else if (info.menuItemId === "inkmark-pdf") {
    const url = info.linkUrl || tab.url;
    if (url) openPdfViewer(tab.id, url);
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab || tab.id == null) return;
  await ensureContent(tab.id);
  if (command === "highlight-selection") {
    chrome.tabs.sendMessage(tab.id, { type: "HIGHLIGHT_SELECTION" });
  } else if (command === "toggle-sidebar") {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SIDEBAR" });
  } else if (command === "ai-highlight") {
    chrome.tabs.sendMessage(tab.id, { type: "AI_HIGHLIGHT_PAGE" });
  }
});

async function maybeAutoOpenPdf(tabId, url) {
  if (!url || url.includes("#noinkmark") || !/^(https?|file):/.test(url)) return false;
  if (url.startsWith("file:") && !(await chrome.extension.isAllowedFileSchemeAccess())) return false;
  const s = await Inkmark.settings.get();
  if (s.autoOpenPdf === false) return false;
  openPdfViewer(tabId, url);
  return true;
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "loading" && info.url && Inkmark.isPdfUrl(info.url)) {
    maybeAutoOpenPdf(tabId, info.url);
    return;
  }
  if (info.status !== "complete" || !tab.url) return;
  if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
    chrome.action.setBadgeText({ tabId, text: "" });
    return;
  }
  if (Inkmark.isPdfUrl(tab.url)) {
    chrome.action.setBadgeText({ tabId, text: "PDF" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#1E1D1A" });
  } else {
    chrome.action.setBadgeText({ tabId, text: "" });
  }
});

async function injectFull(tabId) {
  await chrome.scripting.insertCSS({ target: { tabId }, files: ["content/marks.css"] });
  await chrome.scripting.executeScript({ target: { tabId }, files: FULL_FILES });
}

async function ensureContent(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: "PING" });
    if (res && res.full) return true;
  } catch (_) {}
  try {
    await injectFull(tabId);
    return true;
  } catch (err) {
    console.warn("Inkmark inject failed", err);
    return false;
  }
}

function openPdfViewer(tabId, fileUrl) {
  const viewer = chrome.runtime.getURL("pdf/viewer.html") + "?file=" + encodeURIComponent(fileUrl);
  chrome.tabs.update(tabId, { url: viewer });
}

function openDocViewer(tabId, fileUrl) {
  const viewer = chrome.runtime.getURL("doc/viewer.html") + "?file=" + encodeURIComponent(fileUrl);
  chrome.tabs.update(tabId, { url: viewer });
}

// Page text comes from the tab. Firecrawl replaces it when asked to (always), or when the tab had
// too little readable text (fallback), e.g. an app shell that renders late.
async function aiHighlight(msg) {
  const settings = await Inkmark.settings.get();
  let text = msg.text || "";
  let source = "page";
  const fcKey = (settings.firecrawlKey || "").trim();
  const mode = settings.firecrawlMode || "off";
  const canCrawl = fcKey && msg.kind === "web" && /^https?:/.test(msg.url || "");
  if (canCrawl && (mode === "always" || (mode === "fallback" && text.length < 1500))) {
    try {
      const scraped = await Inkmark.firecrawlScrape(msg.url, fcKey);
      const clean = Inkmark.markdownToText(scraped.markdown);
      if (clean.length > 200) {
        text = clean;
        source = "firecrawl";
      }
    } catch (err) {
      if (text.length < 200) throw err;
    }
  }
  const out = await Inkmark.aiPickHighlights(settings, { title: msg.title, url: msg.url }, text);
  return Object.assign(out, { source });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true;
});

async function handle(msg, sender) {
  switch (msg.type) {
    case "PING":
      return { pong: true };
    case "INJECT_FULL": {
      const tabId = msg.tabId || (sender.tab && sender.tab.id);
      if (tabId == null) throw new Error("No tab");
      await injectFull(tabId);
      return true;
    }
    case "GET_PAGE":
      return Inkmark.store.getByUrl(msg.url);
    case "LIST_PAGES":
      return Inkmark.store.list();
    case "GET_PAGE_BY_ID":
      return Inkmark.store.get(msg.pageId);
    case "ADD_HIGHLIGHT":
      return Inkmark.store.addHighlight(msg.url, msg.meta || {}, msg.highlight);
    case "ADD_HIGHLIGHTS":
      return Inkmark.store.addHighlights(msg.url, msg.meta || {}, msg.highlights || [], msg.pagePatch);
    case "DELETE_HIGHLIGHTS":
      return Inkmark.store.deleteHighlights(msg.pageId, msg.ids || []);
    case "AI_HIGHLIGHT":
      return aiHighlight(msg);
    case "AI_TEST":
      return Inkmark.aiTest(Object.assign(await Inkmark.settings.get(), msg.patch || {}));
    case "AI_AUTO": {
      const tabId = sender.tab && sender.tab.id;
      if (tabId == null) return false;
      const settings = await Inkmark.settings.get();
      if (!settings.aiAuto || !Inkmark.aiReady(settings)) return false;
      if (!(await ensureContent(tabId))) return false;
      chrome.tabs.sendMessage(tabId, { type: "AI_HIGHLIGHT_PAGE", auto: true });
      return true;
    }
    case "OPEN_DOC": {
      const tabId = sender.tab && sender.tab.id;
      if (tabId == null) throw new Error("No tab");
      openDocViewer(tabId, msg.url);
      return true;
    }
    case "UPDATE_HIGHLIGHT":
      return Inkmark.store.updateHighlight(msg.pageId, msg.highlightId, msg.patch || {});
    case "DELETE_HIGHLIGHT":
      return Inkmark.store.deleteHighlight(msg.pageId, msg.highlightId);
    case "UPDATE_PAGE":
      return Inkmark.store.updatePage(msg.pageId, msg.patch || {});
    case "DELETE_PAGE":
      return Inkmark.store.deletePage(msg.pageId);
    case "BOOKMARK_PAGE":
      return Inkmark.store.ensurePage(msg.meta || { url: msg.url });
    case "GET_SETTINGS":
      return Inkmark.settings.get();
    case "SET_SETTINGS":
      return Inkmark.settings.set(msg.patch || {});
    case "NOTION_REDIRECT_URL":
      return { url: chrome.identity.getRedirectURL("notion").replace(/\/$/, "") };
    case "NOTION_OAUTH":
      return notionOAuth();
    case "NOTION_SEARCH": {
      const settings = await Inkmark.settings.get();
      if (!settings.notionToken) throw new Error("Connect Notion first.");
      return Inkmark.notionSearchParents(settings.notionToken);
    }
    case "NOTION_DISCONNECT":
      return Inkmark.settings.set({
        notionToken: "",
        notionWorkspace: "",
        notionBotId: "",
        notionParentId: "",
        notionParentTitle: ""
      });
    case "OBSIDIAN_PROBE":
      return Inkmark.obsidianProbe();
    case "OBSIDIAN_TEST": {
      const settings = await Inkmark.settings.get();
      const port = Number(msg.port || settings.obsidianRestPort || 27123);
      const key = (msg.key || settings.obsidianRestKey || "").trim();
      if (!key) throw new Error("Paste the Local REST API key from Obsidian.");
      await Inkmark.obsidianTestKey(port, key, port === 27124);
      return Inkmark.settings.set({
        obsidianRestKey: key,
        obsidianRestPort: port,
        obsidianRestOk: true
      });
    }
    case "EXPORT_OBSIDIAN": {
      const page = await Inkmark.store.get(msg.pageId);
      if (!page) throw new Error("Page not found");
      const settings = await Inkmark.settings.get();
      const markdown = Inkmark.pageToMarkdown(page);
      const filename = Inkmark.filenameForPage(page);
      const result = await Inkmark.obsidianWrite(settings, filename, markdown);
      return Object.assign({ markdown, filename }, result);
    }
    case "EXPORT_OBSIDIAN_ALL": {
      const settings = await Inkmark.settings.get();
      const pages = await Inkmark.store.list();
      const results = [];
      for (const page of pages) {
        try {
          const written = await Inkmark.obsidianWrite(
            settings,
            Inkmark.filenameForPage(page),
            Inkmark.pageToMarkdown(page)
          );
          results.push({ id: page.id, ok: true, path: written.path });
        } catch (err) {
          results.push({ id: page.id, ok: false, error: err.message });
        }
      }
      return results;
    }
    case "EXPORT_NOTION": {
      const page = await Inkmark.store.get(msg.pageId);
      if (!page) throw new Error("Page not found");
      const settings = await Inkmark.settings.get();
      const result = await Inkmark.exportPageToNotion(page, settings);
      await Inkmark.store.updatePage(page.id, { notionUrl: result.url, notionPageId: result.id });
      return result;
    }
    case "EXPORT_NOTION_ALL": {
      const settings = await Inkmark.settings.get();
      const pages = await Inkmark.store.list();
      const results = [];
      for (const page of pages) {
        try {
          const result = await Inkmark.exportPageToNotion(page, settings);
          await Inkmark.store.updatePage(page.id, { notionUrl: result.url, notionPageId: result.id });
          results.push({ id: page.id, ok: true, url: result.url });
        } catch (err) {
          results.push({ id: page.id, ok: false, error: err.message });
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      return results;
    }
    case "EXPORT_JSON":
      return Inkmark.store.list();
    case "IMPORT_JSON":
      return Inkmark.store.importAll(msg.pages || []);
    case "PDF_DOCUMENT": {
      const tabId = sender.tab && sender.tab.id;
      if (tabId == null) return false;
      return maybeAutoOpenPdf(tabId, msg.url);
    }
    case "OPEN_PDF": {
      const tabId = sender.tab && sender.tab.id;
      if (tabId == null) throw new Error("No tab");
      openPdfViewer(tabId, msg.url);
      return true;
    }
    case "OPEN_LIBRARY":
      await chrome.tabs.create({ url: chrome.runtime.getURL("library/library.html") });
      return true;
    case "OPEN_SETTINGS":
      await chrome.tabs.create({ url: chrome.runtime.getURL("settings/settings.html") });
      return true;
    case "MARKDOWN_FOR_PAGE": {
      const page = await Inkmark.store.get(msg.pageId);
      if (!page) throw new Error("Page not found");
      return { markdown: Inkmark.pageToMarkdown(page), filename: Inkmark.filenameForPage(page) };
    }
    case "MARKDOWN_ALL": {
      const pages = await Inkmark.store.list();
      return { markdown: Inkmark.pagesToMarkdown(pages), filename: "inkmark-export.md" };
    }
    default:
      throw new Error("Unknown message " + msg.type);
  }
}

async function notionOAuth() {
  const settings = await Inkmark.settings.get();
  const clientId = (settings.notionClientId || "").trim();
  const clientSecret = (settings.notionClientSecret || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error("Save the Notion OAuth client ID and secret once, then click Connect.");
  }
  const redirectUri = chrome.identity.getRedirectURL("notion").replace(/\/$/, "");
  const state = Inkmark.uid();
  const authUrl = Inkmark.notionAuthorizeUrl(clientId, redirectUri, state);
  const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  if (!responseUrl) throw new Error("Notion sign-in was cancelled.");
  const ret = new URL(responseUrl);
  if (ret.searchParams.get("error")) {
    throw new Error(ret.searchParams.get("error_description") || ret.searchParams.get("error"));
  }
  if (ret.searchParams.get("state") !== state) throw new Error("Notion login state mismatch.");
  const code = ret.searchParams.get("code");
  if (!code) throw new Error("Notion did not return an authorization code.");
  const token = await Inkmark.notionExchangeCode(clientId, clientSecret, redirectUri, code);
  const access = token.access_token;
  const parents = await Inkmark.notionSearchParents(access);
  const picked = Inkmark.pickDefaultParent(parents);
  return Inkmark.settings.set({
    notionToken: access,
    notionWorkspace: token.workspace_name || "",
    notionBotId: token.bot_id || "",
    notionParentId: picked ? picked.id : "",
    notionParentType: picked ? picked.type : "page",
    notionParentTitle: picked ? picked.title : ""
  });
}
