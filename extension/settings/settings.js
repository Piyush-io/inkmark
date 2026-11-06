const HANDLE_DB = "inkmark-handles";

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("handles");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveVaultHandle(handle) {
  const db = await openHandleDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("handles", "readwrite");
    tx.objectStore("handles").put(handle, "obsidianVault");
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

let savedTimer = null;
function setSaved(text) {
  document.getElementById("saved").textContent = text || "";
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (document.getElementById("saved").textContent = ""), 3200);
}

function notionStatus(s) {
  const el = document.getElementById("notion-status");
  if (s.notionToken && s.notionWorkspace) {
    el.className = "ok";
    el.textContent =
      "Connected to " +
      s.notionWorkspace +
      (s.notionParentTitle ? " · " + s.notionParentTitle : "");
  } else if (s.notionToken) {
    el.className = "ok";
    el.textContent = "Connected" + (s.notionParentTitle ? " · " + s.notionParentTitle : "");
  } else {
    el.className = "help";
    el.textContent = "Not connected.";
  }
}

function obsidianStatus(s) {
  const el = document.getElementById("obsidian-status");
  const bits = [];
  if (s.obsidianRestOk) bits.push("Local REST API on :" + (s.obsidianRestPort || 27123));
  if (s.obsidianFolderConnected) bits.push("vault folder");
  if (s.obsidianVault) bits.push("vault “" + s.obsidianVault + "”");
  if (!bits.length) {
    el.className = "help";
    el.textContent = "Not connected.";
    return;
  }
  el.className = "ok";
  el.textContent = "Connected · " + bits.join(" · ");
}

async function fillParents(selectedId) {
  const wrap = document.getElementById("notion-parent-wrap");
  const sel = document.getElementById("notion-parent");
  try {
    const items = await Inkmark.client.notionSearch();
    sel.innerHTML = "";
    if (!items.length) {
      wrap.hidden = false;
      const opt = document.createElement("option");
      opt.textContent = "No pages yet. In Notion, share a page with Inkmark, then Refresh.";
      sel.appendChild(opt);
      return;
    }
    items.forEach((item) => {
      const opt = document.createElement("option");
      opt.value = item.type + ":" + item.id;
      opt.textContent = (item.type === "database" ? "Database · " : "Page · ") + item.title;
      if (item.id.replace(/-/g, "") === String(selectedId || "").replace(/-/g, "")) opt.selected = true;
      sel.appendChild(opt);
    });
    wrap.hidden = false;
  } catch (err) {
    wrap.hidden = true;
    setSaved(err.message);
  }
}

async function savePatch(patch) {
  const next = await Inkmark.client.setSettings(patch);
  notionStatus(next);
  obsidianStatus(next);
  return next;
}

(async () => {
  const s = await Inkmark.client.getSettings();
  document.getElementById("color").value = s.defaultColor || "yellow";
  document.getElementById("auto-pdf").checked = s.autoOpenPdf !== false;
  document.getElementById("token").value = s.notionToken && !s.notionWorkspace ? s.notionToken : "";
  document.getElementById("client-id").value = s.notionClientId || "";
  document.getElementById("client-secret").value = s.notionClientSecret || "";
  document.getElementById("vault").value = s.obsidianVault || "";
  document.getElementById("obs-folder").value = s.obsidianFolder || "Inkmark";
  document.getElementById("rest-key").value = s.obsidianRestKey || "";
  notionStatus(s);
  obsidianStatus(s);
  if (s.notionToken) fillParents(s.notionParentId);
  if (s.notionClientId && s.notionClientSecret) {
    document.getElementById("notion-oauth-setup").open = false;
  } else {
    document.getElementById("notion-oauth-setup").open = true;
  }

  const redir = await Inkmark.client.notionRedirectUrl();
  document.getElementById("redirect").value = redir.url;

  const probe = await Inkmark.client.obsidianProbe().catch(() => ({ ok: false }));
  if (probe.ok && !s.obsidianRestOk) {
    document.getElementById("obsidian-status").textContent =
      "Local REST API is running on :" + probe.port + ". Paste the API key and click Connect.";
  }
})();

document.getElementById("auto-pdf").addEventListener("change", (e) => {
  savePatch({ autoOpenPdf: e.target.checked });
});
document.getElementById("color").addEventListener("change", () => {
  savePatch({ defaultColor: document.getElementById("color").value });
});
document.getElementById("vault").addEventListener("change", () => {
  savePatch({ obsidianVault: document.getElementById("vault").value.trim() });
});
document.getElementById("obs-folder").addEventListener("change", () => {
  savePatch({ obsidianFolder: document.getElementById("obs-folder").value.trim() || "Inkmark" });
});
document.getElementById("client-id").addEventListener("change", () => {
  savePatch({ notionClientId: document.getElementById("client-id").value.trim() });
});
document.getElementById("client-secret").addEventListener("change", () => {
  savePatch({ notionClientSecret: document.getElementById("client-secret").value.trim() });
});

