(function () {
  if (window.__inkmarkBoot) return;
  window.__inkmarkBoot = true;
  if (location.protocol === "chrome:" || location.protocol === "chrome-extension:") return;
  // PDFs served without a .pdf URL (arxiv.org/pdf/…) land in Chrome's viewer; hand them to Inkmark's.
  if (document.contentType === "application/pdf") {
    chrome.runtime.sendMessage({ type: "PDF_DOCUMENT", url: location.href }).catch(function () {});
    return;
  }

  function canon(raw) {
    try {
      const u = new URL(raw);
      u.hash = "";
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "fbclid", "gclid", "ref"].forEach(function (p) {
        u.searchParams.delete(p);
      });
      return u.toString();
    } catch {
      return raw;
    }
  }

  function injectFull() {
    if (window.__inkmarkLoaded) return Promise.resolve();
    if (!window.__inkmarkInjecting) {
      window.__inkmarkInjecting = chrome.runtime.sendMessage({ type: "INJECT_FULL" });
    }
    return window.__inkmarkInjecting;
  }

  // A long article with paragraphs, not an app, a feed or a search page.
  function looksLikeArticle() {
    const root = document.querySelector("article, main, [role=main]") || document.body;
    if (!root) return false;
    const paras = Array.from(root.querySelectorAll("p")).filter(function (p) { return (p.textContent || "").length > 80; });
    const words = paras.reduce(function (n, p) { return n + p.textContent.split(/\s+/).length; }, 0);
    return paras.length >= 6 && words >= 600;
  }

  chrome.storage.local.get(["inkmarkIndex", "inkmarkSettings"], function (d) {
    const idx = d.inkmarkIndex;
    const known = idx && idx[canon(location.href)];
    if (known) injectFull();
    const s = d.inkmarkSettings || {};
    if (s.aiAuto && /^https?:$/.test(location.protocol) && looksLikeArticle()) {
      // The content script skips pages AI already highlighted, so revisits cost nothing.
      chrome.runtime.sendMessage({ type: "AI_AUTO" }).catch(function () {});
    }
  });

  document.addEventListener(
    "mouseup",
    function onUp(e) {
      if (window.__inkmarkLoaded) {
        document.removeEventListener("mouseup", onUp);
        return;
      }
      if (e.button !== 0) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      injectFull().then(function () {
        window.dispatchEvent(new Event("inkmark-selection"));
      });
    },
    { passive: true }
  );

  chrome.runtime.onMessage.addListener(function (msg, _s, send) {
    if (msg.type === "PING") send({ ok: true, full: !!window.__inkmarkLoaded });
  });
})();
