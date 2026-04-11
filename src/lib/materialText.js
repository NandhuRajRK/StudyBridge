import JSZip from "jszip";

const DEFAULT_CHUNK_SIZE = 900;
const DEFAULT_CHUNK_OVERLAP = 120;

export function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripXmlTags(xml, { textTagPattern, lineBreakPattern, slideBreakPattern } = {}) {
  const source = String(xml || "");
  if (!source) return "";

  let text = source;
  if (lineBreakPattern) {
    text = text.replace(lineBreakPattern, "\n");
  }
  if (slideBreakPattern) {
    text = text.replace(slideBreakPattern, "\n\n");
  }

  const lines = [];
  const regex = textTagPattern || /<[^>]*:t[^>]*>([\s\S]*?)<\/[^>]*:t>/g;
  let match;
  while ((match = regex.exec(text))) {
    const value = decodeXmlEntities(match[1]).replace(/<[^>]+>/g, "");
    if (value.trim()) lines.push(value);
  }

  return normalizeText(lines.join(" "));
}

async function readZipFiles(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  return zip;
}

async function extractDocxText(arrayBuffer) {
  const zip = await readZipFiles(arrayBuffer);
  // DOCX stores the readable body, headers, footers, and notes as OOXML XML parts.
  const entries = Object.keys(zip.files)
    .filter((name) => /^word\/(document|footnotes|endnotes|header\d*|footer\d*)\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b));

  const sections = [];
  for (const entry of entries) {
    const xml = await zip.files[entry].async("string");
    const text = stripXmlTags(xml, {
      lineBreakPattern: /<\/w:p>|<w:br[^>]*\/>|<w:tab[^>]*\/>/g,
      textTagPattern: /<w:t[^>]*>([\s\S]*?)<\/w:t>/g,
    });
    if (text) sections.push(text);
  }

  return normalizeText(sections.join("\n\n"));
}

async function extractPptxText(arrayBuffer) {
  const zip = await readZipFiles(arrayBuffer);
  // PPTX stores each slide as XML; reading those slide parts gives us the real slide text.
  const entries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const left = Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0);
      const right = Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0);
      return left - right;
    });

  const sections = [];
  for (const entry of entries) {
    const xml = await zip.files[entry].async("string");
    const text = stripXmlTags(xml, {
      lineBreakPattern: /<\/a:p>|<a:br[^>]*\/>|<a:tab[^>]*\/>/g,
      textTagPattern: /<a:t[^>]*>([\s\S]*?)<\/a:t>/g,
    });
    if (text) sections.push(text);
  }

  return normalizeText(sections.join("\n\n"));
}

export function chunkText(text, { chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP } = {}) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const paras = normalized.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const chunks = [];
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = "";
  };

  for (const paragraph of paras) {
    if ((current.length + paragraph.length + 2) <= chunkSize) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
      continue;
    }

    flush();

    if (paragraph.length <= chunkSize) {
      current = paragraph;
      continue;
    }

    const sentences = paragraph.split(/(?<=[.!?])\s+/);
    let sentenceBuffer = "";
    for (const sentence of sentences) {
      if ((sentenceBuffer.length + sentence.length + 1) <= chunkSize) {
        sentenceBuffer = sentenceBuffer ? `${sentenceBuffer} ${sentence}` : sentence;
        continue;
      }

      if (sentenceBuffer.trim()) chunks.push(sentenceBuffer.trim());
      if (sentence.length <= chunkSize) {
        sentenceBuffer = sentence;
      } else {
        const words = sentence.split(/\s+/);
        let wordBuffer = "";
        for (const word of words) {
          if ((wordBuffer.length + word.length + 1) <= chunkSize) {
            wordBuffer = wordBuffer ? `${wordBuffer} ${word}` : word;
            continue;
          }

          if (wordBuffer.trim()) chunks.push(wordBuffer.trim());
          wordBuffer = word;
        }
        sentenceBuffer = wordBuffer;
      }
    }
    current = sentenceBuffer;
  }

  flush();

  if (chunks.length <= 1 || overlap <= 0) {
    return chunks;
  }

  // Keep a small tail/head overlap so the retrieval step can still see context boundaries.
  const overlapped = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const previous = index > 0 ? chunks[index - 1].slice(-overlap) : "";
    const currentChunk = index < chunks.length ? chunks[index] : "";
    const next = index < chunks.length - 1 ? chunks[index + 1].slice(0, overlap) : "";
    const merged = normalizeText([previous, currentChunk, next].filter(Boolean).join(" "));
    overlapped.push(merged || currentChunk);
  }

  return overlapped.filter(Boolean);
}

