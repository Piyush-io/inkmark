(function (g) {
  const Inkmark = (g.Inkmark = g.Inkmark || {});

  function yamlList(tags) {
    if (!tags || !tags.length) return "[]";
    return "[" + tags.map((t) => JSON.stringify(String(t))).join(", ") + "]";
  }

  function hashTags(tags) {
    if (!tags || !tags.length) return "";
    return tags.map((t) => "#" + String(t).replace(/\s+/g, "-")).join(" ");
  }

  function sortedHighlights(page) {
    return (page.highlights || []).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  function linkable(page) {
    return /^https?:\/\//i.test(page.url || "");
  }

  // Square brackets inside link text would close the link early.
  function linkText(s) {
    return String(s || "").replace(/([\[\]])/g, "\\$1");
  }

  function fragmentPart(s) {
    return encodeURIComponent(s).replace(/-/g, "%2D");
  }

  // Scroll-to-text fragment (#:~:text=) so each quote links back to its spot on the page.
  // Long quotes use textStart,textEnd so small edits in the middle still match.
  Inkmark.highlightLink = function highlightLink(page, h) {
    if (!linkable(page) || page.kind === "pdf" || Inkmark.isPdfUrl(page.url)) return page.url || "";
    const text = String(h.text || "").replace(/\s+/g, " ").trim();
    if (!text) return page.url;
    const words = text.split(" ");
    const directive =
      words.length > 10
        ? fragmentPart(words.slice(0, 5).join(" ")) + "," + fragmentPart(words.slice(-5).join(" "))
        : fragmentPart(text);
    return page.url.replace(/#.*$/, "") + "#:~:text=" + directive;
  };

  // One-line citation: Author. “Title.” Site, published. URL. Accessed date.
  Inkmark.pageCitation = function pageCitation(page) {
    const parts = [];
    if (page.author) parts.push(page.author.replace(/\.$/, "") + ".");
    parts.push("“" + (page.title || "Untitled").replace(/\.$/, "") + ".”");
    const site = page.site || (linkable(page) ? Inkmark.hostname(page.url) : "");
    const where = [site ? "*" + site + "*" : "", page.published || ""].filter(Boolean).join(", ");
    if (where) parts.push(where + ".");
    if (page.url) parts.push(linkable(page) ? "<" + page.url + ">." : page.url + ".");
    const accessed = Inkmark.formatDate(page.createdAt);
    if (accessed) parts.push("Accessed " + accessed + ".");
    return parts.join(" ");
  };

  Inkmark.pageToMarkdown = function pageToMarkdown(page, opts) {
    // Export the canonical URL so tracking params (utm_*, fbclid…) don't leak into notes.
    if (page.url) page = Object.assign({}, page, { url: Inkmark.canonicalUrl(page.url) });
    const frontmatter = !opts || opts.frontmatter !== false;
    const tags = unique([].concat(page.tags || [], ...(page.highlights || []).map((h) => h.tags || [])));
    const highlights = sortedHighlights(page);
    const site = page.site || (linkable(page) ? Inkmark.hostname(page.url) : "");
    const lines = [];
    if (frontmatter) {
      lines.push("---");
      lines.push("title: " + yamlQuote(page.title || "Untitled"));
      lines.push("url: " + (page.url || ""));
      if (site) lines.push("site: " + yamlQuote(site));
      if (page.author) lines.push("author: " + yamlQuote(page.author));
      if (page.published) lines.push("published: " + page.published);
      lines.push("tags: " + yamlList(tags));
      lines.push("highlights: " + highlights.length);
      lines.push("created: " + Inkmark.formatDate(page.createdAt));
      lines.push("updated: " + Inkmark.formatDate(page.updatedAt));
      lines.push("source: inkmark");
      lines.push("---");
      lines.push("");
    }
    lines.push("# " + (page.title || "Untitled"));
    lines.push("");
    if (page.url) {
      const by = [site, page.author].filter(Boolean).join(" · ");
      const link = linkable(page) ? "[" + linkText(page.title || site || page.url) + "](" + page.url + ")" : page.url;
      lines.push("Source: " + link + (by ? " · " + by : ""));
      lines.push("");
    }
    if (tags.length) {
      lines.push(hashTags(tags));
      lines.push("");
    }
    if (page.pageNote && page.pageNote.trim()) {
      lines.push("## Page note");
      lines.push("");
      lines.push(page.pageNote.trim());
      lines.push("");
    }
    if (highlights.length) {
      lines.push("## Highlights");
      lines.push("");
      highlights.forEach((h) => {
        const quote = (h.text || "").trim().split(/\n/).join("\n> ");
        lines.push("> " + quote);
        const trail = [Inkmark.colorOf(h.color).label];
        if (linkable(page)) trail.push("[View in source](" + Inkmark.highlightLink(page, h) + ")");
        if (h.tags && h.tags.length) trail.push(hashTags(h.tags));
        lines.push(">");
        lines.push("> — " + trail.join(" · "));
        if (h.note && h.note.trim()) {
          lines.push("");
          lines.push(h.note.trim());
        }
        lines.push("");
      });
    }
    if (page.url) {
      lines.push("## Reference");
      lines.push("");
      lines.push(Inkmark.pageCitation(page));
      lines.push("");
    }
    return lines.join("\n").trim() + "\n";
  };

  Inkmark.pagesToMarkdown = function pagesToMarkdown(pages) {
    const total = pages.reduce((n, p) => n + ((p.highlights && p.highlights.length) || 0), 0);
    const head =
      "# Inkmark export\n\n" +
      pages.length + (pages.length === 1 ? " page" : " pages") + " · " +
      total + (total === 1 ? " highlight" : " highlights") + " · exported " +
      Inkmark.formatDate(Date.now()) + "\n";
    const body = pages.map((p) => Inkmark.pageToMarkdown(p, { frontmatter: false }).replace(/^# /, "## ").replace(/\n## /g, "\n### "));
    return [head].concat(body).join("\n---\n\n").trim() + "\n";
  };

  Inkmark.filenameForPage = function filenameForPage(page) {
    const date = Inkmark.formatDate(page.createdAt || Date.now());
    return date + "-" + Inkmark.slug(page.title) + ".md";
  };

  function yamlQuote(s) {
    if (/[:#\[\]{}&*!|>'"%@`]/.test(s) || s !== s.trim()) return JSON.stringify(s);
    return s;
  }

  function unique(arr) {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      const k = String(x || "").trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
    return out;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
