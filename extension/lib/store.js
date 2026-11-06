(function (g) {
  const Inkmark = (g.Inkmark = g.Inkmark || {});
  const DB_NAME = "inkmark";
  const DB_VERSION = 1;

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("pages")) {
          const pages = db.createObjectStore("pages", { keyPath: "id" });
          pages.createIndex("byUrl", "canonicalUrl", { unique: true });
          pages.createIndex("byUpdated", "updatedAt");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function emptyPage(input) {
    const now = Inkmark.now();
    return {
      id: input.id || Inkmark.uid(),
      url: input.url,
      canonicalUrl: Inkmark.canonicalUrl(input.url),
      title: input.title || "Untitled",
      kind: input.kind || (Inkmark.isPdfUrl(input.url) ? "pdf" : "web"),
      site: input.site || "",
      author: input.author || "",
      published: input.published || "",
      tags: input.tags || [],
      pageNote: input.pageNote || "",
      highlights: input.highlights || [],
      createdAt: input.createdAt || now,
      updatedAt: now,
      notionUrl: input.notionUrl || "",
      notionPageId: input.notionPageId || ""
    };
  }

  function storageLocal() {
    return g.chrome && chrome.storage && chrome.storage.local;
  }

  function indexPayload(pages) {
    const idx = {};
    let highlights = 0;
    for (let i = 0; i < pages.length; i++) {
      const n = (pages[i].highlights && pages[i].highlights.length) || 0;
      if (n) idx[pages[i].canonicalUrl] = n;
      highlights += n;
    }
    return { inkmarkIndex: idx, inkmarkStats: { pages: pages.length, highlights: highlights } };
  }

  function syncIndex() {
    if (!storageLocal()) return Promise.resolve();
    return Inkmark.store.list().then(function (pages) {
      return chrome.storage.local.set(indexPayload(pages));
    });
  }

  function countOf(page) {
    return (page && page.highlights && page.highlights.length) || 0;
  }

  // Updates the URL index and stats for one changed page instead of re-reading the whole library.
  // Updates are chained so concurrent writes can't overwrite each other's read-modify-write.
  let indexChain = Promise.resolve();
  function applyIndexDelta(before, after) {
    if (!storageLocal()) return indexChain;
    if (before && after && before.canonicalUrl === after.canonicalUrl && countOf(before) === countOf(after)) return indexChain;
    indexChain = indexChain
      .then(async function () {
        const d = await chrome.storage.local.get(["inkmarkIndex", "inkmarkStats"]);
        if (!d.inkmarkIndex || !d.inkmarkStats) return syncIndex();
        const idx = d.inkmarkIndex;
        const stats = d.inkmarkStats;
        if (before) {
          delete idx[before.canonicalUrl];
          stats.pages -= 1;
          stats.highlights -= countOf(before);
        }
        if (after) {
          if (countOf(after)) idx[after.canonicalUrl] = countOf(after);
          stats.pages += 1;
          stats.highlights += countOf(after);
        }
        stats.pages = Math.max(0, stats.pages);
        stats.highlights = Math.max(0, stats.highlights);
        await chrome.storage.local.set({ inkmarkIndex: idx, inkmarkStats: stats });
      })
      .catch(function (err) {
        console.warn("Inkmark index", err);
      });
    return indexChain;
  }

  // Runs `write(store)` after reading the record it replaces, all in one transaction.
  async function writeWithPrevious(id, write) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction("pages", "readwrite");
      const store = t.objectStore("pages");
      let before = null;
      const req = store.get(id);
      req.onsuccess = () => {
        before = req.result || null;
        write(store);
      };
      t.oncomplete = () => resolve(before);
      t.onerror = () => reject(t.error);
    });
  }

  Inkmark.store = {
    async getByUrl(url) {
      const canonical = Inkmark.canonicalUrl(url);
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const t = db.transaction("pages", "readonly");
        const idx = t.objectStore("pages").index("byUrl");
        const req = idx.get(canonical);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    },

    async get(id) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const t = db.transaction("pages", "readonly");
        const req = t.objectStore("pages").get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    },

    async list() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const t = db.transaction("pages", "readonly");
        const req = t.objectStore("pages").getAll();
        req.onsuccess = () => {
          const rows = req.result || [];
          rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          resolve(rows);
        };
        req.onerror = () => reject(req.error);
      });
    },

    async put(page) {
      page.updatedAt = Inkmark.now();
      page.canonicalUrl = Inkmark.canonicalUrl(page.url);
      const before = await writeWithPrevious(page.id, (store) => store.put(page));
      applyIndexDelta(before, page);
      return page;
    },

    async ensurePage(meta) {
      const existing = await Inkmark.store.getByUrl(meta.url);
      if (existing) {
        let dirty = false;
        ["title", "site", "author", "published"].forEach((k) => {
          if (meta[k] && meta[k] !== existing[k]) {
            existing[k] = meta[k];
            dirty = true;
          }
        });
        if (dirty) await Inkmark.store.put(existing);
        return existing;
      }
      const page = emptyPage(meta);
      await Inkmark.store.put(page);
      return page;
    },

    async addHighlight(url, meta, highlight) {
      if (!highlight || typeof highlight !== "object") throw new Error("Missing highlight");
      const page = await Inkmark.store.ensurePage(Object.assign({ url }, meta || {}));
      highlight.id = highlight.id || Inkmark.uid();
      highlight.createdAt = highlight.createdAt || Inkmark.now();
      highlight.color = highlight.color || "yellow";
      highlight.note = highlight.note || "";
      highlight.tags = highlight.tags || [];
      page.highlights = page.highlights || [];
      page.highlights.push(highlight);
      await Inkmark.store.put(page);
      return { page, highlight };
    },

    // One write for a batch (AI highlighting adds a dozen at once).
    async addHighlights(url, meta, highlights, pagePatch) {
      const page = await Inkmark.store.ensurePage(Object.assign({ url }, meta || {}));
      page.highlights = page.highlights || [];
      (highlights || []).forEach((h) => {
        h.id = h.id || Inkmark.uid();
        h.createdAt = h.createdAt || Inkmark.now();
        h.color = h.color || "yellow";
        h.note = h.note || "";
        h.tags = h.tags || [];
        page.highlights.push(h);
      });
      Object.assign(page, pagePatch || {});
      await Inkmark.store.put(page);
      return page;
    },

    async deleteHighlights(pageId, ids) {
      const page = await Inkmark.store.get(pageId);
      if (!page) return null;
      const drop = new Set(ids || []);
      page.highlights = (page.highlights || []).filter((h) => !drop.has(h.id));
      await Inkmark.store.put(page);
      return page;
    },

    async updateHighlight(pageId, highlightId, patch) {
      const page = await Inkmark.store.get(pageId);
      if (!page) throw new Error("Page not found");
      const hl = (page.highlights || []).find((h) => h.id === highlightId);
      if (!hl) throw new Error("Highlight not found");
      Object.assign(hl, patch);
      await Inkmark.store.put(page);
      return { page, highlight: hl };
    },

    async deleteHighlight(pageId, highlightId) {
      const page = await Inkmark.store.get(pageId);
      if (!page) return null;
      page.highlights = (page.highlights || []).filter((h) => h.id !== highlightId);
      await Inkmark.store.put(page);
      return page;
    },

    async updatePage(pageId, patch) {
      const page = await Inkmark.store.get(pageId);
      if (!page) throw new Error("Page not found");
      Object.assign(page, patch);
      await Inkmark.store.put(page);
      return page;
    },

    async deletePage(pageId) {
      const before = await writeWithPrevious(pageId, (store) => store.delete(pageId));
      if (before) applyIndexDelta(before, null);
      return true;
    },

    async importAll(pages) {
      for (const p of pages) {
        if (!p.id) p.id = Inkmark.uid();
        await Inkmark.store.put(p);
      }
      return pages.length;
    },

    async clear() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const t = db.transaction("pages", "readwrite");
        t.objectStore("pages").clear();
        t.oncomplete = () => {
          syncIndex();
          resolve(true);
        };
        t.onerror = () => reject(t.error);
      });
    },

    rebuildIndex: syncIndex,
    // Resolves once queued index updates are written (tests, and callers that read the index right after).
    flushIndex: () => indexChain
  };

  const DEFAULT_SETTINGS = {
    defaultColor: "yellow",
    notionToken: "",
    notionParentId: "",
    notionParentType: "page",
    notionParentTitle: "",
    notionClientId: "",
    notionClientSecret: "",
    notionWorkspace: "",
    notionBotId: "",
    obsidianVault: "",
    obsidianFolder: "Inkmark",
    obsidianRestKey: "",
    obsidianRestPort: 27123,
    obsidianRestOk: false,
    obsidianFolderConnected: false,
    autoOpenPdf: true,
    aiProvider: "cerebras",
    aiKey: "",
    aiModel: "",
    aiBaseUrl: "",
    aiFocus: "",
    aiDensity: "normal",
    aiAuto: false,
    firecrawlKey: "",
    firecrawlMode: "off"
  };

  Inkmark.settings = {
    async get() {
      if (g.chrome && chrome.storage && chrome.storage.local) {
        const data = await chrome.storage.local.get({ inkmarkSettings: DEFAULT_SETTINGS });
        return Object.assign({}, DEFAULT_SETTINGS, data.inkmarkSettings || {});
      }
      const raw = g.localStorage && localStorage.getItem("inkmarkSettings");
      return Object.assign({}, DEFAULT_SETTINGS, raw ? JSON.parse(raw) : {});
    },
    async set(patch) {
      const current = await Inkmark.settings.get();
      const next = Object.assign({}, current, patch);
      if (g.chrome && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ inkmarkSettings: next });
      } else if (g.localStorage) {
        localStorage.setItem("inkmarkSettings", JSON.stringify(next));
      }
      return next;
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
