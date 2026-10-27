(function () {
  "use strict";
  const MAX_CHARS = 100000;
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "IFRAME", "OBJECT", "EMBED",
    "CANVAS", "VIDEO", "AUDIO", "SVG", "BUTTON", "SELECT", "INPUT", "TEXTAREA", "NAV", "FOOTER",
    "ASIDE", "DIALOG", "HEAD", "META", "LINK"]);
  const JUNK_RE = /(^|[\s_-])(cookies?|consent|gdpr|banner|adverts?|ads?|sponsor(ed)?|popup|modal|newsletter|subscribe|share|sharing|social|comments?|related|sidebar|breadcrumbs?|promo|paywall)([\s_-]|$)/i;
  const BLOCK_TAGS = new Set(["P", "SECTION", "ARTICLE", "MAIN", "HEADER", "FIGURE", "FIGCAPTION",
    "DETAILS", "SUMMARY", "ADDRESS", "DL", "DT", "DD"]);

  const textOf = (el) => (el.innerText !== undefined ? el.innerText : el.textContent) || "";
  let selMode = false;
  let root = null;

  function isHidden(el) {
    if (el.hidden || el.getAttribute("aria-hidden") === "true") return true;
    if (selMode) return false;
    try {
      const cs = window.getComputedStyle(el);
      return cs.display === "none" || cs.visibility === "hidden";
    } catch (e) {
      return false;
    }
  }

  function skip(el) {
    const tag = el.tagName.toUpperCase();
    if (SKIP_TAGS.has(tag)) return true;
    if (isHidden(el)) return true;
    const role = el.getAttribute("role");
    if (role && /^(navigation|banner|complementary|contentinfo|dialog|alertdialog|search)$/.test(role)) return true;
    if (!selMode && el !== root && !["ARTICLE", "MAIN", "BODY", "HTML"].includes(tag)) {
      const cls = (typeof el.className === "string" ? el.className : "") + " " + (el.id || "");
      if (JUNK_RE.test(cls)) return true;
    }
    return false;
  }

  const kidsOf = (node) => Array.from(node.childNodes).map(conv).join("");

  function wrap(mark, t) {
    const m = t.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!m[2] || /\n/.test(m[2])) return t;
    return m[1] + mark + m[2] + mark + m[3];
  }

  function block(node, sep) {
    const t = kidsOf(node).trim();
    return t ? sep + t + sep : "";
  }

  function safeHref(raw) {
    if (!raw || raw.startsWith("#") || /^\s*javascript:/i.test(raw)) return null;
    let href;
    try { href = new URL(raw, document.baseURI).href; } catch (e) { return null; }
    if (!/^(https?:|mailto:)/i.test(href)) return null;
    return href.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/</g, "%3C").replace(/>/g, "%3E").replace(/\s/g, "%20");
  }

  function convTable(node) {
    const flat = () => block(node, "\n\n");
    if (node.querySelector("table")) return flat();
    const rows = Array.from(node.rows || []);
    if (!rows.length) return "";
    const cells = rows.map((r) => Array.from(r.cells).map((c) =>
      kidsOf(c).replace(/\s*\n\s*/g, " ").trim().replace(/\|/g, "\\|")));
    const w = Math.max(...cells.map((r) => r.length));
    if (w < 2 || cells.some((r) => r.some((c) => c.length > 300))) return flat();
    const pad = (r) => r.concat(Array(w - r.length).fill(""));
    const lines = [
      "| " + pad(cells[0]).join(" | ") + " |",
      "| " + Array(w).fill("---").join(" | ") + " |",
      ...cells.slice(1).map((r) => "| " + pad(r).join(" | ") + " |"),
    ];
    return "\n\n" + lines.join("\n") + "\n\n";
  }

  function conv(node) {
    if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, " ").replace(/[<\[\]]/g, "\\$&");
    if (node.nodeType !== 1 || skip(node)) return "";
    const tag = node.tagName.toUpperCase();

    if (/^H[1-6]$/.test(tag)) {
      const t = kidsOf(node).replace(/\s*\n\s*/g, " ").trim();
      return t ? `\n\n${"#".repeat(Math.min(+tag[1] + 2, 6))} ${t}\n\n` : "";
    }
    if (BLOCK_TAGS.has(tag)) return block(node, "\n\n");

    switch (tag) {
      case "DIV": return block(node, "\n");
      case "BR": return "  \n";
      case "HR": return "\n\n---\n\n";
      case "STRONG": case "B": return wrap("**", kidsOf(node));
      case "EM": case "I": return wrap("*", kidsOf(node));
      case "A": {
        const t = kidsOf(node).trim().replace(/\n+/g, " ");
        if (!t) return "";
        const href = safeHref(node.getAttribute("href"));
        return href ? `[${t}](${href})` : t;
      }
      case "CODE": case "KBD": case "SAMP": {
        const t = (node.textContent || "").replace(/\s+/g, " ").trim();
        if (!t) return "";
        const f = "`".repeat(Math.max(1, ...(t.match(/`+/g) || []).map((r) => r.length + 1)));
        return f + (t.includes("`") ? " " + t + " " : t) + f;
      }
      case "PRE": {
        const code = (node.textContent || "").replace(/\n+$/, "");
        if (!code.trim()) return "";
        const fence = "`".repeat(Math.max(3, ...(code.match(/`+/g) || []).map((r) => r.length + 1)));
        return `\n\n${fence}\n${code}\n${fence}\n\n`;
      }
      case "BLOCKQUOTE": {
        const t = kidsOf(node).trim();
        return t ? "\n\n" + t.split("\n").map((l) => (l ? "> " + l : ">")).join("\n") + "\n\n" : "";
      }
      case "UL": case "OL": {
        const ordered = tag === "OL";
        let i = parseInt(node.getAttribute("start") || "1", 10) || 1;
        const items = [];
        for (const li of node.children) {
          if (li.tagName.toUpperCase() !== "LI" || skip(li)) continue;
          const body = kidsOf(li).trim().replace(/\n{2,}/g, "\n");
          if (!body) continue;
          const [first, ...rest] = body.split("\n");
          items.push((ordered ? `${i++}. ` : "- ") + first +
            (rest.length ? "\n" + rest.map((l) => "    " + l).join("\n") : ""));
        }
        return items.length ? "\n\n" + items.join("\n") + "\n\n" : "";
      }
      case "TABLE": return convTable(node);
      case "TR": return "\n" + kidsOf(node) + "\n";
      case "TD": case "TH": return kidsOf(node) + " ";
      case "IMG": {
        const alt = (node.getAttribute("alt") || "").replace(/[\[\]*\n]/g, " ").trim();
        return alt ? `*[obraz: ${alt}]*` : "";
      }
      default: return kidsOf(node);
    }
  }

  function pickRoot() {
    let best = null, bestLen = 0;
    for (const el of document.querySelectorAll("article, main, [role=main]")) {
      if (isHidden(el)) continue;
      const l = textOf(el).trim().length;
      if (l > bestLen) { best = el; bestLen = l; }
    }
    if (best && bestLen > 500) return best;

    const scores = new Map();
    document.querySelectorAll("p, pre, td").forEach((p) => {
      const len = textOf(p).trim().length;
      if (len < 80) return;
      let el = p.parentElement, lvl = 0;
      while (el && el !== document.body && lvl < 3) {
        scores.set(el, (scores.get(el) || 0) + len / (lvl === 0 ? 1 : lvl * 2));
        el = el.parentElement;
        lvl++;
      }
    });
    let top = null, topScore = 0;
    scores.forEach((s, el) => { if (s > topScore) { top = el; topScore = s; } });
    return top && topScore > 300 ? top : document.body;
  }

  function clean(s) {
    return s.replace(/\r/g, "").replace(/\u00a0/g, " ").replace(/^[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  }

  const selection = window.getSelection();
  let md = "";
  if (selection && selection.rangeCount && selection.toString().trim().length > 0) {
    selMode = true;
    for (let i = 0; i < selection.rangeCount; i++) {
      md += "\n\n" + Array.from(selection.getRangeAt(i).cloneContents().childNodes).map(conv).join("");
    }
  } else {
    root = pickRoot();
    md = conv(root);
  }
  md = clean(md);
  if (md.length < 40) return { markdown: "", usedSelection: selMode, truncated: false };

  let truncated = false;
  if (md.length > MAX_CHARS) {
    let cut = md.lastIndexOf("\n\n", MAX_CHARS);
    if (cut < MAX_CHARS * 0.5) cut = MAX_CHARS;
    md = md.slice(0, cut).trimEnd() + "\n\n*[Treść obcięta – przekroczono limit " + MAX_CHARS + " znaków]*";
    truncated = true;
  }
  return { markdown: md, usedSelection: selMode, truncated };
})();