document.getElementById("copy-redirect").addEventListener("click", async () => {
  await navigator.clipboard.writeText(document.getElementById("redirect").value);
  document.getElementById("copy-redirect").textContent = "Copied";
  setTimeout(() => (document.getElementById("copy-redirect").textContent = "Copy"), 1200);
});

document.getElementById("notion-connect").addEventListener("click", async () => {
  const btn = document.getElementById("notion-connect");
  btn.textContent = "Waiting on Notion…";
  try {
    await savePatch({
      notionClientId: document.getElementById("client-id").value.trim(),
      notionClientSecret: document.getElementById("client-secret").value.trim()
    });
    const next = await Inkmark.client.notionOAuth();
    notionStatus(next);
    await fillParents(next.notionParentId);
    setSaved("Notion connected.");
  } catch (err) {
    setSaved(err.message);
  }
  btn.textContent = "Connect Notion";
});

document.getElementById("token-connect").addEventListener("click", async () => {
  const token = document.getElementById("token").value.trim();
  if (!token) {
    setSaved("Paste an internal integration token first.");
    return;
  }
  await savePatch({ notionToken: token, notionWorkspace: "" });
  await fillParents("");
  const sel = document.getElementById("notion-parent");
  if (sel.value && sel.value.includes(":")) {
    const [type, id] = [sel.value.split(":")[0], sel.value.slice(sel.value.indexOf(":") + 1)];
    const title = sel.options[sel.selectedIndex].textContent;
    await savePatch({ notionParentType: type, notionParentId: id, notionParentTitle: title.replace(/^(Page|Database) · /, "") });
  }
  setSaved("Token saved. Pick a destination above.");
});

document.getElementById("notion-refresh").addEventListener("click", async () => {
  const s = await Inkmark.client.getSettings();
  await fillParents(s.notionParentId);
});

document.getElementById("notion-disconnect").addEventListener("click", async () => {
  const next = await Inkmark.client.notionDisconnect();
  document.getElementById("notion-parent-wrap").hidden = true;
  notionStatus(next);
  setSaved("Notion disconnected.");
});

document.getElementById("notion-parent").addEventListener("change", async () => {
  const sel = document.getElementById("notion-parent");
  if (!sel.value || !sel.value.includes(":")) return;
  const type = sel.value.split(":")[0];
  const id = sel.value.slice(sel.value.indexOf(":") + 1);
  const title = sel.options[sel.selectedIndex].textContent.replace(/^(Page|Database) · /, "");
  await savePatch({ notionParentType: type, notionParentId: id, notionParentTitle: title });
});

document.getElementById("obsidian-rest").addEventListener("click", async () => {
  const btn = document.getElementById("obsidian-rest");
  btn.textContent = "Checking…";
  try {
    const probe = await Inkmark.client.obsidianProbe();
    if (!probe.ok) {
      throw new Error("No Local REST API on 27123/27124. Enable the plugin’s HTTP server in Obsidian.");
    }
    const key = document.getElementById("rest-key").value.trim();
    const next = await Inkmark.client.obsidianTest({ port: probe.port, key });
    obsidianStatus(next);
    setSaved("Obsidian REST API connected.");
  } catch (err) {
    setSaved(err.message);
  }
  btn.textContent = "Connect Local REST API";
});

document.getElementById("obsidian-folder").addEventListener("click", async () => {
  if (!window.showDirectoryPicker) {
    setSaved("This browser cannot pick a folder.");
    return;
  }
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  await saveVaultHandle(handle);
  await savePatch({ obsidianFolderConnected: true, obsidianVault: handle.name || "" });
  document.getElementById("vault").value = handle.name || "";
  setSaved("Vault folder connected. Library can write .md files into it.");
});

