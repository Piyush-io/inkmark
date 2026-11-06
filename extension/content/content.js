(function () {
  const Inkmark = globalThis.Inkmark;
  if (window.__inkmarkLoaded) return;
  window.__inkmarkLoaded = true;
  if (location.protocol === "chrome:") return;
  if (location.protocol === "chrome-extension:" && !location.pathname.endsWith("viewer.html")) return;

  let page = null;
  let ui = null;
  let activeId = null;
  let settings = { defaultColor: "yellow" };
  let lastUrl = location.href;

  function pageUrl() {
    return document.documentElement.getAttribute("data-inkmark-url") || location.href;
  }

  function meta() {
    return Object.assign(
      {
        url: pageUrl(),
        title: Inkmark.pageTitle(document),
        kind: document.documentElement.getAttribute("data-inkmark-kind") || (Inkmark.isPdfUrl(pageUrl()) ? "pdf" : "web")
      },
      Inkmark.pageReference(document)
    );
  }

  function markEl(id) {
    return document.querySelector('mark[data-inkmark-id="' + id + '"]');
  }

  async function ensurePage() {
    if (!page) page = await Inkmark.client.bookmark({ meta: meta() });
    return page;
  }

  async function markdownForPage() {
    await ensurePage();
    return Inkmark.client.send({ type: "MARKDOWN_FOR_PAGE", pageId: page.id });
  }

  function ensureUi() {
    if (!ui) ui = Inkmark.mountUi(document, api);
    return ui;
  }

  function applyMarks() {
    if (page && page.highlights) {
      Inkmark.applyHighlights(page.highlights, document.body);
      labelAiMarks(page.highlights);
    }
  }

  // Hovering an AI highlight shows why it was picked.
  function labelAiMarks(list) {
    list.forEach(function (h) {
      if (!h.ai) return;
      const cat = Inkmark.AI_CATEGORIES[h.ai.category];
      const title = (cat ? cat.label : "AI") + (h.note ? " · " + h.note : "");
      document.querySelectorAll('mark[data-inkmark-id="' + h.id + '"]').forEach(function (m) {
        m.setAttribute("data-inkmark-ai", h.ai.category || "key");
        m.title = title;
      });
    });
  }

  // The element that holds the article, so menus and footers don't reach the model.
  function readingRoot() {
    const textLen = function (el) { return (el.innerText || "").length; };
    const candidates = Array.from(document.querySelectorAll("article, main, [role=main], #content, .post, .entry-content"));
    let best = null;
    let bestLen = 0;
    candidates.forEach(function (el) {
      const n = textLen(el);
      if (n > bestLen) {
        best = el;
        bestLen = n;
      }
    });
    return best && bestLen > 1200 ? best : document.body;
  }

  async function pageText() {
    if (typeof window.__inkmarkDocText === "function") return window.__inkmarkDocText();
    return Inkmark.buildTextIndex(readingRoot()).collapsed;
  }

  function overlapsMark(range) {
    const anc = range.commonAncestorContainer;
    const el = anc.nodeType === 1 ? anc : anc.parentElement;
    if (el && el.closest && el.closest("mark[data-inkmark-id]")) return true;
    return !!range.cloneContents().querySelector("mark[data-inkmark-id]");
  }

  function sweepIn(ids) {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ids.forEach(function (id, i) {
      document.querySelectorAll('mark[data-inkmark-id="' + id + '"]').forEach(function (m) {
        m.style.setProperty("--inkmark-sweep", Inkmark.colorOf(m.getAttribute("data-inkmark-color")).bg);
        m.style.animationDelay = Math.min(i * 70, 1400) + "ms";
        m.classList.add("inkmark-sweep");
        m.addEventListener("animationend", function () {
          m.classList.remove("inkmark-sweep");
          m.style.animationDelay = "";
        }, { once: true });
      });
    });
  }

  let aiRunning = false;

  async function aiHighlight(opts) {
    opts = opts || {};
    if (aiRunning) return;
    const s = await Inkmark.client.getSettings();
    if (!Inkmark.aiReady(s)) {
      if (opts.auto) return;
      ensureUi().toast("Connect an AI provider first", { label: "Settings", run: function () { Inkmark.client.send({ type: "OPEN_SETTINGS" }); } });
      return;
    }
    if (opts.auto) {
      const existing = await Inkmark.client.getPage(pageUrl());
      if (existing && (existing.aiAt || existing.aiCleared)) return;
    }
    aiRunning = true;
    ensureUi().setAiBusy(true, "Reading the page…");
    try {
      const m = meta();
      const text = await pageText();
      ui.setAiBusy(true, "Asking " + (Inkmark.aiConfig(s).model || "the model") + "…");
      const out = await Inkmark.client.send({ type: "AI_HIGHLIGHT", url: m.url, title: m.title, kind: m.kind, text: text });
      const index = Inkmark.buildTextIndex(document.body);
      const docSkeleton = m.kind === "pdf" ? Inkmark.textSkeleton(text) : null;
      const existingText = new Set(((page && page.highlights) || []).map(function (h) { return (h.text || "").toLowerCase(); }));
      const fresh = [];
      const jobs = [];
      let missed = 0;
      out.items.forEach(function (item) {
        if (existingText.has(item.quote.toLowerCase())) return;
        const cat = Inkmark.AI_CATEGORIES[item.category] || Inkmark.AI_CATEGORIES.key;
        const h = {
          id: Inkmark.uid(),
          text: item.quote,
          color: cat.color,
          note: item.reason,
          tags: ["ai", cat.label.toLowerCase()],
          selector: { exact: item.quote, prefix: "", suffix: "" },
          createdAt: Inkmark.now(),
          ai: { category: item.category, model: out.model, provider: out.provider, source: out.source }
        };
        const range = Inkmark.findRange(h.selector, document.body, index);
        if (range && !overlapsMark(range)) {
          h.selector = Inkmark.serializeRange(range) || h.selector;
          h.text = range.toString().replace(/\s+/g, " ").trim() || h.text;
          jobs.push({ h: h, range: range });
          fresh.push(h);
        } else if (!range && docSkeleton && (text.includes(item.quote) || Inkmark.fuzzyFind(text, item.quote, docSkeleton))) {
          // A PDF page that isn't on screen yet: the mark appears when the page paints.
          fresh.push(h);
        } else if (!range) {
          missed += 1;
        }
      });
      jobs.sort(function (a, b) { return a.range.compareBoundaryPoints(Range.START_TO_START, b.range); });
      for (let i = jobs.length - 1; i >= 0; i--) Inkmark.wrapRange(jobs[i].range, jobs[i].h.id, jobs[i].h.color);
      // Keep the batch in reading order so the sidebar and export follow the text.
      fresh.forEach(function (h, i) { h.createdAt = Inkmark.now() + i; });
      page = await Inkmark.client.send({
        type: "ADD_HIGHLIGHTS",
        url: pageUrl(),
        meta: m,
        highlights: fresh,
        pagePatch: { aiAt: Inkmark.now(), aiModel: out.model }
      });
      labelAiMarks(fresh);
      sweepIn(jobs.map(function (j) { return j.h.id; }));
      ui.toggleSidebar(true);
      ui.render(page);
      const bits = [fresh.length + (fresh.length === 1 ? " passage" : " passages") + " highlighted"];
      if (out.source === "firecrawl") bits.push("via Firecrawl");
      if (out.analyzedChars < out.totalChars) bits.push("first " + Math.round((out.analyzedChars / out.totalChars) * 100) + "% of the text read");
      if (missed) bits.push(missed + " not found on the page");
      ui.setAiBusy(false, bits.join(" · "));
      const ids = fresh.map(function (h) { return h.id; });
      if (ids.length) ui.toast(bits[0], { label: "Undo", run: function () { clearHighlights(ids); } });
      else ui.toast("Nothing new to highlight");
    } catch (err) {
      ensureUi().setAiBusy(false, err.message || String(err));
      ui.toast(err.message || String(err));
    } finally {
      aiRunning = false;
    }
  }

  async function clearHighlights(ids) {
    if (!page || !ids.length) return;
    ids.forEach(function (id) { Inkmark.unwrapHighlight(id, document.body); });
    page = await Inkmark.client.send({ type: "DELETE_HIGHLIGHTS", pageId: page.id, ids: ids });
    if (ui) {
      ui.hidePopover();
      ui.render(page);
    }
  }

  async function refresh() {
    page = await Inkmark.client.getPage(pageUrl());
    applyMarks();
    if (ui) ui.render(page);
  }

  function defaultColor() {
    return settings.defaultColor || "yellow";
  }

  async function highlightWith(color, openNote) {
    const range = Inkmark.selectionRange(window);
    ensureUi().hideToolbar();
    if (!range) {
      ui.toast("Select text first");
      return;
    }
    const selector = Inkmark.serializeRange(range);
    const text = range.toString().replace(/\s+/g, " ").trim();
    const highlight = {
      id: Inkmark.uid(),
      text: text,
      color: color,
      note: "",
      tags: [],
      selector: selector,
      createdAt: Inkmark.now()
    };
    Inkmark.wrapRange(range, highlight.id, color);
    window.getSelection().removeAllRanges();
    try {
      const result = await Inkmark.client.addHighlight(pageUrl(), meta(), highlight);
      page = result.page;
    } catch (err) {
      Inkmark.unwrapHighlight(highlight.id, document.body);
      ui.toast(err.message);
      return;
    }
    ui.render(page);
    if (openNote) {
      activeId = highlight.id;
      ui.showPopover(highlight, markEl(highlight.id));
      ui.focusNote();
    } else {
      ui.toast("Highlighted", { label: "Undo", run: () => removeHighlight(highlight.id, false) });
    }
  }

  async function removeHighlight(id, offerUndo) {
    if (!page) return;
    const removed = findHighlight(id);
    Inkmark.unwrapHighlight(id, document.body);
    if (activeId === id) {
      activeId = null;
      ui.hidePopover();
    }
    page = await Inkmark.client.deleteHighlight({ pageId: page.id, highlightId: id });
    ui.render(page);
    if (offerUndo && removed) {
      ui.toast("Highlight removed", {
        label: "Undo",
        run: async () => {
          const result = await Inkmark.client.addHighlight(pageUrl(), meta(), removed);
          page = result.page;
          Inkmark.applyHighlight(removed, document.body);
          ui.render(page);
        }
      });
    }
  }

  function findHighlight(id) {
    return page && (page.highlights || []).find(function (h) { return h.id === id; });
  }

  const api = {
    defaultColor: defaultColor,
    aiHighlight: function () { return aiHighlight(); },
    clearAi: async function () {
      const ids = ((page && page.highlights) || []).filter(function (h) { return h.ai; }).map(function (h) { return h.id; });
      await clearHighlights(ids);
      if (page) page = await Inkmark.client.updatePage({ pageId: page.id, patch: { aiAt: 0, aiCleared: true } });
      if (ui) {
        ui.render(page);
        ui.setAiBusy(false, ids.length ? "Removed " + ids.length + " AI highlights" : "");
      }
    },
    highlightWith: highlightWith,
    recolorActive: async function (color) {
      if (!page || !activeId) return;
      Inkmark.recolorHighlight(activeId, color, document.body);
      const result = await Inkmark.client.updateHighlight({ pageId: page.id, highlightId: activeId, patch: { color: color } });
      page = result.page;
      ui.render(page);
    },
    saveActive: async function (patch) {
      if (!page || !activeId) return;
      const result = await Inkmark.client.updateHighlight({ pageId: page.id, highlightId: activeId, patch: patch });
      page = result.page;
      ui.render(page);
    },
    deleteActive: function () {
      if (activeId) return removeHighlight(activeId, true);
    },
    deleteHighlight: function (id) {
      return removeHighlight(id, true);
    },
    savePageNote: async function (text) {
      await ensurePage();
      page = await Inkmark.client.updatePage({ pageId: page.id, patch: { pageNote: text } });
      ui.render(page);
    },
    focusHighlight: function (id) {
      Inkmark.scrollToHighlight(id, document.body);
      activeId = id;
      const hl = findHighlight(id);
      if (hl) ensureUi().showPopover(hl, markEl(id));
    },
    copyMarkdown: async function () {
      const out = await markdownForPage();
      await ui.copy(out.markdown, "Markdown copied with source reference");
    },
    downloadMarkdown: async function () {
      const out = await markdownForPage();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([out.markdown], { type: "text/markdown" }));
      a.download = out.filename;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      ui.toast("Downloaded " + out.filename);
    },
    openObsidian: async function () {
      await ensurePage();
      try {
        const result = await Inkmark.client.exportObsidian(page.id);
        ensureUi().toast("Saved to vault · " + result.path);
        return;
      } catch (_) {}
      const out = await markdownForPage();
      settings = await Inkmark.client.getSettings().catch(function () { return settings; });
      const params = new URLSearchParams();
      if (settings.obsidianVault) params.set("vault", settings.obsidianVault);
      params.set("file", (settings.obsidianFolder || "Inkmark") + "/" + (page.title || "Untitled"));
      params.set("content", out.markdown.length < 12000 ? out.markdown : out.markdown.slice(0, 12000));
      const a = document.createElement("a");
      a.href = "obsidian://new?" + params.toString();
      a.click();
      await navigator.clipboard.writeText(out.markdown).catch(function () {});
      ensureUi().toast("Copied. Opening Obsidian");
    },
    exportNotion: async function () {
      try {
        await ensurePage();
        ensureUi().setStatus("Sending to Notion…");
        const result = await Inkmark.client.exportNotion(page.id);
        page = await Inkmark.client.getPage(pageUrl());
        ui.render(page);
        ui.toast("Exported to Notion");
        ui.setStatus("Exported to Notion", result && result.url);
      } catch (err) {
        ensureUi().toast(err.message);
        ui.setStatus(err.message);
      }
    }
  };

  let pointerDown = false;
  let selTimer = 0;

  function fromOurUi(e) {
    return e.target && e.target.closest && e.target.closest("inkmark-host");
  }

  function syncToolbar() {
    const range = Inkmark.selectionRange(window);
    if (!range) {
      if (ui) ui.hideToolbar();
      return;
    }
    ensureUi().showToolbar(range);
  }

  function onMouseDown(e) {
    if (e.button !== 0 || fromOurUi(e)) return;
    pointerDown = true;
    // A new drag starts: the old toolbar would point at a selection that is about to change.
    if (ui) ui.hideToolbar();
  }

  function onMouseUp(e) {
    pointerDown = false;
    if (e.type !== "inkmark-selection" && e.button !== 0) return;
    if (fromOurUi(e)) return;
    // Read the selection after the browser has finished with this click: a click inside an existing
    // selection collapses it only after mouseup (WebKit and Chrome), and double/triple-click
    // selections can settle a moment later in WebKit.
    clearTimeout(selTimer);
    selTimer = setTimeout(syncToolbar, 0);
  }

  // Keeps an open toolbar on the current selection (Shift+arrow extends, clicks collapse,
  // the page edits or removes the selected text) and shows it for keyboard selections.
  function onSelectionChange() {
    if (pointerDown) return;
    if (!ui || !ui.isToolbarOpen()) return;
    clearTimeout(selTimer);
    selTimer = setTimeout(syncToolbar, 30);
  }

  function onKeyUp(e) {
    if (!e.shiftKey && e.key !== "Shift") return;
    if (fromOurUi(e) || pointerDown) return;
    clearTimeout(selTimer);
    selTimer = setTimeout(syncToolbar, 0);
  }

  function onClick(e) {
    const mark = e.target.closest && e.target.closest("mark[data-inkmark-id]");
    if (!mark) return;
    e.preventDefault();
    e.stopPropagation();
    api.focusHighlight(mark.getAttribute("data-inkmark-id"));
  }

  function onUrlChange() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    refresh();
  }

  function hookHistory() {
    const wrap = function (name) {
      const orig = history[name];
      history[name] = function () {
        const ret = orig.apply(this, arguments);
        onUrlChange();
        return ret;
      };
    };
    wrap("pushState");
    wrap("replaceState");
    window.addEventListener("popstate", onUrlChange);
  }

  async function boot() {
    document.addEventListener("mousedown", onMouseDown, { capture: true, passive: true });
    document.addEventListener("mouseup", onMouseUp, { capture: true, passive: true });
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("click", onClick, true);
    hookHistory();
    if (globalThis.chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get("inkmarkSettings", function (d) {
        const s = d.inkmarkSettings;
        if (s && s.defaultColor) settings.defaultColor = s.defaultColor;
      });
    }
    await refresh();
    if (page && ((page.highlights && page.highlights.length) || page.pageNote)) ensureUi().render(page);
  }

  if (globalThis.chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg, _s, sendResponse) {
      if (msg.type === "PING") {
        sendResponse({ ok: true, full: true });
        return;
      }
      if (msg.type === "HIGHLIGHT_SELECTION") highlightWith(defaultColor());
      if (msg.type === "TOGGLE_SIDEBAR") ensureUi().toggleSidebar();
      if (msg.type === "BOOKMARK_PAGE") {
        Inkmark.client.bookmark({ meta: meta() }).then(function (p) {
          page = p;
          ensureUi().toggleSidebar(true);
          ui.render(page);
          ui.toast("Page saved");
        });
      }
      if (msg.type === "REFRESH") refresh();
      if (msg.type === "AI_HIGHLIGHT_PAGE") aiHighlight({ auto: !!msg.auto });
      sendResponse({ ok: true });
    });
  }
  window.addEventListener("inkmark-pdf-ready", applyMarks);
  window.addEventListener("inkmark-pdf-page", applyMarks);
  window.addEventListener("inkmark-selection", onMouseUp);
  // The document viewer renders after boot and may switch files; reload this page's record then.
  window.addEventListener("inkmark-doc-ready", refresh);
  // Header buttons in Inkmark's own viewers.
  window.addEventListener("inkmark-ai", function () { aiHighlight(); });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
