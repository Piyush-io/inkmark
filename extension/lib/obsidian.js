(function (g) {
  const Inkmark = (g.Inkmark = g.Inkmark || {});

  const ENDPOINTS = [
    { port: 27123, tls: false },
    { port: 27124, tls: true }
  ];

  function origin(port, tls) {
    return (tls ? "https" : "http") + "://127.0.0.1:" + port;
  }

  Inkmark.obsidianProbe = async function obsidianProbe() {
    for (const ep of ENDPOINTS) {
      try {
        const res = await fetch(origin(ep.port, ep.tls) + "/", { method: "GET" });
        if (res.ok) {
          const info = await res.json().catch(() => ({}));
          return { ok: true, port: ep.port, tls: ep.tls, info };
        }
      } catch {
        /* try next */
      }
    }
    return { ok: false };
  };

  Inkmark.obsidianTestKey = async function obsidianTestKey(port, key, tls) {
    const res = await fetch(origin(port, tls) + "/vault/", {
      headers: { Authorization: "Bearer " + key }
    });
    if (res.status === 401 || res.status === 403) throw new Error("Obsidian rejected that API key.");
    if (!res.ok) throw new Error("Obsidian REST API returned " + res.status);
    return true;
  };

  Inkmark.obsidianWrite = async function obsidianWrite(settings, filename, markdown) {
    const key = (settings.obsidianRestKey || "").trim();
    if (!key) throw new Error("Connect Obsidian in Settings (Local REST API).");
    const port = Number(settings.obsidianRestPort) || 27123;
    const tls = port === 27124;
    const folder = String(settings.obsidianFolder || "Inkmark").replace(/^\/+|\/+$/g, "");
    const rel = (folder ? folder + "/" : "") + filename;
    const path = rel.split("/").filter(Boolean).map(encodeURIComponent).join("/");
    const res = await fetch(origin(port, tls) + "/vault/" + path, {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "text/markdown"
      },
      body: markdown
    });
    if (res.status !== 204 && !res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(t || "Obsidian write failed (" + res.status + ")");
    }
    return { path: rel, port };
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