document.getElementById("export-json").addEventListener("click", async () => {
  const pages = await Inkmark.client.exportJson();
  const blob = new Blob([JSON.stringify({ version: 1, pages }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "inkmark-backup.json";
  a.click();
});

document.getElementById("import-json").addEventListener("click", () => document.getElementById("file").click());
document.getElementById("file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const data = JSON.parse(await file.text());
  const pages = data.pages || data;
  const n = await Inkmark.client.importJson(pages);
  setSaved("Imported " + n + " pages.");
});

// AI highlighting
const AI_MODEL_SUGGESTIONS = {
  cerebras: ["qwen-3.8-27b", "gpt-oss-120b"],
  anthropic: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  openai: ["gpt-5-mini", "gpt-5"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
  openrouter: ["openrouter/auto"],
  groq: ["llama-3.3-70b-versatile"],
  ollama: ["llama3.1", "qwen2.5"]
};

function aiStatus(s) {
  const el = document.getElementById("ai-status");
  const c = Inkmark.aiConfig(s);
  if (Inkmark.aiReady(s)) {
    el.className = "ok";
    el.textContent = (Inkmark.AI_PROVIDERS[c.provider] || {}).label + " · " + c.model + (s.aiAuto ? " · automatic" : "");
  } else {
    el.className = "help";
    el.textContent = "Not connected.";
  }
}

function aiProviderUi(provider, s) {
  const preset = Inkmark.AI_PROVIDERS[provider] || Inkmark.AI_PROVIDERS.cerebras;
  document.getElementById("ai-base-wrap").hidden = provider !== "custom" && provider !== "ollama";
  document.getElementById("ai-base").value = s.aiBaseUrl || preset.base;
  document.getElementById("ai-model").placeholder = preset.model || "model name";
  document.getElementById("ai-model").value = s.aiModel || preset.model;
  document.getElementById("ai-key-wrap").hidden = !!preset.noKey;
  document.getElementById("ai-key").placeholder = preset.keyHint;
  const list = document.getElementById("ai-models");
  list.textContent = "";
  (AI_MODEL_SUGGESTIONS[provider] || []).forEach((m) => {
    const o = document.createElement("option");
    o.value = m;
    list.appendChild(o);
  });
}

function aiFormPatch() {
  const provider = document.getElementById("ai-provider").value;
  const preset = Inkmark.AI_PROVIDERS[provider];
  const base = document.getElementById("ai-base").value.trim();
  return {
    aiProvider: provider,
    aiModel: document.getElementById("ai-model").value.trim(),
    aiKey: document.getElementById("ai-key").value.trim(),
    // Only store a base URL that differs from the preset, so preset updates still reach the user.
    aiBaseUrl: base && base !== preset.base ? base : ""
  };
}

(async () => {
  const s = await Inkmark.client.getSettings();
  const sel = document.getElementById("ai-provider");
  Object.keys(Inkmark.AI_PROVIDERS).forEach((id) => {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = Inkmark.AI_PROVIDERS[id].label;
    sel.appendChild(o);
  });
  sel.value = s.aiProvider || "cerebras";
  aiProviderUi(sel.value, s);
  document.getElementById("ai-key").value = s.aiKey || "";
  document.getElementById("ai-density").value = s.aiDensity || "normal";
  document.getElementById("ai-focus").value = s.aiFocus || Inkmark.AI_DEFAULT_FOCUS;
  document.getElementById("ai-auto").checked = !!s.aiAuto;
  document.getElementById("fc-key").value = s.firecrawlKey || "";
  document.getElementById("fc-mode").value = s.firecrawlMode || "off";
  document.getElementById("firecrawl-setup").open = !!s.firecrawlKey;
  aiStatus(s);
})();

async function saveAi(patch) {
  const next = await savePatch(patch);
  aiStatus(next);
  return next;
}

document.getElementById("ai-provider").addEventListener("change", async (e) => {
  // A new provider starts from its own defaults rather than the last provider's model and URL.
  aiProviderUi(e.target.value, {});
  await saveAi(aiFormPatch());
});
["ai-model", "ai-key", "ai-base"].forEach((id) => {
  document.getElementById(id).addEventListener("change", () => saveAi(aiFormPatch()));
});
document.getElementById("ai-density").addEventListener("change", (e) => saveAi({ aiDensity: e.target.value }));
document.getElementById("ai-focus").addEventListener("change", (e) => {
  const v = e.target.value.trim();
  saveAi({ aiFocus: v === Inkmark.AI_DEFAULT_FOCUS ? "" : v });
});
document.getElementById("ai-focus-reset").addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("ai-focus").value = Inkmark.AI_DEFAULT_FOCUS;
  saveAi({ aiFocus: "" });
});
document.getElementById("ai-auto").addEventListener("change", (e) => saveAi({ aiAuto: e.target.checked }));
document.getElementById("fc-key").addEventListener("change", (e) => {
  const key = e.target.value.trim();
  const mode = document.getElementById("fc-mode");
  // Pasting a key means "use it": start with the fallback mode instead of silently doing nothing.
  if (key && mode.value === "off") mode.value = "fallback";
  saveAi({ firecrawlKey: key, firecrawlMode: key ? mode.value : "off" });
});
document.getElementById("fc-mode").addEventListener("change", (e) => saveAi({ firecrawlMode: e.target.value }));

document.getElementById("ai-test").addEventListener("click", async () => {
  const btn = document.getElementById("ai-test");
  btn.textContent = "Testing…";
  btn.disabled = true;
  try {
    await saveAi(aiFormPatch());
    const out = await Inkmark.client.send({ type: "AI_TEST" });
    setSaved("Connected to " + out.model + (out.sample ? ". It picked: “" + out.sample + "”" : "."));
  } catch (err) {
    setSaved(err.message);
  }
  btn.textContent = "Test connection";
  btn.disabled = false;
});
