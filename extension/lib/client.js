(function (g) {
  const Inkmark = (g.Inkmark = g.Inkmark || {});

  async function viaRuntime(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (res) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        if (!res || res.ok === false) {
          reject(new Error((res && res.error) || "Request failed"));
          return;
        }
        resolve(res.data);
      });
    });
  }

  Inkmark.client = {
    async send(msg) {
      if (g.chrome && chrome.runtime && chrome.runtime.id) {
        return viaRuntime(msg);
      }
      if (Inkmark.memoryBackend) return Inkmark.memoryBackend(msg);
      throw new Error("No Inkmark backend");
    },
    getPage: (url) => Inkmark.client.send({ type: "GET_PAGE", url }),
    listPages: () => Inkmark.client.send({ type: "LIST_PAGES" }),
    addHighlight: (url, meta, highlight) =>
      Inkmark.client.send({ type: "ADD_HIGHLIGHT", url, meta, highlight }),
    updateHighlight: (payload) => Inkmark.client.send(Object.assign({ type: "UPDATE_HIGHLIGHT" }, payload)),
    deleteHighlight: (payload) => Inkmark.client.send(Object.assign({ type: "DELETE_HIGHLIGHT" }, payload)),
    updatePage: (payload) => Inkmark.client.send(Object.assign({ type: "UPDATE_PAGE" }, payload)),
    deletePage: (pageId) => Inkmark.client.send({ type: "DELETE_PAGE", pageId }),
    getSettings: () => Inkmark.client.send({ type: "GET_SETTINGS" }),
    setSettings: (patch) => Inkmark.client.send({ type: "SET_SETTINGS", patch }),
    exportNotion: (pageId) => Inkmark.client.send({ type: "EXPORT_NOTION", pageId }),
    exportNotionAll: () => Inkmark.client.send({ type: "EXPORT_NOTION_ALL" }),
    exportJson: () => Inkmark.client.send({ type: "EXPORT_JSON" }),
    importJson: (pages) => Inkmark.client.send({ type: "IMPORT_JSON", pages }),
    bookmark: (payload) => Inkmark.client.send(Object.assign({ type: "BOOKMARK_PAGE" }, payload)),
    notionRedirectUrl: () => Inkmark.client.send({ type: "NOTION_REDIRECT_URL" }),
    notionOAuth: () => Inkmark.client.send({ type: "NOTION_OAUTH" }),
    notionSearch: () => Inkmark.client.send({ type: "NOTION_SEARCH" }),
    notionDisconnect: () => Inkmark.client.send({ type: "NOTION_DISCONNECT" }),
    obsidianProbe: () => Inkmark.client.send({ type: "OBSIDIAN_PROBE" }),
    obsidianTest: (payload) => Inkmark.client.send(Object.assign({ type: "OBSIDIAN_TEST" }, payload)),
    exportObsidian: (pageId) => Inkmark.client.send({ type: "EXPORT_OBSIDIAN", pageId }),
    exportObsidianAll: () => Inkmark.client.send({ type: "EXPORT_OBSIDIAN_ALL" })
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
