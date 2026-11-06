let pages = [];
let activeTag = "";
let toastTimer = null;

function toast(text) {
  const el = document.getElementById("saved");
  el.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.textContent = ""), 2400);
}

function make(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function pageTags(page) {
  return [].concat(page.tags || [], ...(page.highlights || []).map((h) => h.tags || []));
}

function allTags(list) {
  const set = new Set();
  list.forEach((p) => pageTags(p).forEach((t) => set.add(t)));
  return Array.from(set).sort();
}

function matches(page, q, tag) {
  if (tag && !pageTags(page).includes(tag)) return false;
  if (!q) return true;
  const blob = [
    page.title,
    page.url,
    page.pageNote,
    page.author,
    ...pageTags(page),
    ...(page.highlights || []).map((h) => h.text + " " + (h.note || ""))
  ]
    .join("\n")
    .toLowerCase();
  return blob.includes(q);
}

function openUrl(p) {
  if (p.kind === "pdf") return chrome.runtime.getURL("pdf/viewer.html") + "?file=" + encodeURIComponent(p.url);
  if (p.kind === "doc") return chrome.runtime.getURL("doc/viewer.html") + "?file=" + encodeURIComponent(p.url);
  return p.url;
}

function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function plural(n, word) {
  return n + " " + word + (n === 1 ? "" : "s");
}

function card(p) {
  const root = make("article", "card");
  const head = make("div", "card-head");
  const text = make("div");
  const h2 = make("h2");
  const link = make("a", null, p.title || "Untitled");
  link.href = openUrl(p);
  link.target = "_blank";
  h2.appendChild(link);
  const meta = [Inkmark.hostname(p.url), p.author, Inkmark.relativeTime(p.updatedAt)].filter(Boolean).join(" · ");
  text.append(h2, make("p", "meta", meta));
  const hls = (p.highlights || []).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  head.append(text, make("span", "count", String(hls.length)));
  root.appendChild(head);

  if (hls.length) {
    const ul = make("ul", "quotes");
    hls.slice(0, 3).forEach((h) => {
      const li = make("li", null, h.text);
      li.style.setProperty("--c", Inkmark.colorOf(h.color).swatch);
      ul.appendChild(li);
    });
    root.appendChild(ul);
    if (hls.length > 3) root.appendChild(make("p", "more", "+ " + plural(hls.length - 3, "more highlight")));
  }

  const actions = make("div", "card-actions");
  const copy = make("button", "btn quiet small", "Copy Markdown");
  copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(Inkmark.pageToMarkdown(p));
    toast("Markdown copied with source reference");
  });
  const dl = make("button", "btn quiet small", "Download .md");
  dl.addEventListener("click", () => {
    download(Inkmark.filenameForPage(p), Inkmark.pageToMarkdown(p));
    toast("Downloaded " + Inkmark.filenameForPage(p));
  });
  const del = make("button", "btn quiet small danger", "Delete");
  del.addEventListener("click", async () => {
    if (!confirm("Delete “" + (p.title || "Untitled") + "” and its " + plural(hls.length, "highlight") + "?")) return;
    await Inkmark.client.deletePage(p.id);
    pages = pages.filter((x) => x.id !== p.id);
    render();
    toast("Page deleted");
  });
  actions.append(copy, dl, make("span", "grow"), del);
  root.appendChild(actions);
  return root;
}

function render() {
  const q = document.getElementById("q").value.trim().toLowerCase();
  const filtered = pages.filter((p) => matches(p, q, activeTag));
  const hl = filtered.reduce((s, p) => s + ((p.highlights && p.highlights.length) || 0), 0);
  document.getElementById("summary").textContent = pages.length
    ? plural(filtered.length, "page") + " · " + plural(hl, "highlight")
    : "";

  const tagsEl = document.getElementById("tags");
  tagsEl.textContent = "";
  const tags = allTags(pages);
  if (tags.length) {
    const all = make("button", "tag" + (activeTag ? "" : " on"), "All");
    all.addEventListener("click", () => {
      activeTag = "";
      render();
    });
    tagsEl.appendChild(all);
    tags.forEach((t) => {
      const b = make("button", "tag" + (activeTag === t ? " on" : ""), "#" + t);
      b.addEventListener("click", () => {
        activeTag = t === activeTag ? "" : t;
        render();
      });
      tagsEl.appendChild(b);
    });
  }

  const list = document.getElementById("list");
  list.textContent = "";
  if (!filtered.length) {
    const empty = make("div", "empty");
    if (pages.length) {
      empty.append(make("b", null, "Nothing matches"), "Try another search or tag.");
    } else {
      empty.append(make("b", null, "No highlights yet"), "Select text on any page and pick a color. PDFs work from the toolbar icon.");
    }
    list.appendChild(empty);
    return;
  }
  filtered.forEach((p) => list.appendChild(card(p)));
}

document.getElementById("q").addEventListener("input", render);

document.getElementById("copy-all").addEventListener("click", async () => {
  await navigator.clipboard.writeText(Inkmark.pagesToMarkdown(pages));
  toast("Copied " + plural(pages.length, "page") + " as Markdown");
});

document.getElementById("download-all").addEventListener("click", () => {
  download("inkmark-export-" + Inkmark.formatDate(Date.now()) + ".md", Inkmark.pagesToMarkdown(pages));
});

document.getElementById("vault").addEventListener("click", async () => {
  const btn = document.getElementById("vault");
  btn.disabled = true;
  try {
    const results = await Inkmark.client.exportObsidianAll();
    toast("Wrote " + results.filter((r) => r.ok).length + "/" + results.length + " notes to the vault");
    return;
  } catch {
    /* folder picker fallback */
  } finally {
    btn.disabled = false;
  }
  if (!window.showDirectoryPicker) {
    toast("Connect Local REST API in Settings, or download the .md file.");
    return;
  }
  try {
    const dir = await window.showDirectoryPicker({ mode: "readwrite" });
    for (const page of pages) {
      const handle = await dir.getFileHandle(Inkmark.filenameForPage(page), { create: true });
      const writable = await handle.createWritable();
      await writable.write(Inkmark.pageToMarkdown(page));
      await writable.close();
    }
    toast("Wrote " + plural(pages.length, "note"));
  } catch (err) {
    if (!err || err.name !== "AbortError") toast((err && err.message) || "Failed");
  }
});

document.getElementById("notion-all").addEventListener("click", async () => {
  const btn = document.getElementById("notion-all");
  btn.disabled = true;
  btn.textContent = "Exporting…";
  try {
    const results = await Inkmark.client.exportNotionAll();
    toast("Exported " + results.filter((r) => r.ok).length + "/" + results.length + " pages to Notion");
  } catch (err) {
    toast(err.message);
  }
  btn.disabled = false;
  btn.textContent = "Export to Notion";
});

(async () => {
  pages = await Inkmark.client.listPages();
  render();
})();
