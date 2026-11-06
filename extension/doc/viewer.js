// Office, e-book and spreadsheet files → Markdown (anydoc, in WebAssembly, on this device) → a readable
// page that Inkmark highlights like any other.
import init, { toMarkdownBytes, formatFromBytes, formatFromPath } from "../vendor/anydoc/anydoc_wasm.js";

const params = new URLSearchParams(location.search);
let file = params.get("file") || "";

const article = document.getElementById("doc");
const empty = document.getElementById("empty");
const errorEl = document.getElementById("error");
const loadingEl = document.getElementById("loading");
const filenameEl = document.getElementById("filename");
const original = document.getElementById("original");

const CACHE_NAME = "inkmark-doc-v1";
const CACHE_MAX_FILES = 50;
const MAX_BYTES = 80 * 1024 * 1024;
const ACCEPT = ".docx,.doc,.docm,.odt,.rtf,.epub,.pptx,.ppt,.pps,.ppsx,.pot,.pptm,.ppsm,.odp,.xlsx,.xls,.xlsm,.xlsb,.ods,.csv";

document.documentElement.setAttribute("data-inkmark-kind", "doc");
if (file) document.documentElement.setAttribute("data-inkmark-url", file);

let ready = null;
function wasm() {
  if (!ready) ready = init();
  return ready;
}

function showLoading(text) {
  loadingEl.hidden = !text;
  loadingEl.textContent = text || "";
}

function showError(msg) {
  showLoading("");
  errorEl.hidden = false;
  errorEl.textContent = msg;
}

function prettyName(src) {
  try {
    const u = new URL(src);
    const parts = u.pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || u.hostname || "Document");
  } catch {
    return "Document";
  }
}

function cacheKey(url) {
  return "https://inkmark.cache/doc?u=" + encodeURIComponent(url.split("#")[0]);
}

async function cacheGet(url) {
  try {
    const res = await (await caches.open(CACHE_NAME)).match(cacheKey(url));
    return res ? await res.text() : null;
  } catch {
    return null;
  }
}

async function cachePut(url, markdown) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheKey(url), new Response(markdown, { headers: { "content-type": "text/markdown" } }));
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - CACHE_MAX_FILES; i++) await cache.delete(keys[i]);
  } catch (err) {
    console.warn("Inkmark doc cache", err);
  }
}

const CONVERT_ERRORS = {
  unsupported: "Inkmark can’t read this file type.",
  needsOcr: "This file is a scanned image with no text layer, so there is nothing to highlight.",
  malformed: "The file looks damaged and couldn’t be read.",
  encrypted: "The file is password-protected. Save an unprotected copy and open that.",
  resourceLimit: "The file is too large to convert here.",
  missingPart: "The file is missing a part it needs (often a partial download)."
};

async function convert(bytes, name) {
  await wasm();
  const u8 = new Uint8Array(bytes);
  // CSV has no signature, so the extension decides; everything else is sniffed from the bytes.
  const format = formatFromBytes(u8) || (name ? formatFromPath(name) : undefined);
  if (format === "pdf") {
    const err = new Error("pdf");
    err.code = "pdf";
    throw err;
  }
  try {
    return toMarkdownBytes(u8, format || null);
  } catch (err) {
    const e = new Error(CONVERT_ERRORS[err && err.code] || (err && err.message) || "Conversion failed.");
    e.code = err && err.code;
    throw e;
  }
}

