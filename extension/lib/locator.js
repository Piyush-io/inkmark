(function (g) {
  const Inkmark = (g.Inkmark = g.Inkmark || {});
  const SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1 };

  function acceptText(node) {
    if (!node || node.nodeType !== 3 || !node.nodeValue) return false;
    const parent = node.parentElement;
    if (!parent) return false;
    const tag = parent.tagName;
    if (tag === "INKMARK-HOST") return false;
    if (SKIP[tag]) return false;
    return true;
  }

  // No acceptNode callback: calling into JS for every node is the slow part of a TreeWalker.
  function walkTextNodes(root) {
    const nodes = [];
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (acceptText(n)) nodes.push(n);
    return nodes;
  }

  function collapseText(str) {
    return str.replace(/\s+/g, " ").trim();
  }

  Inkmark.serializeRange = function serializeRange(range) {
    const exact = collapseText(range.toString());
    if (!exact) return null;
    const sc = range.startContainer;
    const ec = range.endContainer;
    const before = sc.nodeType === 3 ? sc.nodeValue.slice(Math.max(0, range.startOffset - 32), range.startOffset) : "";
    const after = ec.nodeType === 3 ? ec.nodeValue.slice(range.endOffset, range.endOffset + 32) : "";
    return { exact, prefix: collapseText(before), suffix: collapseText(after) };
  };

  // Pieces are joined once at the end. Reading the last character of a string that is still being
  // appended to forces V8 to flatten it on every node, which made this quadratic on long pages.
  function buildIndex(root) {
    const nodes = walkTextNodes(root);
    const pieces = [];
    const parts = [];
    let length = 0;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const text = collapseText(node.nodeValue);
      if (!text) continue;
      // collapseText trims, so every piece after the first needs a separating space.
      if (length) {
        parts.push(" ");
        length += 1;
      }
      parts.push(text);
      pieces.push({ node: node, collapsedStart: length, collapsedEnd: length + text.length });
      length += text.length;
    }
    return { pieces: pieces, collapsed: parts.join("") };
  }

  // Position of the first piece whose end is at or after `offset`, or -1 (pieces are sorted, non-overlapping).
  function pieceAt(pieces, offset) {
    let lo = 0;
    let hi = pieces.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pieces[mid].collapsedEnd < offset) lo = mid + 1;
      else hi = mid;
    }
    const p = pieces[lo];
    return p && offset >= p.collapsedStart && offset <= p.collapsedEnd ? lo : -1;
  }

  function rawOffsetFromCollapsed(node, collapsedOff) {
    const raw = node.nodeValue;
    let c = 0;
    let i = 0;
    let prevSpace = true;
    while (i < raw.length && c < collapsedOff) {
      const space = /\s/.test(raw[i]);
      if (space) {
        if (!prevSpace) {
          c += 1;
          prevSpace = true;
        }
      } else {
        c += 1;
        prevSpace = false;
      }
      i += 1;
    }
    return i;
  }

  function rangeFromCollapsed(index, start, length) {
    const end = start + length;
    let startNode = null;
    let startOff = 0;
    let endNode = null;
    let endOff = 0;
    const pieces = index.pieces;
    const firstAt = pieceAt(pieces, start);
    if (firstAt !== -1) {
      const first = pieces[firstAt];
      startNode = first.node;
      startOff = rawOffsetFromCollapsed(first.node, start - first.collapsedStart);
    }
    // The end may sit exactly on a boundary; the original scan picked the later piece in that case.
    let lastAt = pieceAt(pieces, end);
    if (lastAt !== -1) {
      const next = pieces[lastAt + 1];
      if (next && end >= next.collapsedStart && end <= next.collapsedEnd) lastAt += 1;
      const last = pieces[lastAt];
      endNode = last.node;
      endOff = rawOffsetFromCollapsed(last.node, end - last.collapsedStart);
    }
    if (!startNode || !endNode) return null;
    const range = startNode.ownerDocument.createRange();
    try {
      range.setStart(startNode, Math.min(startOff, startNode.nodeValue.length));
      range.setEnd(endNode, Math.min(endOff, endNode.nodeValue.length));
    } catch {
      return null;
    }
    return range;
  }

  function bestIndex(hay, exact, prefix, suffix) {
    let from = 0;
    let best = -1;
    let bestScore = -1;
    for (;;) {
      const at = hay.indexOf(exact, from);
      if (at === -1) break;
      let score = 1;
      if (prefix && hay.slice(Math.max(0, at - prefix.length), at).endsWith(prefix)) score += 2;
      if (suffix && hay.slice(at + exact.length, at + exact.length + suffix.length).startsWith(suffix)) score += 2;
      if (score > bestScore) {
        bestScore = score;
        best = at;
        if (score >= 5) break;
      }
      from = at + 1;
    }
    return best;
  }

  // Letters and digits only, lowercased, with each kept character's position in the source string.
  // Quotes from an AI model or Firecrawl differ from the DOM in punctuation, curly quotes, spacing and
  // PDF line breaks; comparing on this skeleton lines them up again.
  const ALNUM = /[\p{L}\p{N}]/u;
  function skeleton(str) {
    const chars = [];
    const map = [];
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ALNUM.test(ch)) {
        chars.push(ch.toLowerCase());
        map.push(i);
      }
    }
    return { text: chars.join(""), map };
  }

  // [start, end) of `quote` inside `hay` ignoring punctuation, case and whitespace, or null.
  Inkmark.fuzzyFind = function fuzzyFind(hay, quote, hayIndex) {
    const q = skeleton(String(quote || "")).text;
    if (q.length < 10) return null;
    const h = hayIndex || skeleton(hay);
    const at = h.text.indexOf(q);
    if (at === -1) return null;
    return [h.map[at], h.map[at + q.length - 1] + 1];
  };
  Inkmark.textSkeleton = skeleton;

  Inkmark.findRange = function findRange(selector, root, index) {
    if (!selector || !selector.exact) return null;
    const exact = collapseText(selector.exact);
    if (!exact) return null;
    const idx = index || buildIndex(root);
    let at = bestIndex(idx.collapsed, exact, selector.prefix || "", selector.suffix || "");
    if (at === -1) {
      if (!idx.skeleton) idx.skeleton = skeleton(idx.collapsed);
      const loose = Inkmark.fuzzyFind(idx.collapsed, exact, idx.skeleton);
      if (loose) return rangeFromCollapsed(idx, loose[0], loose[1] - loose[0]);
    }
    if (at === -1) {
      const tokens = exact.split(" ");
      if (tokens.length < 4) return null;
      at = idx.collapsed.indexOf(tokens.slice(0, 8).join(" "));
      if (at === -1) return null;
      return rangeFromCollapsed(idx, at, Math.min(exact.length, idx.collapsed.length - at));
    }
    return rangeFromCollapsed(idx, at, exact.length);
  };

  Inkmark.buildTextIndex = buildIndex;
  Inkmark._walkTextNodes = walkTextNodes;
  Inkmark._acceptText = acceptText;
})(typeof globalThis !== "undefined" ? globalThis : this);
