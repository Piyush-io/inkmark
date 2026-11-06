(function (g) {
  const Inkmark = (g.Inkmark = g.Inkmark || {});
  const HOST_NAME = "inkmark-host";
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Lucide-style outline icons, built with createElementNS so pages with Trusted Types still work.
  const ICONS = {
    x: ["M18 6 6 18", "M6 6l12 12"],
    copy: ["M8 8h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z", "M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"],
    download: ["M12 4v11", "m7 10 5 5 5-5", "M4 20h16"],
    trash: ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12", "M9 7V4h6v3"],
    note: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
    library: ["M4 4v16", "M8 8v12", "M12 6v14", "m16 6 4 14"],
    settings: ["M4 21v-7", "M4 10V3", "M12 21v-9", "M12 8V3", "M20 21v-5", "M20 12V3", "M1 14h6", "M9 8h6", "M17 16h6"],
    notion: ["M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z", "M9 16V8l6 8V8"],
    obsidian: ["M7 3h10l4 7-9 11L3 10z", "M3 10h18", "M12 21 9 10l3-7 3 7z"],
    markdown: ["M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z", "M14 3v6h6", "M8 13h8", "M8 17h5"]
  };

  const CSS = `
    :host {
      all: initial;
      position: absolute; top: 0; left: 0; width: 0; height: 0;
      overflow: visible; pointer-events: none; z-index: 2147483645;
      --bg: #FBFAF7; --surface: #FFFFFF; --sunken: #F3F1EC; --hover: #EFEDE7;
      --line: #E8E5DE; --line-strong: #D8D4CB;
      --text: #1E1D1A; --muted: #6F6B63; --faint: #9A958B;
      --primary: #1E1D1A; --on-primary: #FBFAF7;
      --bar: #1E1D1A; --bar-text: #F4F2EE; --bar-line: rgba(255,255,255,.12);
      --danger: #B93A2E; --focus: #5A9CF2;
      --shadow-lg: 0 1px 2px rgba(30,29,26,.06), 0 18px 48px -8px rgba(30,29,26,.22);
      --shadow-md: 0 1px 2px rgba(30,29,26,.08), 0 10px 28px -6px rgba(30,29,26,.20);
      --sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
      --serif: "Iowan Old Style", "Charter", "Palatino Linotype", Georgia, serif;
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --bg: #1A1917; --surface: #232220; --sunken: #151413; --hover: #2C2B28;
        --line: #302E2A; --line-strong: #403D38;
        --text: #EEECE7; --muted: #A8A399; --faint: #7C776E;
        --primary: #EEECE7; --on-primary: #1A1917;
        --bar: #2A2926; --bar-text: #F4F2EE; --bar-line: rgba(255,255,255,.10);
        --danger: #F07167;
        --shadow-lg: 0 0 0 1px rgba(255,255,255,.06), 0 18px 48px -8px rgba(0,0,0,.6);
        --shadow-md: 0 0 0 1px rgba(255,255,255,.06), 0 10px 28px -6px rgba(0,0,0,.55);
      }
    }
    .toolbar, .popover, .sidebar, .toast { pointer-events: auto; }
    * { box-sizing: border-box; font-family: var(--sans); -webkit-font-smoothing: antialiased; }
    button { font: inherit; color: inherit; cursor: pointer; background: none; border: 0; padding: 0; margin: 0; }
    button:focus-visible, textarea:focus-visible, input:focus-visible {
      outline: 2px solid var(--focus); outline-offset: 2px;
    }
    svg { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }

    /* Measures the fixed-position coordinate space; pages can shift or scale it with transform, filter or zoom. */
    .probe { position: absolute; left: 0; top: 0; width: 100px; height: 1px; visibility: hidden; pointer-events: none; }
    .viewprobe { position: fixed; inset: 0; visibility: hidden; pointer-events: none; }

    /* Selection toolbar */
    .toolbar {
      position: absolute; display: none; align-items: center; gap: 2px; padding: 4px;
      background: var(--bar); color: var(--bar-text); border-radius: 12px;
      box-shadow: var(--shadow-md); z-index: 3;
    }
    .toolbar.open { display: flex; animation: pop .14s cubic-bezier(.2,.8,.2,1); }
    .toolbar .sep { width: 1px; height: 18px; background: var(--bar-line); margin: 0 4px; }
    .swatch-btn {
      width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center;
    }
    .swatch-btn:hover { background: var(--bar-line); }
    .dot {
      width: 16px; height: 16px; border-radius: 50%;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); transition: transform .12s ease;
    }
    .swatch-btn:hover .dot { transform: scale(1.15); }
    .tool {
      display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 9px 0 7px;
      border-radius: 8px; font-size: 12.5px; font-weight: 550;
    }
    .tool:hover { background: var(--bar-line); }

    /* Highlight popover */
    .popover {
      position: absolute; display: none; width: 300px; z-index: 4;
      background: var(--surface); color: var(--text);
      border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow-lg);
    }
    .popover.open { display: block; animation: pop .14s cubic-bezier(.2,.8,.2,1); }
    .pop-head { display: flex; align-items: center; gap: 2px; padding: 8px 8px 6px 10px; }
    .pop-head .grow { flex: 1; }
    .pick { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; }
    .pick .dot { width: 16px; height: 16px; }
    .pick:hover .dot { transform: scale(1.15); }
    .pick[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--surface), 0 0 0 3.5px var(--text); }
    .icon-btn {
      width: 30px; height: 30px; display: grid; place-items: center; border-radius: 8px; color: var(--muted);
    }
    .icon-btn:hover { background: var(--hover); color: var(--text); }
    .icon-btn.danger:hover { color: var(--danger); }
    .pop-body { padding: 0 10px 10px; display: flex; flex-direction: column; gap: 8px; }
    .pop-body textarea, .tag-field {
      width: 100%; border: 1px solid var(--line); border-radius: 10px; background: var(--sunken);
      color: var(--text); font-size: 13.5px; line-height: 1.45; padding: 8px 10px;
    }
    .pop-body textarea { min-height: 76px; resize: vertical; display: block; }
    .pop-body textarea:focus, .tag-field:focus-within { outline: none; border-color: var(--line-strong); background: var(--surface); }
    .tag-field { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; padding: 5px 6px; min-height: 36px; cursor: text; }
    .tag-field input {
      flex: 1; min-width: 80px; border: 0; outline: 0; background: transparent; color: var(--text);
      font-size: 13px; padding: 3px 4px;
    }
    .pop-foot { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--faint); padding: 0 2px; }

    .chip {
      display: inline-flex; align-items: center; gap: 2px; height: 22px; padding: 0 4px 0 8px;
      background: var(--hover); color: var(--muted); border-radius: 6px; font-size: 12px; font-weight: 500;
    }
    .chip.static { padding: 0 7px; }
    .chip button { width: 16px; height: 16px; display: grid; place-items: center; border-radius: 4px; }
    .chip button:hover { background: var(--line-strong); color: var(--text); }
    .chip svg { width: 12px; height: 12px; }

    /* Sidebar */
    .sidebar {
      position: fixed; top: 0; right: 0; height: 100vh; width: min(368px, 100vw); z-index: 1;
      background: var(--bg); color: var(--text);
      transform: translateX(calc(100% + 24px)); visibility: hidden;
      transition: transform .22s cubic-bezier(.2,.8,.2,1), visibility 0s linear .22s;
      display: flex; flex-direction: column;
      border-left: 1px solid var(--line); box-shadow: var(--shadow-lg);
    }
    .sidebar.open { transform: none; visibility: visible; transition: transform .22s cubic-bezier(.2,.8,.2,1); }
    .head { display: flex; align-items: center; gap: 2px; padding: 12px 10px 12px 16px; }
    .brand { flex: 1; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 650; letter-spacing: -.01em; }
    .logo { width: 18px; height: 18px; border-radius: 5px; background: #F5C931; position: relative; }
    .logo::after { content: ""; position: absolute; left: 4px; right: 4px; bottom: 4px; height: 2px; border-radius: 2px; background: #1E1D1A; }
    .page-info { padding: 4px 16px 14px; border-bottom: 1px solid var(--line); }
    .page-title {
      font-size: 15px; font-weight: 650; line-height: 1.35; letter-spacing: -.01em; margin: 0;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .page-meta { font-size: 12px; color: var(--muted); margin-top: 4px; }
    .page-note {
      display: block; width: 100%; margin-top: 12px; min-height: 38px; max-height: 160px; resize: vertical;
      border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--text);
      font-size: 13px; line-height: 1.45; padding: 8px 10px;
    }
    .page-note:focus { outline: none; border-color: var(--line-strong); }
    .page-note::placeholder, .pop-body textarea::placeholder, .tag-field input::placeholder { color: var(--faint); }
    .ai-row { display: flex; align-items: center; gap: 6px; margin-top: 10px; }
    .ai-row .btn { flex: 1; }
    .ai-clear { height: 34px; padding: 0 10px; border-radius: 9px; font-size: 12.5px; color: var(--muted); }
    .ai-clear:hover { background: var(--hover); color: var(--text); }
    .ai-clear[hidden] { display: none; }
    .ai-status { font-size: 12px; color: var(--muted); margin-top: 6px; line-height: 1.4; }
    .ai-status:empty { display: none; }
    .body { overflow: auto; flex: 1; padding: 6px 8px 12px; overscroll-behavior: contain; }
    .hl {
      position: relative; display: block; width: 100%; text-align: left;
      padding: 10px 12px 10px 20px; border-radius: 10px; cursor: pointer;
    }
    .hl:hover, .hl:focus-visible { background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
    .hl .bar { position: absolute; left: 9px; top: 12px; bottom: 12px; width: 3px; border-radius: 3px; }
    .quote { font-family: var(--serif); font-size: 14.5px; line-height: 1.5; color: var(--text); overflow-wrap: anywhere; }
    .note { font-size: 13px; line-height: 1.45; margin-top: 6px; color: var(--muted); white-space: pre-wrap; }
    .hl-foot { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-top: 8px; font-size: 11.5px; color: var(--faint); }
    .hl-foot .grow { flex: 1; }
    .hl-actions { display: flex; gap: 0; opacity: 0; transition: opacity .12s ease; margin: -6px -6px -6px 0; }
    .hl:hover .hl-actions, .hl:focus-within .hl-actions { opacity: 1; }
    .hl-actions .icon-btn { width: 26px; height: 26px; }
    .hl-actions svg { width: 14px; height: 14px; }
    .empty { text-align: center; color: var(--muted); font-size: 13px; line-height: 1.55; padding: 48px 28px; }
    .empty-dots { display: flex; justify-content: center; gap: 6px; margin-bottom: 14px; }
    .empty-dots span { width: 10px; height: 10px; border-radius: 50%; }
    .empty b { display: block; color: var(--text); font-size: 14px; font-weight: 600; margin-bottom: 4px; }
    kbd {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; padding: 1px 5px;
      border: 1px solid var(--line-strong); border-bottom-width: 2px; border-radius: 5px; color: var(--text);
    }
    .foot { border-top: 1px solid var(--line); padding: 12px 16px 14px; background: var(--bg); }
    .foot-label { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); margin-bottom: 8px; }
    .export { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 34px; padding: 0 12px;
      border-radius: 9px; font-size: 13px; font-weight: 560; white-space: nowrap;
      background: var(--surface); color: var(--text); box-shadow: inset 0 0 0 1px var(--line-strong);
    }
    .btn:hover { background: var(--hover); }
    .btn.primary { background: var(--primary); color: var(--on-primary); box-shadow: none; }
    .btn.primary:hover { opacity: .9; }
    .btn[disabled] { opacity: .55; cursor: progress; }
    .status { font-size: 12px; color: var(--muted); margin-top: 8px; min-height: 0; }
    .status:empty { display: none; }
    .status a { color: inherit; }

    .toast {
      position: fixed; bottom: 20px; left: 50%; z-index: 5;
      display: flex; align-items: center; gap: 12px; max-width: min(440px, calc(100vw - 32px));
      background: var(--bar); color: var(--bar-text); padding: 9px 10px 9px 14px; border-radius: 12px;
      font-size: 13px; box-shadow: var(--shadow-md);
      opacity: 0; transform: translate(-50%, 8px); transition: opacity .16s ease, transform .16s ease;
      pointer-events: none;
    }
    .toast.open { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
    .toast .msg { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .toast button { font-weight: 600; color: #F5C931; padding: 2px 6px; border-radius: 6px; }
    .toast button:hover { background: var(--bar-line); }
    .toast button:empty { display: none; }

    @keyframes pop { from { opacity: 0; transform: translateY(4px) scale(.98); } }
    @media (prefers-reduced-motion: reduce) {
      * { animation: none !important; transition: none !important; }
    }
  `;

  function el(doc, tag, attrs, children) {
    const node = doc.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
        else if (v === false || v == null) return;
        else node.setAttribute(k, v);
      });
    }
    (children || []).forEach((c) => c && node.appendChild(typeof c === "string" ? doc.createTextNode(c) : c));
    return node;
  }

  function icon(doc, name) {
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    ICONS[name].forEach((d) => {
      const path = doc.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  }

  function dot(doc, id) {
    const d = el(doc, "span", { class: "dot" });
    d.style.background = Inkmark.colorOf(id).swatch;
    return d;
  }

  function debounce(fn, ms) {
    let t = null;
    const run = function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
    run.flush = function () {
      clearTimeout(t);
    };
    return run;
  }

  Inkmark.mountUi = function mountUi(doc, api) {
    const existing = doc.querySelector(HOST_NAME);
    if (existing) {
      if (existing.shadowRoot && existing.shadowRoot._inkmark) return existing.shadowRoot._inkmark;
      existing.remove();
    }
    const host = doc.createElement(HOST_NAME);
    host.setAttribute("data-inkmark-ui", "1");
    const shadow = host.attachShadow({ mode: "open" });
    const style = doc.createElement("style");
    style.textContent = CSS;
    shadow.appendChild(style);

    let current = null;
    let active = null;
    let anchor = null;
    let popAnchor = null;

    // Selection toolbar
    const toolbar = el(doc, "div", { class: "toolbar", role: "toolbar", "aria-label": "Highlight" });
    Inkmark.COLOR_ORDER.forEach((id) => {
      toolbar.appendChild(
        el(doc, "button", {
          class: "swatch swatch-btn",
          title: Inkmark.COLORS[id].label,
          "aria-label": "Highlight " + Inkmark.COLORS[id].label.toLowerCase(),
          onmousedown: (e) => e.preventDefault(),
          onclick: () => api.highlightWith(id)
        }, [dot(doc, id)])
      );
    });
    toolbar.appendChild(el(doc, "span", { class: "sep" }));
    toolbar.appendChild(
      el(doc, "button", {
        class: "tool",
        title: "Highlight and add a note",
        onmousedown: (e) => e.preventDefault(),
        onclick: () => api.highlightWith(api.defaultColor(), true)
      }, [icon(doc, "note"), "Note"])
    );

    // Highlight popover
    const popover = el(doc, "div", { class: "popover", role: "dialog", "aria-label": "Edit highlight" });
    const picks = {};
    const popHead = el(doc, "div", { class: "pop-head" });
    Inkmark.COLOR_ORDER.forEach((id) => {
      picks[id] = el(doc, "button", {
        class: "pick",
        title: Inkmark.COLORS[id].label,
        "aria-label": Inkmark.COLORS[id].label,
        "aria-pressed": "false",
        onclick: () => {
          setPicked(id);
          api.recolorActive(id);
        }
      }, [dot(doc, id)]);
      popHead.appendChild(picks[id]);
    });
    popHead.appendChild(el(doc, "span", { class: "grow" }));
    popHead.appendChild(
      el(doc, "button", {
        class: "icon-btn", title: "Copy quote", "aria-label": "Copy quote",
        onclick: () => active && ui.copy(active.text, "Quote copied")
      }, [icon(doc, "copy")])
    );
    popHead.appendChild(
      el(doc, "button", {
        class: "icon-btn danger", title: "Remove highlight", "aria-label": "Remove highlight",
        onclick: () => api.deleteActive()
      }, [icon(doc, "trash")])
    );
    const note = el(doc, "textarea", { placeholder: "Add a note…", "aria-label": "Note" });
    const tagInput = el(doc, "input", { placeholder: "Add tag", "aria-label": "Add tag" });
    const tagField = el(doc, "div", { class: "tag-field", onclick: () => tagInput.focus() }, [tagInput]);
    const savedHint = el(doc, "span");
    const popFoot = el(doc, "div", { class: "pop-foot" }, [el(doc, "span", { text: "Enter adds a tag" }), savedHint]);
    popover.append(popHead, el(doc, "div", { class: "pop-body" }, [note, tagField, popFoot]));

    const saveNote = debounce(async () => {
      if (!active) return;
      active.note = note.value;
      await api.saveActive({ note: note.value });
      savedHint.textContent = "Saved";
    }, 450);
    note.addEventListener("input", () => {
      savedHint.textContent = "";
      saveNote();
    });

    function setPicked(id) {
      Object.keys(picks).forEach((k) => picks[k].setAttribute("aria-pressed", String(k === id)));
    }

    function renderTags() {
      tagField.querySelectorAll(".chip").forEach((c) => c.remove());
      (active && active.tags ? active.tags : []).forEach((t) => {
        const chip = el(doc, "span", { class: "chip" }, [
          t,
          el(doc, "button", {
            "aria-label": "Remove tag " + t,
            onclick: (e) => {
              e.stopPropagation();
              setTags(active.tags.filter((x) => x !== t));
            }
          }, [icon(doc, "x")])
        ]);
        tagField.insertBefore(chip, tagInput);
      });
    }

    function setTags(list) {
      if (!active) return;
      active.tags = list;
      renderTags();
      api.saveActive({ tags: list });
    }

    function commitTag() {
      const parts = tagInput.value.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
      tagInput.value = "";
      if (!parts.length || !active) return;
      const next = (active.tags || []).slice();
      parts.forEach((p) => next.includes(p) || next.push(p));
      setTags(next);
    }

    tagInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        commitTag();
      } else if (e.key === "Backspace" && !tagInput.value && active && active.tags && active.tags.length) {
        setTags(active.tags.slice(0, -1));
      }
    });
    tagInput.addEventListener("blur", commitTag);

    // Sidebar
    const sidebar = el(doc, "aside", { class: "sidebar", "aria-label": "Inkmark highlights" });
    const head = el(doc, "div", { class: "head" }, [
      el(doc, "div", { class: "brand" }, [el(doc, "span", { class: "logo" }), "Inkmark"]),
      el(doc, "button", {
        class: "icon-btn", title: "Library", "aria-label": "Open library",
        onclick: () => Inkmark.client.send({ type: "OPEN_LIBRARY" })
      }, [icon(doc, "library")]),
      el(doc, "button", {
        class: "icon-btn", title: "Settings", "aria-label": "Open settings",
        onclick: () => Inkmark.client.send({ type: "OPEN_SETTINGS" })
      }, [icon(doc, "settings")]),
      el(doc, "button", {
        class: "icon-btn", title: "Close (Esc)", "aria-label": "Close sidebar",
        onclick: () => ui.toggleSidebar(false)
      }, [icon(doc, "x")])
    ]);

    const pageTitle = el(doc, "h2", { class: "page-title" });
    const pageMeta = el(doc, "div", { class: "page-meta" });
    const pageNote = el(doc, "textarea", { class: "page-note", placeholder: "Note on this page…", rows: "1", "aria-label": "Page note" });
    const savePageNote = debounce(() => api.savePageNote(pageNote.value), 600);
    pageNote.addEventListener("input", savePageNote);
    const aiStatus = el(doc, "div", { class: "ai-status", role: "status" });
    const aiBtn = el(doc, "button", {
      class: "btn", title: "Let your AI provider highlight the important passages",
      onclick: () => api.aiHighlight()
    }, ["Highlight key ideas"]);
    const aiClear = el(doc, "button", {
      class: "ai-clear", title: "Remove the highlights AI added", hidden: "",
      onclick: () => api.clearAi()
    }, ["Clear AI"]);
    const aiRow = el(doc, "div", { class: "ai-row" }, [aiBtn, aiClear]);
    const pageInfo = el(doc, "div", { class: "page-info" }, [pageTitle, pageMeta, pageNote, aiRow, aiStatus]);
    const body = el(doc, "div", { class: "body" });

    function exportBtn(label, name, cls, run) {
      const b = el(doc, "button", { class: "btn" + (cls ? " " + cls : "") }, [icon(doc, name), label]);
      b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          await run();
        } catch (err) {
          ui.toast(err.message || String(err));
        } finally {
          b.disabled = false;
        }
      });
      return b;
    }
    const status = el(doc, "div", { class: "status", role: "status" });
    const foot = el(doc, "div", { class: "foot" }, [
      el(doc, "div", { class: "foot-label", text: "Export" }),
      el(doc, "div", { class: "export" }, [
        exportBtn("Copy Markdown", "copy", "primary", () => api.copyMarkdown()),
        exportBtn("Download .md", "download", "", () => api.downloadMarkdown()),
        exportBtn("Notion", "notion", "", () => api.exportNotion()),
        exportBtn("Obsidian", "obsidian", "", () => api.openObsidian())
      ]),
      status
    ]);
    sidebar.append(head, pageInfo, body, foot);

    // Toast
    const toastMsg = el(doc, "span", { class: "msg" });
    const toastAction = el(doc, "button");
    const toast = el(doc, "div", { class: "toast", role: "status", "aria-live": "polite" }, [toastMsg, toastAction]);
    let toastTimer = null;
    let toastRun = null;
    toastAction.addEventListener("click", () => {
      const run = toastRun;
      toast.classList.remove("open");
      if (run) run();
    });

    const probe = el(doc, "div", { class: "probe", "aria-hidden": "true" });
    const viewProbe = el(doc, "div", { class: "viewprobe", "aria-hidden": "true" });
    shadow.append(probe, viewProbe, toolbar, popover, sidebar, toast);
    doc.documentElement.appendChild(host);

    // The toolbar and popover are absolutely positioned in document space, so they travel with the
    // text they point at: scrolling, pinch/smart zoom (WKWebView magnification) and page zoom move
    // them together with the selection, with no script catching up. Only placement uses viewport math.
    //
    // Where our absolute origin is and how much it is scaled, in client pixels. A transform, filter
    // or zoom on <html>/<body>, or a positioned <html>, moves or scales it; measuring cancels that out.
    function docFrame() {
      const r = probe.getBoundingClientRect();
      return { x: r.left, y: r.top, scale: r.width / 100 || 1 };
    }

    // The visible area in client pixels, measured with a fixed full-viewport element so it is in the
    // same coordinate space as the selection's rects (visualViewport offsets are not reliable for this
    // in every engine). Narrowed to the visual viewport when Chrome reports a consistent pinch-zoom.
    function visibleBox() {
      const r = viewProbe.getBoundingClientRect();
      let box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      if (!(box.right - box.left > 0 && box.bottom - box.top > 0)) box = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      const vv = g.visualViewport;
      if (vv && vv.scale > 1.01) {
        const v = { left: vv.offsetLeft, top: vv.offsetTop, right: vv.offsetLeft + vv.width, bottom: vv.offsetTop + vv.height };
        if (v.left >= box.left - 1 && v.top >= box.top - 1 && v.right <= box.right + 1 && v.bottom <= box.bottom + 1) box = v;
      }
      return box;
    }

    // Moves an absolutely positioned node so its top-left lands on client point (x, y).
    function placeAt(node, x, y, frame) {
      node.style.left = (x - frame.x) / frame.scale + "px";
      node.style.top = (y - frame.y) / frame.scale + "px";
    }

    // Line boxes of a range: the first and last visual lines, merged across inline fragments.
    function lineBoxes(range) {
      let rects = Array.from(range.getClientRects()).filter((r) => r.width > 0.5 && r.height > 0.5);
      if (!rects.length) {
        const b = range.getBoundingClientRect();
        if (!b.width && !b.height) return null;
        rects = [b];
      }
      const line = (seed) =>
        rects
          .filter((r) => Math.abs(r.top - seed.top) < seed.height / 2)
          .reduce(
            (u, r) => ({ left: Math.min(u.left, r.left), right: Math.max(u.right, r.right), top: Math.min(u.top, r.top), bottom: Math.max(u.bottom, r.bottom) }),
            { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
          );
      return { first: line(rects[0]), last: line(rects[rects.length - 1]) };
    }

    function placeToolbar() {
      if (!anchor || !toolbar.classList.contains("open")) return;
      const lines = lineBoxes(anchor);
      if (!lines) return;
      const frame = docFrame();
      const view = visibleBox();
      const w = toolbar.offsetWidth * frame.scale;
      const h = toolbar.offsetHeight * frame.scale;
      // Above the first line, centred on it; below the last line when there's no room above;
      // pinned to the top of the screen when the selection is taller than the screen.
      let line = lines.first;
      let top = line.top - h - 8;
      if (top < view.top + 4) {
        line = lines.last;
        top = line.bottom + 8;
        if (top + h > view.bottom - 4) top = view.top + 8;
      }
      const left = Math.max(view.left + 8, Math.min((line.left + line.right) / 2 - w / 2, view.right - w - 8));
      placeAt(toolbar, left, top, frame);
    }

    function placePopover() {
      const frame = docFrame();
      const view = visibleBox();
      const w = popover.offsetWidth * frame.scale;
      const h = popover.offsetHeight * frame.scale;
      const rect = popAnchor && popAnchor.isConnected ? popAnchor.getBoundingClientRect() : null;
      if (!rect) {
        placeAt(popover, Math.max(view.left + 8, (view.left + view.right) / 2 - w / 2), view.top + 96, frame);
        return;
      }
      let top = rect.bottom + 8;
      if (top + h > view.bottom - 8) top = Math.max(view.top + 8, rect.top - h - 8);
      const left = Math.max(view.left + 8, Math.min(rect.left + rect.width / 2 - w / 2, view.right - w - 8));
      placeAt(popover, left, top, frame);
    }

    function emptyState() {
      const dots = el(doc, "div", { class: "empty-dots" });
      Inkmark.COLOR_ORDER.forEach((id) => {
        const s = el(doc, "span");
        s.style.background = Inkmark.colorOf(id).swatch;
        dots.appendChild(s);
      });
      return el(doc, "div", { class: "empty" }, [
        dots,
        el(doc, "b", { text: "No highlights yet" }),
        "Select text and pick a color. ",
        el(doc, "kbd", { text: "Alt" }), " ", el(doc, "kbd", { text: "S" }),
        " highlights in your default color."
      ]);
    }

    function card(h) {
      const bar = el(doc, "span", { class: "bar" });
      bar.style.background = Inkmark.colorOf(h.color).swatch;
      const footBits = [];
      (h.tags || []).forEach((t) => footBits.push(el(doc, "span", { class: "chip static", text: t })));
      footBits.push(el(doc, "span", { class: "grow" }));
      if (h.createdAt) footBits.push(el(doc, "span", { text: Inkmark.relativeTime(h.createdAt) }));
      footBits.push(
        el(doc, "span", { class: "hl-actions" }, [
          el(doc, "button", {
            class: "icon-btn", title: "Copy quote", "aria-label": "Copy quote",
            onclick: (e) => {
              e.stopPropagation();
              ui.copy(h.text, "Quote copied");
            }
          }, [icon(doc, "copy")]),
          el(doc, "button", {
            class: "icon-btn danger", title: "Remove", "aria-label": "Remove highlight",
            onclick: (e) => {
              e.stopPropagation();
              api.deleteHighlight(h.id);
            }
          }, [icon(doc, "trash")])
        ])
      );
      const row = el(doc, "div", {
        class: "hl", tabindex: "0", role: "button", "aria-label": "Go to highlight",
        onclick: () => api.focusHighlight(h.id),
        onkeydown: (e) => {
          if (e.key === "Enter" && e.target === row) api.focusHighlight(h.id);
        }
      }, [bar]);
      row.appendChild(el(doc, "div", { class: "quote", text: h.text }));
      if (h.note) row.appendChild(el(doc, "div", { class: "note", text: h.note }));
      row.appendChild(el(doc, "div", { class: "hl-foot" }, footBits));
      return row;
    }

    const ui = {
      host,
      shadow,
      defaultColor: () => api.defaultColor(),
      showToolbar(range) {
        anchor = range;
        toolbar.classList.add("open");
        placeToolbar();
      },
      hideToolbar() {
        anchor = null;
        toolbar.classList.remove("open");
      },
      isToolbarOpen() {
        return toolbar.classList.contains("open");
      },
      showPopover(hl, mark) {
        saveNote.flush();
        active = { id: hl.id, text: hl.text, note: hl.note || "", tags: (hl.tags || []).slice() };
        note.value = active.note;
        tagInput.value = "";
        savedHint.textContent = "";
        setPicked(hl.color || "yellow");
        renderTags();
        popAnchor = mark || null;
        popover.classList.add("open");
        placePopover();
      },
      focusNote() {
        note.focus();
      },
      hidePopover() {
        if (!popover.classList.contains("open")) return;
        if (tagInput.value.trim()) commitTag();
        popover.classList.remove("open");
        active = null;
        popAnchor = null;
      },
      isSidebarOpen() {
        return sidebar.classList.contains("open");
      },
      toggleSidebar(force) {
        const open = force == null ? !sidebar.classList.contains("open") : force;
        sidebar.classList.toggle("open", open);
        if (open) ui.render(current);
        return open;
      },
      setAiBusy(busy, text) {
        aiBtn.disabled = !!busy;
        aiBtn.lastChild.textContent = busy ? "Highlighting…" : "Highlight key ideas";
        aiStatus.textContent = text || "";
        if (busy) ui.toggleSidebar(true);
      },
      setStatus(text, href) {
        status.textContent = text || "";
        if (href) {
          status.appendChild(doc.createTextNode(" · "));
          status.appendChild(el(doc, "a", { href, target: "_blank", rel: "noreferrer", text: "Open" }));
        }
      },
      toast(text, action) {
        clearTimeout(toastTimer);
        toastMsg.textContent = text;
        toastAction.textContent = action ? action.label : "";
        toastRun = action ? action.run : null;
        toast.classList.add("open");
        toastTimer = setTimeout(() => toast.classList.remove("open"), action ? 4500 : 2200);
      },
      async copy(text, done) {
        try {
          await navigator.clipboard.writeText(text);
          ui.toast(done || "Copied");
        } catch (_) {
          ui.toast("Clipboard blocked on this page");
        }
      },
      render(page) {
        current = page;
        const hls = page ? (page.highlights || []).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)) : [];
        pageTitle.textContent = (page && page.title) || Inkmark.pageTitle(doc);
        const n = hls.length;
        const where = Inkmark.hostname((page && page.url) || doc.documentElement.getAttribute("data-inkmark-url") || location.href);
        pageMeta.textContent = [where, n + (n === 1 ? " highlight" : " highlights")].filter(Boolean).join(" · ");
        aiClear.hidden = !hls.some((h) => h.ai);
        if (doc.activeElement !== host || shadow.activeElement !== pageNote) {
          pageNote.value = (page && page.pageNote) || "";
        }
        if (!sidebar.classList.contains("open")) return;
        body.textContent = "";
        if (!n) body.appendChild(emptyState());
        hls.forEach((h) => body.appendChild(card(h)));
      }
    };

    doc.addEventListener(
      "click",
      (e) => {
        if (e.target === host || (e.target.closest && e.target.closest(HOST_NAME))) return;
        if (!(e.target.closest && e.target.closest("mark[data-inkmark-id]"))) ui.hidePopover();
      },
      true
    );
    doc.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape") return;
        if (popover.classList.contains("open")) ui.hidePopover();
        else if (toolbar.classList.contains("open")) ui.hideToolbar();
        else if (sidebar.classList.contains("open")) ui.toggleSidebar(false);
      },
      true
    );
    let raf = 0;
    const reposition = () => {
      // Most scrolls happen with nothing open: don't schedule a frame callback for those.
      if (raf || !(toolbar.classList.contains("open") || popover.classList.contains("open"))) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        placeToolbar();
        if (popover.classList.contains("open") && popAnchor) placePopover();
      });
    };
    g.addEventListener("scroll", reposition, { capture: true, passive: true });
    g.addEventListener("resize", reposition, { passive: true });
    // Pinch-zoom pans and scales the visual viewport without firing window scroll/resize.
    if (g.visualViewport) {
      g.visualViewport.addEventListener("scroll", reposition, { passive: true });
      g.visualViewport.addEventListener("resize", reposition, { passive: true });
    }

    shadow._inkmark = ui;
    return ui;
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
