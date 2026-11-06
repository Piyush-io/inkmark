(function (g) {
  const Inkmark = (g.Inkmark = g.Inkmark || {});

  // Every preset except Anthropic speaks the OpenAI chat-completions dialect. The model is free text in
  // Settings; these are only starting values.
  Inkmark.AI_PROVIDERS = {
    cerebras: { label: "Cerebras", kind: "openai", base: "https://api.cerebras.ai/v1", model: "qwen-3.8-27b", keyHint: "csk-…" },
    anthropic: { label: "Anthropic (Claude)", kind: "anthropic", base: "https://api.anthropic.com", model: "claude-opus-5-5", keyHint: "sk-ant-…" },
    openai: { label: "OpenAI", kind: "openai", base: "https://api.openai.com/v1", model: "gpt-5-mini", keyHint: "sk-…" },
    gemini: { label: "Google Gemini", kind: "openai", base: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash", keyHint: "AIza…" },
    openrouter: { label: "OpenRouter", kind: "openai", base: "https://openrouter.ai/api/v1", model: "openrouter/auto", keyHint: "sk-or-…" },
    groq: { label: "Groq", kind: "openai", base: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", keyHint: "gsk_…" },
    ollama: { label: "Ollama (on this computer)", kind: "openai", base: "http://localhost:11434/v1", model: "llama3.1", keyHint: "not needed", noKey: true },
    custom: { label: "Other OpenAI-compatible", kind: "openai", base: "", model: "", keyHint: "API key" }
  };

  // What the model may call a passage, and the color each one gets on the page.
  Inkmark.AI_CATEGORIES = {
    key: { label: "Key point", color: "yellow", hint: "the central claims and conclusions" },
    evidence: { label: "Evidence", color: "sky", hint: "data, numbers, findings, examples that back a claim" },
    definition: { label: "Definition", color: "mint", hint: "terms or concepts the text defines or explains" },
    takeaway: { label: "Takeaway", color: "peach", hint: "advice, steps, implications the reader can act on" },
    caveat: { label: "Caveat", color: "rose", hint: "limits, risks, counterpoints, warnings" }
  };

  Inkmark.AI_DEFAULT_FOCUS = [
    "- The main argument or thesis, and each conclusion that supports it",
    "- Surprising facts, figures, or results",
    "- Definitions of terms the rest of the text relies on",
    "- Practical advice or decisions a reader should remember",
    "- Important caveats, limits, or disagreements"
  ].join("\n");

  // How thorough to be. A hint only: the model decides how many passages a text deserves.
  const DENSITY = {
    light: "Lean toward the essentials: what a reader must not miss.",
    normal: "Mark everything a reader would want to find again.",
    dense: "Be thorough, like study notes: mark every fact, figure, term, and point worth remembering."
  };
  const CHUNK = 40000;
  const MAX_CHARS = 160000;

  Inkmark.aiConfig = function aiConfig(s) {
    const preset = Inkmark.AI_PROVIDERS[s.aiProvider] || Inkmark.AI_PROVIDERS.cerebras;
    return {
      provider: s.aiProvider || "cerebras",
      kind: preset.kind,
      base: String(s.aiBaseUrl || preset.base || "").replace(/\/+$/, ""),
      model: String(s.aiModel || preset.model || "").trim(),
      key: String(s.aiKey || "").trim(),
      noKey: !!preset.noKey
    };
  };

  Inkmark.aiReady = function aiReady(s) {
    const c = Inkmark.aiConfig(s);
    return !!(c.base && c.model && (c.key || c.noKey));
  };

  // Firecrawl markdown → prose, so the model quotes text that exists on the page, not link syntax.
  Inkmark.markdownToText = function markdownToText(md) {
    return String(md || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
      .replace(/(\*\*|__|\*|_|`|~~)/g, "")
      .replace(/^\s*\|?[-:| ]+\|?\s*$/gm, "")
      .replace(/\|/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  Inkmark.firecrawlScrape = async function firecrawlScrape(url, key) {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success === false) {
      throw new Error("Firecrawl: " + (body.error || body.message || "HTTP " + res.status));
    }
    const data = body.data || {};
    return { markdown: data.markdown || "", title: (data.metadata && data.metadata.title) || "" };
  };

  // Splits on paragraph, then sentence boundaries so no quote is cut in half between two requests.
  Inkmark.chunkText = function chunkText(text, size) {
    size = size || CHUNK;
    const out = [];
    let rest = text;
    while (rest.length > size) {
      let cut = rest.lastIndexOf("\n\n", size);
      if (cut < size * 0.5) cut = rest.lastIndexOf(". ", size) + 1;
      if (cut < size * 0.5) cut = rest.lastIndexOf(" ", size);
      if (cut <= 0) cut = size;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut);
    }
    if (rest.trim()) out.push(rest.trim());
    return out;
  };

  function systemPrompt(focus, density) {
    const cats = Object.keys(Inkmark.AI_CATEGORIES)
      .map((id) => "- " + id + ": " + Inkmark.AI_CATEGORIES[id].hint)
      .join("\n");
    return [
      "You highlight documents for a reader, the way a careful student marks up a book with a pen: the",
      "words that carry the point, not the sentences around them.",
      "",
      "Highlight the shortest span that still makes sense on its own when read later: usually a phrase or",
      "a clause of a few words, such as a claim, a figure with what it measures, a name, a term, or a verdict.",
      "Use a full sentence only when every part of it is needed. Never highlight a whole paragraph or",
      "several sentences; if a paragraph holds several important bits, make several short highlights.",
      "There is no limit on how many highlights you make; a rich text may need many, a thin one only a few.",
      DENSITY[density] || DENSITY.normal,
      "",
      "The reader cares most about:",
      (focus || Inkmark.AI_DEFAULT_FOCUS).trim(),
      "",
      "Label each highlight with the category that fits best:",
      cats,
      "",
      "quote: copy the words exactly as they appear in the document, as one contiguous span, so it can be found",
      "on the page. Don't paraphrase, join separate passages, use ellipses, or add markdown. Navigation, ads,",
      "and other page furniture are not worth highlighting.",
      "reason: a short note on why it matters, without restating the quote.",
      "",
      'Reply with JSON only: {"highlights":[{"quote":"…","category":"key","reason":"…"}]}'
    ].join("\n");
  }

  function userPrompt(meta, text, part) {
    return [
      "Title: " + (meta.title || "Untitled"),
      meta.url ? "URL: " + meta.url : "",
      part ? "This is part " + part[0] + " of " + part[1] + " of the document. Highlight what matters in this part." : "",
      "",
      "<document>",
      text,
      "</document>"
    ]
      .filter((l, i) => l || i > 2)
      .join("\n");
  }

  const SCHEMA = {
    type: "object",
    properties: {
      highlights: {
        type: "array",
        items: {
          type: "object",
          properties: {
            quote: { type: "string" },
            category: { type: "string", enum: Object.keys(Inkmark.AI_CATEGORIES) },
            reason: { type: "string" }
          },
          required: ["quote", "category", "reason"],
          additionalProperties: false
        }
      }
    },
    required: ["highlights"],
    additionalProperties: false
  };

  // Models sometimes wrap JSON in prose or code fences despite instructions.
  Inkmark.parseAiJson = function parseAiJson(raw) {
    const s = String(raw || "").trim();
    const tryParse = (t) => {
      try {
        return JSON.parse(t);
      } catch {
        return null;
      }
    };
    let data = tryParse(s);
    if (!data) {
      const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) data = tryParse(fenced[1]);
    }
    if (!data) {
      const a = s.indexOf("{");
      const b = s.lastIndexOf("}");
      if (a !== -1 && b > a) data = tryParse(s.slice(a, b + 1));
    }
    let list = Array.isArray(data) ? data : data && Array.isArray(data.highlights) ? data.highlights : null;
    if (!list) {
      // A long answer can stop at the provider's output limit mid-array: keep every complete highlight.
      list = (s.match(/\{[^{}]*"quote"[^{}]*\}/g) || []).map(tryParse).filter(Boolean);
    }
    if (!list.length && !(data && Array.isArray(data.highlights))) throw new Error("The model did not return highlights as JSON.");
    return list
      .filter((h) => h && typeof h.quote === "string" && h.quote.trim())
      // A paragraph-sized pick defeats the point of highlighting; the prompt asks for phrases.
      .filter((h) => (h.quote.match(/\S+/g) || []).length <= 45)
      .map((h) => ({
        quote: h.quote.replace(/\s+/g, " ").trim(),
        category: Inkmark.AI_CATEGORIES[h.category] ? h.category : "key",
        reason: String(h.reason || "").trim().slice(0, 200)
      }));
  };

  async function errorText(res) {
    const body = await res.text().catch(() => "");
    let msg = body;
    try {
      const j = JSON.parse(body);
      msg = (j.error && (j.error.message || j.error)) || j.message || body;
    } catch {}
    if (res.status === 401 || res.status === 403) return "The AI provider rejected the API key (" + res.status + ").";
    if (res.status === 404) return "Model or endpoint not found (404). Check the model name and base URL. " + String(msg).slice(0, 160);
    if (res.status === 429) return "The AI provider is rate limiting or out of credit (429).";
    return "AI request failed (" + res.status + "): " + String(msg).slice(0, 240);
  }

  async function callAnthropic(c, system, user) {
    const res = await fetch(c.base + "/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": c.key,
        "anthropic-version": "2026-10-21",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: c.model,
        max_tokens: 16000,
        system,
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: user }]
      })
    });
    if (!res.ok) throw new Error(await errorText(res));
    const body = await res.json();
    if (body.stop_reason === "refusal") throw new Error("The model declined to read this page.");
    if (body.stop_reason === "max_tokens") throw new Error("The model ran out of room. Try a lighter density.");
    return (body.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  }

  async function callOpenAi(c, system, user, jsonMode) {
    const headers = { "Content-Type": "application/json" };
    if (c.key) headers.Authorization = "Bearer " + c.key;
    if (c.provider === "openrouter") {
      headers["HTTP-Referer"] = "https://github.com/inkmark";
      headers["X-Title"] = "Inkmark";
    }
    const body = {
      model: c.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    };
    if (jsonMode) body.response_format = { type: "json_object" };
    const res = await fetch(c.base + "/chat/completions", { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      // Some OpenAI-compatible servers reject response_format; the prompt already asks for JSON.
      if (jsonMode && res.status === 400) return callOpenAi(c, system, user, false);
      throw new Error(await errorText(res));
    }
    const data = await res.json();
    const choice = data.choices && data.choices[0];
    if (!choice) throw new Error("The AI provider returned no answer.");
    const content = choice.message && choice.message.content;
    return Array.isArray(content) ? content.map((p) => p.text || "").join("") : content || "";
  }

  Inkmark.aiComplete = function aiComplete(c, system, user) {
    return c.kind === "anthropic" ? callAnthropic(c, system, user) : callOpenAi(c, system, user, true);
  };

  // Returns passages to highlight. `text` is what the page shows; quotes are matched back to it later.
  Inkmark.aiPickHighlights = async function aiPickHighlights(settings, meta, text) {
    const c = Inkmark.aiConfig(settings);
    if (!Inkmark.aiReady(settings)) throw new Error("Add an AI provider and key in Settings first.");
    const full = String(text || "").trim();
    if (full.length < 200) throw new Error("Not enough text on this page to highlight.");
    const used = full.slice(0, MAX_CHARS);
    const chunks = Inkmark.chunkText(used);
    const system = systemPrompt(settings.aiFocus, settings.aiDensity);
    const results = [];
    // Two requests at a time keeps long PDFs quick without tripping per-minute rate limits.
    for (let i = 0; i < chunks.length; i += 2) {
      const batch = chunks.slice(i, i + 2).map((chunk, j) => {
        const part = chunks.length > 1 ? [i + j + 1, chunks.length] : null;
        return Inkmark.aiComplete(c, system, userPrompt(meta, chunk, part)).then(Inkmark.parseAiJson);
      });
      (await Promise.all(batch)).forEach((list) => results.push.apply(results, list));
    }
    const seen = new Set();
    const items = results.filter((h) => {
      const k = h.quote.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return {
      items,
      model: c.model,
      provider: c.provider,
      analyzedChars: used.length,
      totalChars: full.length
    };
  };

  Inkmark.aiTest = async function aiTest(settings) {
    const c = Inkmark.aiConfig(settings);
    if (!Inkmark.aiReady(settings)) throw new Error("Pick a provider, model, and key first.");
    const raw = await Inkmark.aiComplete(
      c,
      'Reply with JSON only: {"highlights":[{"quote":"…","category":"key","reason":"…"}]}',
      "Highlight the single most important sentence.\n<document>\nWater boils at 100 °C at sea level. At higher altitudes it boils at a lower temperature because air pressure is lower.\n</document>"
    );
    const items = Inkmark.parseAiJson(raw);
    return { model: c.model, sample: items[0] ? items[0].quote : "" };
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
