(function (g) {
  const Inkmark = (g.Inkmark = g.Inkmark || {});
  const NO_WRAP = {
    UL: 1,
    OL: 1,
    TABLE: 1,
    THEAD: 1,
    TBODY: 1,
    TFOOT: 1,
    TR: 1,
    DL: 1,
    SELECT: 1,
    COLGROUP: 1
  };

  function makeMark(doc, id, color) {
    const mark = doc.createElement("mark");
    mark.setAttribute("data-inkmark-id", id);
    mark.setAttribute("data-inkmark-color", color);
    mark.style.backgroundColor = Inkmark.colorOf(color).bg;
    mark.style.color = "inherit";
    return mark;
  }

  function normalizeSlice(text, start, end) {
    if (start < 0) start = 0;
    if (end > text.length) end = text.length;
    let ateStartNl = false;
    let ateEndNl = false;
    while (start < end) {
      const c = text.charCodeAt(start);
      if (c === 10 || c === 13) {
        start += 1;
        ateStartNl = true;
      } else break;
    }
    while (end > start) {
      const c = text.charCodeAt(end - 1);
      if (c === 10 || c === 13) {
        end -= 1;
        ateEndNl = true;
      } else break;
    }
    if (ateStartNl) {
      while (start < end && (text.charCodeAt(start) === 32 || text.charCodeAt(start) === 9)) start += 1;
    }
    if (ateEndNl) {
      while (end > start && (text.charCodeAt(end - 1) === 32 || text.charCodeAt(end - 1) === 9)) end -= 1;
    }
    if (start >= end) return null;
    const slice = text.slice(start, end);
    if (/^[\t ]*$/.test(slice) && (ateStartNl || ateEndNl)) return null;
    if (/^[\n\r\t ]*$/.test(slice) && /[\n\r]/.test(slice)) return null;
    return [start, end];
  }

  function parentForbidsWrap(node) {
    const parent = node.parentElement;
    if (!parent) return true;
    if (NO_WRAP[parent.tagName]) return true;
    if (parent.closest && parent.closest("inkmark-host,[data-inkmark-ui]")) return true;
    return false;
  }

  function nodeTouchesRange(node, range) {
    try {
      const a = range.comparePoint(node, 0);
      const b = range.comparePoint(node, node.nodeValue.length);
      return a < 1 && b > -1;
    } catch {
      return false;
    }
  }

  function sliceOffsets(node, range) {
    let from = 0;
    let to = node.nodeValue.length;
    if (range.startContainer === node) from = range.startOffset;
    if (range.endContainer === node) to = range.endOffset;
    return normalizeSlice(node.nodeValue, from, to);
  }

  function wrapNodeSlice(node, start, end, id, color) {
    if (parentForbidsWrap(node)) return null;
    if (node.parentElement && node.parentElement.closest('mark[data-inkmark-id="' + id + '"]')) return null;
    const text = node.nodeValue;
    const doc = node.ownerDocument;
    if (start < 0) start = 0;
    if (end > text.length) end = text.length;
    if (start >= end) return null;
    const mark = makeMark(doc, id, color);
    if (start === 0 && end === text.length) {
      node.parentNode.replaceChild(mark, node);
      mark.appendChild(node);
      return mark;
    }
    const mid = node.splitText(start);
    const restLen = end - start;
    if (restLen < mid.nodeValue.length) mid.splitText(restLen);
    mid.parentNode.replaceChild(mark, mid);
    mark.appendChild(mid);
    return mark;
  }

  // Walks only from the range's start to its end, not every text node under the common ancestor
  // (which, for a multi-paragraph selection, can be the whole article).
  function textNodesInRange(range) {
    const root = range.commonAncestorContainer;
    const el = root.nodeType === 1 ? root : root.parentNode;
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const sc = range.startContainer;
    let n;
    if (sc.nodeType === 3) {
      walker.currentNode = sc;
      n = sc;
    } else {
      const child = sc.childNodes[range.startOffset];
      if (child && child.nodeType === 3) {
        walker.currentNode = child;
        n = child;
      } else {
        if (child) walker.currentNode = child;
        else if (sc !== el) walker.currentNode = sc;
        n = walker.nextNode();
      }
    }
    const inside = [];
    for (; n; n = walker.nextNode()) {
      let pos;
      try {
        pos = range.comparePoint(n, 0);
      } catch {
        break;
      }
      if (pos === 1) break;
      if (!Inkmark._acceptText(n) || parentForbidsWrap(n)) continue;
      if (!nodeTouchesRange(n, range)) continue;
      if (!sliceOffsets(n, range)) continue;
      inside.push(n);
    }
    return inside;
  }

  Inkmark.wrapRange = function wrapRange(range, id, color) {
    if (!range || range.collapsed) return [];
    const nodes = textNodesInRange(range);
    const marks = [];
    for (let i = nodes.length - 1; i >= 0; i--) {
      const slice = sliceOffsets(nodes[i], range);
      if (!slice) continue;
      const m = wrapNodeSlice(nodes[i], slice[0], slice[1], id, color);
      if (m) marks.push(m);
    }
    return marks;
  };

  Inkmark.unwrapHighlight = function unwrapHighlight(id, root) {
    const marks = root.querySelectorAll('mark[data-inkmark-id="' + id + '"]');
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });
  };

  Inkmark.recolorHighlight = function recolorHighlight(id, color, root) {
    const c = Inkmark.colorOf(color);
    root.querySelectorAll('mark[data-inkmark-id="' + id + '"]').forEach((mark) => {
      mark.setAttribute("data-inkmark-color", color);
      mark.style.backgroundColor = c.bg;
    });
  };

  Inkmark.scrollToHighlight = function scrollToHighlight(id, root) {
    const el = root.querySelector('mark[data-inkmark-id="' + id + '"]');
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("inkmark-flash");
    setTimeout(() => el.classList.remove("inkmark-flash"), 1200);
  };

  Inkmark.applyHighlight = function applyHighlight(hl, root) {
    if (root.querySelector('mark[data-inkmark-id="' + hl.id + '"]')) return true;
    const range = Inkmark.findRange(hl.selector, root);
    if (!range) return false;
    Inkmark.wrapRange(range, hl.id, hl.color || "yellow");
    return true;
  };

  Inkmark.applyHighlights = function applyHighlights(highlights, root) {
    if (!highlights || !highlights.length) return;
    const pending = [];
    for (let i = 0; i < highlights.length; i++) {
      const h = highlights[i];
      if (!h || !h.selector) continue;
      if (root.querySelector('mark[data-inkmark-id="' + h.id + '"]')) continue;
      pending.push(h);
    }
    if (!pending.length) return;
    const index = Inkmark.buildTextIndex(root);
    const jobs = [];
    for (let i = 0; i < pending.length; i++) {
      const range = Inkmark.findRange(pending[i].selector, root, index);
      if (range) jobs.push({ h: pending[i], range: range });
    }
    jobs.sort(function (a, b) {
      return a.range.compareBoundaryPoints(Range.START_TO_START, b.range);
    });
    for (let i = jobs.length - 1; i >= 0; i--) {
      Inkmark.wrapRange(jobs[i].range, jobs[i].h.id, jobs[i].h.color || "yellow");
    }
  };

  Inkmark.selectionRange = function selectionRange(win) {
    const sel = (win || window).getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const text = range.toString().replace(/\s+/g, " ").trim();
    if (!text) return null;
    if (range.commonAncestorContainer.nodeType === 1) {
      const el = range.commonAncestorContainer;
      if (el.closest && el.closest("inkmark-host,[data-inkmark-ui]")) return null;
    } else if (range.commonAncestorContainer.parentElement) {
      if (range.commonAncestorContainer.parentElement.closest("inkmark-host,[data-inkmark-ui]")) {
        return null;
      }
    }
    return range;
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
