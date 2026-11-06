(function () {
  const params = new URLSearchParams(location.search);
  let file = params.get("file") || "";
  const viewer = document.getElementById("viewer");
  const scroller = document.getElementById("scroller");
  const error = document.getElementById("error");
  const filenameEl = document.getElementById("filename");

  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf/pdf.worker.min.js");

  document.documentElement.setAttribute("data-inkmark-kind", "pdf");
  if (file) document.documentElement.setAttribute("data-inkmark-url", file);

  function showError(msg) {
    error.hidden = false;
    error.textContent = msg;
  }

  async function fillText(slot) {
    if (slot.textReady) return;
    let textLayer = slot.wrap.querySelector(".textLayer");
    if (!textLayer) {
      textLayer = document.createElement("div");
      textLayer.className = "textLayer";
      slot.wrap.appendChild(textLayer);
    }
    const content = await slot.page.getTextContent();
    if (typeof pdfjsLib.TextLayer === "function") {
      const layer = new pdfjsLib.TextLayer({
        textContentSource: content,
        container: textLayer,
        viewport: slot.viewport
      });
      await layer.render();
    } else {
      const task = pdfjsLib.renderTextLayer({
        textContent: content,
        textContentSource: content,
        container: textLayer,
        viewport: slot.viewport,
        textDivs: []
      });
      await (task.promise || task);
    }
    slot.textReady = true;
  }

  async function paint(slot) {
    if (slot.canvas) {
      if (!slot.textReady) await fillText(slot);
      return;
    }
    if (slot.rendering) return;
    slot.rendering = true;
    if (!slot.page) {
      // Pages are fetched on demand (HTTP range requests), so slow hosts still show page 1 quickly.
      try {
        slot.page = await state.pdf.getPage(slot.i);
      } catch (err) {
        slot.rendering = false;
        throw err;
      }
      if (slot.dead) return;
      state.pages[slot.i - 1] = slot.page;
      sizeSlot(slot);
    }
    // Back the canvas with device pixels so text is sharp on Retina and when zoomed.
    const ratio = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    canvas.width = Math.floor(slot.viewport.width * ratio);
    canvas.height = Math.floor(slot.viewport.height * ratio);
    canvas.style.width = slot.viewport.width + "px";
    canvas.style.height = slot.viewport.height + "px";
    slot.wrap.insertBefore(canvas, slot.wrap.firstChild);
    slot.canvas = canvas;
    try {
      slot.task = slot.page.render({
        canvasContext: ctx,
        viewport: slot.viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null
      });
      await slot.task.promise;
    } catch (err) {
      if (!err || err.name !== "RenderingCancelledException") throw err;
    } finally {
      slot.rendering = false;
      slot.task = null;
    }
    if (slot.dead) return;
    await fillText(slot);
    window.dispatchEvent(new Event("inkmark-pdf-page"));
  }

  function unpaint(slot) {
    if (slot.task && slot.task.cancel) {
      try {
        slot.task.cancel();
      } catch (_) {}
    }
    slot.task = null;
    slot.rendering = false;
    if (slot.canvas) {
      slot.canvas.width = 0;
      slot.canvas.height = 0;
      slot.canvas.remove();
      slot.canvas = null;
    }
    // Drop the off-screen page's parsed fonts and images; it re-parses from cached bytes if scrolled back.
    if (slot.page && slot.page.cleanup) slot.page.cleanup();
  }

  // Finished downloads are kept so reopening a PDF (or opening it from the Library) skips the network.
  const CACHE_NAME = "inkmark-pdf-v1";
  const CACHE_MAX_FILES = 30;
  const CACHE_MAX_BYTES = 100 * 1024 * 1024;

  function cacheKey(url) {
    return "https://inkmark.cache/pdf?u=" + encodeURIComponent(url.split("#")[0]);
  }

  async function cacheGet(url) {
    try {
      const res = await (await caches.open(CACHE_NAME)).match(cacheKey(url));
      if (!res) return null;
      return { data: await res.arrayBuffer(), etag: res.headers.get("x-etag") || "", modified: res.headers.get("x-last-modified") || "" };
    } catch (_) {
      return null;
    }
  }

  async function cachePut(url, bytes, etag, modified) {
    if (!bytes || bytes.byteLength > CACHE_MAX_BYTES) return;
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(
        cacheKey(url),
        new Response(bytes, { headers: { "content-type": "application/pdf", "x-etag": etag || "", "x-last-modified": modified || "" } })
      );
      const keys = await cache.keys();
      for (let i = 0; i < keys.length - CACHE_MAX_FILES; i++) await cache.delete(keys[i]);
    } catch (err) {
      console.warn("Inkmark PDF cache", err);
    }
  }

  async function remoteVersion(url) {
    try {
      const res = await fetch(url, { method: "HEAD", cache: "no-store" });
      return res.ok ? { etag: res.headers.get("etag") || "", modified: res.headers.get("last-modified") || "" } : null;
    } catch (_) {
      return null;
    }
  }

  // A cached copy is used straight away; if the server now reports a different version, the next open refetches.
  async function revalidate(url, cached) {
    const now = await remoteVersion(url);
    if (!now) return;
    const changed = (now.etag && cached.etag && now.etag !== cached.etag) || (now.modified && cached.modified && now.modified !== cached.modified);
    if (changed) (await caches.open(CACHE_NAME)).delete(cacheKey(url));
  }

  // After page 1 is on screen, pull the rest of the file in the background (in file order, which is
  // usually reading order) so later pages are ready before the reader scrolls to them, then cache it.
  function prefetchAndCache(pdf, url) {
    window.addEventListener(
      "inkmark-pdf-page",
      async () => {
        try {
          const [bytes, version] = await Promise.all([pdf.getData(), remoteVersion(url)]);
          if (state.pdf !== pdf) return;
          await cachePut(url, bytes, version && version.etag, version && version.modified);
        } catch (err) {
          if (state.pdf === pdf) console.warn("Inkmark PDF prefetch", err);
        }
      },
      { once: true }
    );
  }

  const zoomLabel = document.getElementById("zoom-level");
  const loadingEl = document.getElementById("loading");
  const state = { pdf: null, pages: [], slots: [], obs: null, zoom: null };

  // Text of the whole PDF for AI highlighting, including pages that are not painted yet. Items are
  // joined the way the text layer lays them out, so quotes still match once a page renders.
  window.__inkmarkDocText = async function () {
    const pdf = state.pdf;
    if (!pdf) return "";
    const out = [];
    let total = 0;
    for (let n = 1; n <= pdf.numPages && total < 200000; n++) {
      const page = state.pages[n - 1] || (await pdf.getPage(n));
      const content = await page.getTextContent();
      const text = content.items
        .map((it) => (it.str || "") + (it.hasEOL ? "\n" : " "))
        .join("")
        .replace(/[ \t]+/g, " ")
        .trim();
      out.push(text);
      total += text.length;
    }
    return out.join("\n\n");
  };

  function fitScale() {
    const first = state.pages[0];
    if (!first) return 1.3;
    const w = first.getViewport({ scale: 1 }).width;
    // Fit the window, but stop at a comfortable reading width on wide screens.
    return Math.max(0.5, Math.min(viewer.clientWidth - 48, 1000) / w);
  }

  function currentScale() {
    return state.zoom || fitScale();
  }

  // Unloaded pages borrow page 1's size until their own is known.
  function sizeSlot(slot) {
    const scale = currentScale();
    slot.viewport = (slot.page || state.pages[0]).getViewport({ scale: scale });
    slot.wrap.style.width = slot.viewport.width + "px";
    slot.wrap.style.height = slot.viewport.height + "px";
    // pdf.js sizes text-layer glyphs with this variable; without it selection drifts off the text.
    slot.wrap.style.setProperty("--scale-factor", String(scale));
  }

  function layout() {
    if (!state.pdf) return;
    // Keep the reader on the same spot of the same page across re-layouts.
    const anchor = state.slots.find((s) => s.wrap.getBoundingClientRect().bottom > 60);
    const anchorPage = anchor ? anchor.i : 1;
    const anchorFrac = anchor ? (60 - anchor.wrap.getBoundingClientRect().top) / anchor.wrap.offsetHeight : 0;

    if (state.obs) state.obs.disconnect();
    state.slots.forEach((s) => {
      s.dead = true;
      unpaint(s);
    });
    viewer.textContent = "";
    const scale = currentScale();
    zoomLabel.textContent = Math.round(scale * 100) + "%";
    state.slots = state.pages.map((page, idx) => {
      const wrap = document.createElement("div");
      wrap.className = "page";
      wrap.dataset.page = String(idx + 1);
      viewer.appendChild(wrap);
      const slot = { i: idx + 1, wrap: wrap, page: page, viewport: null, canvas: null, textReady: false, rendering: false, task: null };
      sizeSlot(slot);
      return slot;
    });

    const target = state.slots[anchorPage - 1];
    if (target && (anchorPage > 1 || anchorFrac > 0)) {
      scroller.scrollTo(0, target.wrap.offsetTop + anchorFrac * target.wrap.offsetHeight - 8);
    }

    state.obs = new IntersectionObserver(
      function (entries) {
        for (let i = 0; i < entries.length; i++) {
          const slot = state.slots[Number(entries[i].target.dataset.page) - 1];
          if (!slot || slot.dead) continue;
          if (entries[i].isIntersecting) paint(slot).catch(function (err) {
            console.warn("Inkmark PDF page", err);
          });
          else unpaint(slot);
        }
      },
      { root: scroller, rootMargin: "150% 0px", threshold: 0 }
    );
    state.slots.forEach((s) => state.obs.observe(s.wrap));
  }

  function clampZoom(z) {
    return Math.min(4, Math.max(0.4, Math.round(z * 100) / 100));
  }

  // The page point under (clientX, clientY), so it can stay under the pointer across a zoom.
  function anchorAt(clientX, clientY) {
    for (let i = 0; i < state.slots.length; i++) {
      const r = state.slots[i].wrap.getBoundingClientRect();
      if (r.bottom + 16 < clientY) continue;
      return { slot: state.slots[i], fx: (clientX - r.left) / r.width, fy: (clientY - r.top) / r.height, clientX, clientY };
    }
    return null;
  }

  function restoreAnchor(a) {
    const r = a.slot.wrap.getBoundingClientRect();
    scroller.scrollBy(r.left + a.fx * r.width - a.clientX, r.top + a.fy * r.height - a.clientY);
  }

  // Zoom without tearing pages down: resize every page in place and stretch the canvases already drawn
  // (instant, slightly soft), keep the text layer and marks (they follow --scale-factor), then redraw
  // sharp canvases in the background and swap each in when ready.
  function setZoom(next, clientX, clientY) {
    if (!state.pdf || !state.slots.length) {
      state.zoom = next == null ? null : clampZoom(next);
      layout();
      return;
    }
    const a = anchorAt(clientX == null ? innerWidth / 2 : clientX, clientY == null ? innerHeight / 2 : clientY);
    state.zoom = next == null ? null : clampZoom(next);
    zoomLabel.textContent = Math.round(currentScale() * 100) + "%";
    state.slots.forEach((slot) => {
      sizeSlot(slot);
      if (slot.canvas) {
        slot.canvas.style.width = slot.viewport.width + "px";
        slot.canvas.style.height = slot.viewport.height + "px";
      }
    });
    if (a) restoreAnchor(a);
    scheduleSharpen();
  }

  let sharpenGen = 0;
  let sharpenTimer = 0;
  function scheduleSharpen() {
    sharpenGen += 1;
    clearTimeout(sharpenTimer);
    const gen = sharpenGen;
    sharpenTimer = setTimeout(async () => {
      const mid = innerHeight / 2;
      const dist = (s) => {
        const r = s.wrap.getBoundingClientRect();
        return Math.abs((r.top + r.bottom) / 2 - mid);
      };
      const todo = state.slots.filter((s) => s.canvas && !s.dead).sort((x, y) => dist(x) - dist(y));
      for (const slot of todo) {
        if (gen !== sharpenGen) return;
        await sharpen(slot, gen).catch((err) => console.warn("Inkmark PDF sharpen", err));
      }
    }, 120);
  }

  async function sharpen(slot, gen) {
    if (!slot.canvas || slot.rendering || slot.dead) return;
    const ratio = window.devicePixelRatio || 1;
    const vp = slot.viewport;
    if (slot.canvas.width === Math.floor(vp.width * ratio)) return;
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width * ratio);
    canvas.height = Math.floor(vp.height * ratio);
    canvas.style.width = vp.width + "px";
    canvas.style.height = vp.height + "px";
    slot.rendering = true;
    try {
      slot.task = slot.page.render({
        canvasContext: canvas.getContext("2d", { alpha: false }),
        viewport: vp,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null
      });
      await slot.task.promise;
    } catch (err) {
      canvas.width = 0;
      if (!err || err.name !== "RenderingCancelledException") throw err;
      return;
    } finally {
      slot.rendering = false;
      slot.task = null;
    }
    // A newer zoom or a scroll-away happened meanwhile: this drawing is stale.
    if (gen !== sharpenGen || slot.dead || !slot.canvas || slot.viewport !== vp) {
      canvas.width = 0;
      return;
    }
    const old = slot.canvas;
    old.replaceWith(canvas);
    old.width = 0;
    old.height = 0;
    slot.canvas = canvas;
  }

  // Pinch (trackpad) and Ctrl/⌘ + wheel arrive as wheel events with ctrlKey. Chrome would zoom the whole
  // tab, header included; zoom only the pages instead. During the gesture the pages are scaled with a
  // transform (cheap), and re-rendered at the new size once the fingers stop.
  const pinch = { factor: 1, timer: 0, x: 0, y: 0 };
  window.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey || !state.pdf) return;
      e.preventDefault();
      const base = currentScale();
      // A mouse-wheel notch (~100px) is about 1.28×; trackpad pinch sends many small deltas.
      const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const step = Math.exp(-Math.max(-50, Math.min(50, px)) * 0.0025);
      pinch.factor = clampZoom(base * pinch.factor * step) / base;
      if (!pinch.timer) {
        const box = viewer.getBoundingClientRect();
        viewer.style.transformOrigin = e.clientX - box.left + "px " + (e.clientY - box.top) + "px";
        pinch.x = e.clientX;
        pinch.y = e.clientY;
      }
      viewer.style.transform = "scale(" + pinch.factor + ")";
      zoomLabel.textContent = Math.round(base * pinch.factor * 100) + "%";
      clearTimeout(pinch.timer);
      pinch.timer = setTimeout(() => {
        const next = base * pinch.factor;
        pinch.factor = 1;
        pinch.timer = 0;
        viewer.style.transform = "";
        viewer.style.transformOrigin = "";
        // The transform kept the point under the fingers fixed; the real zoom keeps the same point there.
        setZoom(next, pinch.x, pinch.y);
      }, 180);
    },
    { passive: false }
  );

  // Chrome's own zoom (menu, Ctrl/⌘ + wheel before this page loads) scales the header too. Turn it off
  // for this tab and reset it to 100%; the page zoom controls above take over.
  if (globalThis.chrome && chrome.tabs && chrome.tabs.getCurrent) {
    chrome.tabs.getCurrent((tab) => {
      if (!tab || tab.id == null) return;
      chrome.tabs.setZoomSettings(tab.id, { mode: "disabled", scope: "per-tab" }).catch(() => {});
    });
  }

  function showLoading(text) {
    loadingEl.hidden = !text;
    loadingEl.textContent = text || "";
  }

  async function renderPdf(src, cacheAs) {
    viewer.textContent = "";
    error.hidden = true;
    filenameEl.textContent = prettyName(src);
    showLoading("Loading PDF…");
    let data = src instanceof ArrayBuffer ? src : null;
    const remote = typeof src === "string" && /^https?:/.test(src);
    if (typeof src === "string") {
      const cached = await cacheGet(src);
      if (cached) {
        data = cached.data;
        if (remote) revalidate(src, cached);
      }
    }
    if (data && cacheAs) cachePut(cacheAs, data.slice(0));
    const loading = pdfjsLib.getDocument({
      url: data ? undefined : src,
      data: data || undefined,
      withCredentials: false,
      disableAutoFetch: true,
      disableStream: true
    });
    let opened = false;
    loading.onProgress = (p) => {
      if (!opened && p.total) showLoading("Loading PDF… " + Math.min(99, Math.round((p.loaded / p.total) * 100)) + "%");
    };
    let pdf, first;
    try {
      pdf = await loading.promise;
      first = await pdf.getPage(1);
    } finally {
      opened = true;
      showLoading("");
    }
    const pages = new Array(pdf.numPages).fill(null);
    pages[0] = first;
    if (state.pdf) state.pdf.destroy();
    Object.assign(state, { pdf: pdf, pages: pages, slots: [], zoom: null });
    scroller.scrollTo(0, 0);
    scroller.focus({ preventScroll: true });
    layout();
    document.title = prettyName(src) + " · Inkmark";
    window.dispatchEvent(new Event("inkmark-pdf-ready"));
    if (!data && remote) prefetchAndCache(pdf, src);
  }

  document.getElementById("zoom-out").addEventListener("click", () => setZoom(currentScale() / 1.15));
  document.getElementById("zoom-in").addEventListener("click", () => setZoom(currentScale() * 1.15));
  zoomLabel.addEventListener("click", () => setZoom(null));

  window.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    if (e.key === "=" || e.key === "+") setZoom(currentScale() * 1.15);
    else if (e.key === "-") setZoom(currentScale() / 1.15);
    else if (e.key === "0") setZoom(null);
    else return;
    e.preventDefault();
  });

  let resizeTimer = null;
  let lastRatio = window.devicePixelRatio;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // Re-render when the window width changes in fit mode, or when the screen density changes.
      if (state.zoom == null || window.devicePixelRatio !== lastRatio) layout();
      lastRatio = window.devicePixelRatio;
    }, 150);
  });

  function prettyName(src) {
    if (typeof src !== "string") return "PDF";
    try {
      const u = new URL(src);
      const parts = u.pathname.split("/").filter(Boolean);
      return decodeURIComponent(parts[parts.length - 1] || "PDF");
    } catch {
      return "PDF";
    }
  }

  document.getElementById("ai").addEventListener("click", () => window.dispatchEvent(new Event("inkmark-ai")));

  document.getElementById("open-file").addEventListener("click", async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf";
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      const buf = await f.arrayBuffer();
      const localUrl = "local-pdf://" + encodeURIComponent(f.name);
      document.documentElement.setAttribute("data-inkmark-url", localUrl);
      history.replaceState({}, "", location.pathname + "?file=" + encodeURIComponent(localUrl));
      await renderPdf(buf, localUrl);
      filenameEl.textContent = f.name;
      document.title = f.name + " · Inkmark";
    };
    input.click();
  });

  if (/^(https?|file):/.test(file)) {
    const original = document.getElementById("original");
    original.href = file.split("#")[0] + "#noinkmark";
    original.hidden = false;
  }

  (async () => {
    if (!file) {
      showError("No PDF specified. Use the toolbar on a PDF tab, or open a local file here.");
      return;
    }
    try {
      await renderPdf(file);
    } catch (err) {
      showLoading("");
      // The link turned out not to be a PDF (an HTML page, a login wall): hand the tab back to it.
      if (err && err.name === "InvalidPDFException" && /^https?:/.test(file)) {
        location.replace(file.split("#")[0] + "#noinkmark");
        return;
      }
      const hint =
        file.startsWith("file:")
          ? " Chrome blocked the local file. Open chrome://extensions, find Inkmark, and turn on Allow access to file URLs."
          : file.startsWith("local-pdf:")
            ? " This file was opened from your computer and isn’t cached any more. Use Open local file to pick it again."
            : "";
      showError("Could not open this PDF. " + (err && err.message ? err.message : "") + hint);
    }
  })();
})();