// marked only ever sees the converter's Markdown; raw HTML inside the document is shown as text, and
// links are limited to web and mail addresses. This page has extension privileges.
const SAFE_LINK = /^(https?:|mailto:|#)/i;
globalThis.marked.use({
  gfm: true,
  renderer: {
    html(token) {
      return Inkmark.escapeHtml(token.text || token.raw || "");
    }
  }
});

function render(markdown) {
  const html = globalThis.marked.parse(markdown);
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  tpl.content.querySelectorAll("script,style,iframe,object,embed,form,link,meta").forEach((n) => n.remove());
  tpl.content.querySelectorAll("*").forEach((node) => {
    Array.from(node.attributes).forEach((a) => {
      const name = a.name.toLowerCase();
      if (name.startsWith("on") || name === "style" || name === "srcset") node.removeAttribute(a.name);
    });
    if (node.tagName === "A") {
      const href = node.getAttribute("href") || "";
      if (!SAFE_LINK.test(href)) node.removeAttribute("href");
      else if (!href.startsWith("#")) {
        node.target = "_blank";
        node.rel = "noreferrer";
      }
    }
    if (node.tagName === "IMG") {
      const src = node.getAttribute("src") || "";
      if (!/^https?:/i.test(src)) node.replaceWith(document.createTextNode(node.getAttribute("alt") || ""));
    }
  });
  article.textContent = "";
  article.appendChild(tpl.content);
  article.hidden = false;
  empty.hidden = true;
  errorEl.hidden = true;
}

function setDocument(url, name, markdown) {
  file = url;
  document.documentElement.setAttribute("data-inkmark-url", url);
  filenameEl.textContent = name;
  document.title = name + " · Inkmark";
  // The page title Inkmark stores comes from <title>; a heading in the file reads better when there is one.
  const h1 = markdown.match(/^#\s+(.+)$/m);
  document.querySelector('meta[property="og:title"]').setAttribute("content", h1 ? h1[1].trim() : name);
  render(markdown);
  showLoading("");
  window.dispatchEvent(new Event("inkmark-doc-ready"));
}

async function openRemote(url) {
  const name = prettyName(url);
  filenameEl.textContent = name;
  original.href = url;
  original.hidden = false;
  const cached = await cacheGet(url);
  if (cached) {
    setDocument(url, name, cached);
    return;
  }
  showLoading("Downloading " + name + "…");
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("The server answered " + res.status + " for " + name + ".");
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) throw new Error("The file is over 80 MB.");
  showLoading("Converting " + name + "…");
  let markdown;
  try {
    markdown = await convert(bytes, name);
  } catch (err) {
    if (err.code === "pdf") {
      location.replace(chrome.runtime.getURL("pdf/viewer.html") + "?file=" + encodeURIComponent(url));
      return;
    }
    throw err;
  }
  await cachePut(url, markdown);
  setDocument(url, name, markdown);
}

async function openLocal(f) {
  if (f.size > MAX_BYTES) {
    showError("The file is over 80 MB.");
    return;
  }
  errorEl.hidden = true;
  showLoading("Converting " + f.name + "…");
  try {
    const markdown = await convert(await f.arrayBuffer(), f.name);
    // Same scheme as local PDFs: the file name is the identity, so reopening an edited copy keeps its highlights.
    const url = "local-doc://" + encodeURIComponent(f.name);
    history.replaceState({}, "", location.pathname + "?file=" + encodeURIComponent(url));
    original.hidden = true;
    await cachePut(url, markdown);
    setDocument(url, f.name, markdown);
  } catch (err) {
    showError(err.code === "pdf" ? "That’s a PDF. Open it in a tab and Inkmark’s PDF viewer takes over, or use the PDF viewer’s Open local file." : err.message);
  }
}

function pickFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ACCEPT;
  input.onchange = () => input.files[0] && openLocal(input.files[0]);
  input.click();
}

document.getElementById("open-file").addEventListener("click", pickFile);
document.getElementById("empty-open").addEventListener("click", pickFile);
document.getElementById("ai").addEventListener("click", () => window.dispatchEvent(new Event("inkmark-ai")));

document.addEventListener("dragover", (e) => {
  e.preventDefault();
  document.body.classList.add("dragging");
});
document.addEventListener("dragleave", (e) => {
  if (e.relatedTarget == null) document.body.classList.remove("dragging");
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  document.body.classList.remove("dragging");
  const f = e.dataTransfer && e.dataTransfer.files[0];
  if (f) openLocal(f);
});

(async () => {
  wasm().catch(() => {});
  if (!file) {
    empty.hidden = false;
    return;
  }
  try {
    if (/^(https?|file):/.test(file)) {
      await openRemote(file);
    } else {
      const cached = await cacheGet(file);
      if (!cached) {
        showError("This file was opened from your computer and isn’t cached any more. Use Open file to pick it again.");
        filenameEl.textContent = prettyName(file);
        return;
      }
      setDocument(file, prettyName(file), cached);
    }
  } catch (err) {
    const local = file.startsWith("file:")
      ? " Chrome blocked the local file. Open chrome://extensions, find Inkmark, and turn on Allow access to file URLs."
      : "";
    showError((err.message || String(err)) + local);
  }
})();
