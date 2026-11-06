(function (g) {
  const Inkmark = g.Inkmark;
  Inkmark.memoryBackend = async function memoryBackend(msg) {
    switch (msg.type) {
      case "GET_PAGE":
        return Inkmark.store.getByUrl(msg.url);
      case "LIST_PAGES":
        return Inkmark.store.list();
      case "GET_PAGE_BY_ID":
        return Inkmark.store.get(msg.pageId);
      case "ADD_HIGHLIGHT":
        return Inkmark.store.addHighlight(msg.url, msg.meta || {}, msg.highlight);
      case "UPDATE_HIGHLIGHT":
        return Inkmark.store.updateHighlight(msg.pageId, msg.highlightId, msg.patch || {});
      case "DELETE_HIGHLIGHT":
        return Inkmark.store.deleteHighlight(msg.pageId, msg.highlightId);
      case "UPDATE_PAGE":
        return Inkmark.store.updatePage(msg.pageId, msg.patch || {});
      case "DELETE_PAGE":
        return Inkmark.store.deletePage(msg.pageId);
      case "BOOKMARK_PAGE":
        return Inkmark.store.ensurePage(msg.meta || { url: msg.url });
      case "GET_SETTINGS":
        return Inkmark.settings.get();
      case "SET_SETTINGS":
        return Inkmark.settings.set(msg.patch || {});
      case "EXPORT_NOTION": {
        const page = await Inkmark.store.get(msg.pageId);
        if (!page) throw new Error("Page not found");
        const settings = await Inkmark.settings.get();
        const result = await Inkmark.exportPageToNotion(page, settings);
        await Inkmark.store.updatePage(page.id, { notionUrl: result.url, notionPageId: result.id });
        return result;
      }
      case "EXPORT_NOTION_ALL":
        throw new Error("Use the extension library to export every page.");
      case "EXPORT_JSON":
        return Inkmark.store.list();
      case "IMPORT_JSON":
        return Inkmark.store.importAll(msg.pages || []);
      case "OPEN_LIBRARY":
      case "OPEN_SETTINGS":
        return true;
      case "NOTION_REDIRECT_URL":
        return { url: "https://inkmark.chromiumapp.org/notion" };
      case "NOTION_SEARCH":
        return [];
      case "OBSIDIAN_PROBE":
        return { ok: false };
      case "MARKDOWN_FOR_PAGE": {
        const page = await Inkmark.store.get(msg.pageId);
        if (!page) throw new Error("Page not found");
        return { markdown: Inkmark.pageToMarkdown(page), filename: Inkmark.filenameForPage(page) };
      }
      case "MARKDOWN_ALL": {
        const pages = await Inkmark.store.list();
        return { markdown: Inkmark.pagesToMarkdown(pages), filename: "inkmark-export.md" };
      }
      default:
        throw new Error("Unknown message " + msg.type);
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
