async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function inject(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: "PING" });
    if (res && res.full) return;
  } catch (_) {}
  await Inkmark.client.send({ type: "INJECT_FULL", tabId: tabId });
}

function viewerUrl(url) {
  return chrome.runtime.getURL("pdf/viewer.html") + "?file=" + encodeURIComponent(url);
}

function isRawPdf(tab) {
  return tab && Inkmark.isPdfUrl(tab.url) && !tab.url.includes("pdf/viewer.html");
}

let current = null;

document.getElementById("sidebar").addEventListener("click", async () => {
  const tab = await activeTab();
  if (!tab || tab.id == null) return;
  if (isRawPdf(tab)) {
    await chrome.tabs.update(tab.id, { url: viewerUrl(tab.url) });
    window.close();
    return;
  }
  try {
    await inject(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SIDEBAR" });
    window.close();
  } catch (_) {
    document.getElementById("stat").textContent = "Inkmark can’t run on this page.";
  }
});

document.getElementById("ai").addEventListener("click", async () => {
  const tab = await activeTab();
  if (!tab || tab.id == null) return;
  if (isRawPdf(tab)) {
    await chrome.tabs.update(tab.id, { url: viewerUrl(tab.url) });
    window.close();
    return;
  }
  try {
    await inject(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: "AI_HIGHLIGHT_PAGE" });
    window.close();
  } catch (_) {
    document.getElementById("stat").textContent = "Inkmark can’t run on this page.";
  }
});

document.getElementById("docs").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("doc/viewer.html") });
  window.close();
});

document.getElementById("pdf").addEventListener("click", async () => {
  const tab = await activeTab();
  if (!tab) return;
  await chrome.tabs.update(tab.id, { url: viewerUrl(tab.url) });
  window.close();
});

async function markdown() {
  return Inkmark.client.send({ type: "MARKDOWN_FOR_PAGE", pageId: current.id });
}

document.getElementById("copy-md").addEventListener("click", async () => {
  const btn = document.getElementById("copy-md");
  const out = await markdown();
  await navigator.clipboard.writeText(out.markdown);
  btn.textContent = "Copied";
  setTimeout(() => (btn.textContent = "Copy Markdown"), 1400);
});

document.getElementById("download-md").addEventListener("click", async () => {
  const out = await markdown();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([out.markdown], { type: "text/markdown" }));
  a.download = out.filename;
  a.click();
});

document.getElementById("library").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("library/library.html") });
});

document.getElementById("settings").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("settings/settings.html") });
});

(async () => {
  const d = await chrome.storage.local.get("inkmarkStats");
  const s = d.inkmarkStats || { pages: 0, highlights: 0 };
  document.getElementById("stat").textContent =
    s.highlights + (s.highlights === 1 ? " highlight" : " highlights") + " across " +
    s.pages + (s.pages === 1 ? " page" : " pages") + " · stored on this device";

  const tab = await activeTab();
  if (!tab || !tab.url) return;
  document.getElementById("pdf").hidden = !isRawPdf(tab);
  if (isRawPdf(tab) && tab.url.startsWith("file:") && !(await chrome.extension.isAllowedFileSchemeAccess())) {
    document.getElementById("pdf").hidden = true;
    document.getElementById("sidebar").hidden = true;
    const hint = document.getElementById("file-hint");
    hint.hidden = false;
    document.getElementById("file-access").addEventListener("click", () => {
      chrome.tabs.create({ url: "chrome://extensions/?id=" + chrome.runtime.id });
    });
  }
  current = await Inkmark.client.getPage(tab.url).catch(() => null);
  if (!current) return;
  const n = (current.highlights || []).length;
  document.getElementById("page").hidden = false;
  document.getElementById("page-title").textContent = current.title || "Untitled";
  document.getElementById("page-count").textContent = n + (n === 1 ? " highlight" : " highlights") + " on this page";
  document.getElementById("md-row").hidden = false;
})();