function scoreChunk(chunk, terms = []) {
  const text = normalizeText(chunk).toLowerCase();
  if (!text) return 0;

  return terms.reduce((score, term) => {
    const token = normalizeText(term).toLowerCase();
    if (!token) return score;
    if (text.includes(token)) return score + 4;
    const parts = token.split(/\s+/).filter(Boolean);
    const partHits = parts.reduce((count, part) => count + (text.includes(part) ? 1 : 0), 0);
    return score + partHits;
  }, 0);
}

export function rankChunks(chunks = [], terms = []) {
  return [...chunks]
    .map((chunk, index) => ({
      index,
      text: normalizeText(chunk),
      score: scoreChunk(chunk, terms),
    }))
    .filter((item) => item.text)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function decodePdfText(bytes) {
  const latin1 = new TextDecoder("latin1", { fatal: false }).decode(bytes);
  const lines = [];

  const stringMatches = [...latin1.matchAll(/\((?:\\.|[^\\)]){1,500}\)\s*Tj/g)];
  for (const match of stringMatches) {
    const raw = match[0].replace(/\s*Tj$/, "");
    const unwrapped = raw.slice(1, -1)
      .replace(/\\([\\()])/g, "$1")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t");
    if (unwrapped.trim()) lines.push(unwrapped);
  }

  const arrayMatches = [...latin1.matchAll(/\[((?:.|\n){1,1200}?)\]\s*TJ/g)];
  for (const match of arrayMatches) {
    const segment = match[1];
    const strings = [...segment.matchAll(/\((?:\\.|[^\\)]){1,500}\)/g)]
      .map((item) => item[0].slice(1, -1).replace(/\\([\\()])/g, "$1"));
    if (strings.length > 0) {
      lines.push(strings.join(" "));
    }
  }

  return normalizeText(lines.join("\n"));
}

export async function extractUploadText(file) {
  if (!file) return "";

  const name = String(file.name || "").toLowerCase();
  const mime = String(file.type || "").toLowerCase();
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const textDecoder = new TextDecoder("utf-8", { fatal: false });

  if (mime.startsWith("text/") || /\.(txt|md|csv|json|log|csv|xml|html?|svg|yaml|yml)$/i.test(name)) {
    return normalizeText(textDecoder.decode(bytes));
  }

  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(name)) {
    try {
      return await extractDocxText(arrayBuffer);
    } catch {
      return normalizeText(textDecoder.decode(bytes));
    }
  }

  if (mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" || /\.pptx$/i.test(name)) {
    try {
      return await extractPptxText(arrayBuffer);
    } catch {
      return normalizeText(textDecoder.decode(bytes));
    }
  }

  if (mime === "application/pdf" || /\.pdf$/i.test(name)) {
    const decoded = decodePdfText(bytes);
    if (decoded) return decoded;
    return normalizeText(textDecoder.decode(bytes));
  }

  return "";
}

export function buildMaterialChunks(text, { maxChunkChars = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP, maxChunks = 8 } = {}) {
  return chunkText(text, { chunkSize: maxChunkChars, overlap })
    .slice(0, maxChunks)
    .map((chunk, index) => ({
      id: `passage-${index + 1}`,
      text: chunk,
    }));
}
