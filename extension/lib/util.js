(function (g) {
  const Inkmark = (g.Inkmark = g.Inkmark || {});

  // `swatch` is the solid chip shown in UI; `bg` is the translucent mark painted on
  // pages so it reads on both light and dark sites.
  Inkmark.COLORS = {
    yellow: { id: "yellow", label: "Yellow", swatch: "#F5C931", bg: "rgba(250, 210, 50, 0.42)", notion: "yellow_background" },
    mint: { id: "mint", label: "Green", swatch: "#4CC38A", bg: "rgba(76, 195, 138, 0.34)", notion: "green_background" },
    sky: { id: "sky", label: "Blue", swatch: "#5A9CF2", bg: "rgba(90, 156, 242, 0.32)", notion: "blue_background" },
    rose: { id: "rose", label: "Pink", swatch: "#EC6F9D", bg: "rgba(236, 111, 157, 0.30)", notion: "pink_background" },
    peach: { id: "peach", label: "Orange", swatch: "#F2954B", bg: "rgba(242, 149, 75, 0.36)", notion: "orange_background" },
    lilac: { id: "lilac", label: "Purple", swatch: "#A483F0", bg: "rgba(164, 131, 240, 0.34)", notion: "purple_background" }
  };

  Inkmark.COLOR_ORDER = ["yellow", "mint", "sky", "rose", "peach", "lilac"];

  Inkmark.uid = function uid() {
    if (g.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  Inkmark.now = function now() {
    return Date.now();
  };

  Inkmark.canonicalUrl = function canonicalUrl(raw) {
    try {
      const u = new URL(raw);
      if (u.protocol === "chrome-extension:" && u.pathname.endsWith("/pdf/viewer.html")) {
        const file = u.searchParams.get("file");
        if (file) return Inkmark.canonicalUrl(file);
      }
      u.hash = "";
      [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "utm_id",
        "fbclid",
        "gclid",
        "mc_cid",
        "mc_eid",
        "ref"
      ].forEach((p) => u.searchParams.delete(p));
      return u.toString();
    } catch {
      return raw || "";
    }
  };

  Inkmark.isPdfUrl = function isPdfUrl(url) {
    if (!url) return false;
    try {
      const u = new URL(url);
      if (u.pathname.toLowerCase().endsWith(".pdf")) return true;
      // Only the path counts: a search or redirect URL whose query merely mentions "….pdf" is not a PDF.
      if (u.searchParams.get("contentType") === "application/pdf") return true;
      return false;
    } catch {
      return /\.pdf($|\?|#)/i.test(url);
    }
  };

  function metaContent(doc, selectors) {
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      const v = el && (el.getAttribute("content") || el.textContent || "").trim();
      if (v) return v;
    }
    return "";
  }

  function authorName(v) {
    return /^https?:\/\//.test(v) ? "" : v;
  }

  // Citation details for the Markdown reference block. Every field is optional.
  Inkmark.pageReference = function pageReference(doc) {
    const published = metaContent(doc, [
      'meta[property="article:published_time"]',
      'meta[name="citation_publication_date"]',
      'meta[name="date"]',
      'meta[itemprop="datePublished"]'
    ]);
    return {
      site: metaContent(doc, ['meta[property="og:site_name"]', 'meta[name="application-name"]']),
      author: authorName(metaContent(doc, [
        'meta[name="author"]',
        'meta[name="citation_author"]',
        'meta[property="article:author"]',
        'meta[name="twitter:creator"]'
      ])),
      published: Inkmark.formatDate(published) || ""
    };
  };

  Inkmark.pageTitle = function pageTitle(doc) {
    const og = doc.querySelector('meta[property="og:title"]');
    if (og && og.content) return og.content.trim();
    return (doc.title || "Untitled").trim();
  };

  Inkmark.escapeHtml = function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  Inkmark.slug = function slug(s) {
    const base = String(s || "untitled")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
    return base || "untitled";
  };

  Inkmark.formatDate = function formatDate(ts) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  };

  Inkmark.relativeTime = function relativeTime(ts) {
    const diff = Date.now() - ts;
    const min = Math.round(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return min + "m ago";
    const hr = Math.round(min / 60);
    if (hr < 24) return hr + "h ago";
    const day = Math.round(hr / 24);
    if (day < 14) return day + "d ago";
    return Inkmark.formatDate(ts);
  };

  Inkmark.hostname = function hostname(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  };

  Inkmark.colorOf = function colorOf(id) {
    return Inkmark.COLORS[id] || Inkmark.COLORS.yellow;
  };

  Inkmark.parseNotionId = function parseNotionId(input) {
    const s = String(input || "").trim();
    const dashed = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (dashed) return dashed[0].replace(/-/g, "");
    const raw = s.match(/[0-9a-f]{32}/i);
    if (raw) return raw[0];
    return s.replace(/-/g, "");
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
