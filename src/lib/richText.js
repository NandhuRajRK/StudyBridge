function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function looksLikeHtml(value = "") {
  return /<[^>]+>/.test(String(value || ""));
}

function formatInlineMarkdown(line = "") {
  let next = escapeHtml(line);
  next = next.replace(/`([^`]+)`/g, "<code>$1</code>");
  next = next.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  next = next.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  next = next.replace(/(^|[^\*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  next = next.replace(/(^|[^_])_([^_]+)_(?!_)/g, "$1<em>$2</em>");
  next = next.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return next;
}

export function markdownToHtml(markdown = "") {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeLists();
      continue;
    }
    if (/^---+$/.test(line) || /^\*\*\*+$/.test(line)) {
      closeLists();
      html.push("<hr />");
      continue;
    }
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeLists();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${formatInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }
    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${formatInlineMarkdown(ulMatch[1])}</li>`);
      continue;
    }
    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (inUl) {
        html.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        html.push("<ol>");
        inOl = true;
      }
      html.push(`<li>${formatInlineMarkdown(olMatch[1])}</li>`);
      continue;
    }
    if (line.startsWith(">")) {
      closeLists();
      html.push(`<blockquote><p>${formatInlineMarkdown(line.replace(/^>\s?/, ""))}</p></blockquote>`);
      continue;
    }
    closeLists();
    html.push(`<p>${formatInlineMarkdown(line)}</p>`);
  }

  closeLists();
  return html.join("\n");
}

export function normalizeRichTextInput(value = "") {
  const content = String(value || "").trim();
  if (!content) return "";
  if (looksLikeHtml(content)) return content;
  return markdownToHtml(content);
}

