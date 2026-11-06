(function (g) {
  const Inkmark = (g.Inkmark = g.Inkmark || {});
  const NOTION_VERSION = "2022-06-28";
  const RICH_LIMIT = 1900;
  const BLOCK_LIMIT = 100;

  function rt(text, extra) {
    const chunks = [];
    const s = String(text || "");
    for (let i = 0; i < s.length; i += RICH_LIMIT) {
      const piece = { type: "text", text: { content: s.slice(i, i + RICH_LIMIT) } };
      if (extra) Object.assign(piece, extra);
      chunks.push(piece);
    }
    return chunks.length ? chunks : [{ type: "text", text: { content: "" } }];
  }

  function paragraph(text) {
    return { object: "block", type: "paragraph", paragraph: { rich_text: rt(text) } };
  }

  function heading(text, level) {
    const key = "heading_" + level;
    return { object: "block", type: key, [key]: { rich_text: rt(text) } };
  }

  function quote(text, color) {
    const notionColor = Inkmark.colorOf(color).notion || "yellow_background";
    return {
      object: "block",
      type: "quote",
      quote: { rich_text: rt(text), color: notionColor }
    };
  }

  function bookmark(url) {
    return { object: "block", type: "bookmark", bookmark: { url } };
  }

  function divider() {
    return { object: "block", type: "divider", divider: {} };
  }

  Inkmark.pageToNotionBlocks = function pageToNotionBlocks(page) {
    const blocks = [];
    if (page.url) blocks.push(bookmark(page.url));
    const tags = unique([].concat(page.tags || [], ...(page.highlights || []).map((h) => h.tags || [])));
    if (tags.length) blocks.push(paragraph("Tags: " + tags.join(", ")));
    if (page.pageNote && page.pageNote.trim()) {
      blocks.push(heading("Page note", 2));
      blocks.push(paragraph(page.pageNote.trim()));
    }
    const highlights = (page.highlights || []).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    if (highlights.length) {
      blocks.push(heading("Highlights", 2));
      highlights.forEach((h) => {
        blocks.push(quote(h.text || "", h.color));
        if (h.tags && h.tags.length) blocks.push(paragraph("Tags: " + h.tags.join(", ")));
        if (h.note && h.note.trim()) blocks.push(paragraph(h.note.trim()));
        blocks.push(divider());
      });
      if (blocks[blocks.length - 1].type === "divider") blocks.pop();
    }
    return blocks;
  };

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

  function chunk(arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  async function notionFetch(token, path, options) {
    const res = await fetch("https://api.notion.com" + path, {
      method: (options && options.method) || "GET",
      headers: {
        Authorization: "Bearer " + token,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json"
      },
      body: options && options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.message || data.code || res.statusText || "Notion request failed";
      const err = new Error(msg);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  Inkmark.notionRequest = notionFetch;

  Inkmark.notionTitleOf = function notionTitleOf(obj) {
    if (!obj) return "Untitled";
    if (obj.object === "database") {
      return ((obj.title || []).map((t) => t.plain_text).join("") || "Untitled database");
    }
    const props = obj.properties || {};
    const titleProp = Object.values(props).find((p) => p && p.type === "title");
    if (titleProp) return (titleProp.title || []).map((t) => t.plain_text).join("") || "Untitled";
    return "Untitled";
  };

  Inkmark.notionAuthorizeUrl = function notionAuthorizeUrl(clientId, redirectUri, state) {
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      owner: "user",
      redirect_uri: redirectUri,
      state: state
    });
    return "https://api.notion.com/v1/oauth/authorize?" + params.toString();
  };

  Inkmark.notionExchangeCode = async function notionExchangeCode(clientId, clientSecret, redirectUri, code) {
    const encoded = btoa(clientId + ":" + clientSecret);
    const res = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Basic " + encoded
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error_description || data.message || data.error || "Notion token exchange failed");
    }
    return data;
  };

  Inkmark.notionSearchParents = async function notionSearchParents(token) {
    const items = [];
    let cursor = null;
    for (let i = 0; i < 4; i++) {
      const body = { page_size: 50 };
      if (cursor) body.start_cursor = cursor;
      const data = await notionFetch(token, "/v1/search", { method: "POST", body });
      (data.results || []).forEach((obj) => {
        if (obj.object !== "page" && obj.object !== "database") return;
        items.push({
          id: obj.id,
          type: obj.object === "database" ? "database" : "page",
          title: Inkmark.notionTitleOf(obj)
        });
      });
      if (!data.has_more) break;
      cursor = data.next_cursor;
    }
    items.sort((a, b) => a.title.localeCompare(b.title));
    return items;
  };

  Inkmark.pickDefaultParent = function pickDefaultParent(items) {
    if (!items || !items.length) return null;
    const named = items.find((x) => /inkmark|highlight/i.test(x.title));
    if (named) return named;
    const db = items.find((x) => x.type === "database");
    return db || items[0];
  };

  Inkmark.exportPageToNotion = async function exportPageToNotion(page, settings) {
    const token = (settings.notionToken || "").trim();
    const parentId = Inkmark.parseNotionId(settings.notionParentId || "");
    if (!token) throw new Error("Connect Notion in Settings.");
    if (!parentId) throw new Error("Pick a Notion page or database in Settings.");

    const blocks = Inkmark.pageToNotionBlocks(page);
    const first = blocks.slice(0, BLOCK_LIMIT);
    const rest = blocks.slice(BLOCK_LIMIT);
    const parentType = settings.notionParentType || "page";

    let body;
    if (parentType === "database") {
      const db = await notionFetch(token, "/v1/databases/" + parentId);
      const props = db.properties || {};
      const titleKey = Object.keys(props).find((k) => props[k].type === "title");
      if (!titleKey) throw new Error("That Notion database has no title property.");
      const properties = {};
      properties[titleKey] = { title: rt(page.title || "Untitled") };
      const urlKey = Object.keys(props).find((k) => props[k].type === "url");
      if (urlKey && page.url) properties[urlKey] = { url: page.url };
      const tagsKey = Object.keys(props).find(
        (k) => props[k].type === "multi_select" && /tag/i.test(k)
      );
      if (tagsKey) {
        const tags = unique([].concat(page.tags || [], ...(page.highlights || []).map((h) => h.tags || [])));
        properties[tagsKey] = { multi_select: tags.slice(0, 20).map((name) => ({ name })) };
      }
      body = {
        parent: { database_id: parentId },
        properties,
        children: first
      };
    } else {
      body = {
        parent: { page_id: parentId },
        properties: {
          title: { title: rt(page.title || "Untitled") }
        },
        children: first
      };
    }

    const created = await notionFetch(token, "/v1/pages", { method: "POST", body });
    for (const group of chunk(rest, BLOCK_LIMIT)) {
      await sleep(350);
      await notionFetch(token, "/v1/blocks/" + created.id + "/children", {
        method: "PATCH",
        body: { children: group }
      });
    }
    return { id: created.id, url: created.url };
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
