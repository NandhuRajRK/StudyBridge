import { format } from "date-fns";
import { buildIcsForEvents, buildTaskCalendarMeta, downloadTextFile } from "@/lib/calendar";

function escapeMarkdown(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function slugify(value, fallback = "export") {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

export function downloadMarkdown(filename, content) {
  downloadTextFile(filename, `${escapeMarkdown(content)}\n`, "text/markdown;charset=utf-8");
}

export function downloadOpml(filename, title, nodes = []) {
  const outlineXml = (node) => {
    const childNodes = nodes.filter((item) => item.parentId === node.id);
    const childXml = childNodes.map(outlineXml).join("\n");
    return `<outline text="${escapeXml(node.title)}"${node.note ? ` note="${escapeXml(node.note)}"` : ""}>${childXml ? `\n${childXml}\n` : ""}</outline>`;
  };

  const roots = nodes.filter((node) => !node.parentId);
  const body = roots.map(outlineXml).join("\n");
  const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${escapeXml(title || "Mind map")}</title>
    <dateCreated>${format(new Date(), "EEE, dd MMM yyyy HH:mm:ss 'GMT'")}</dateCreated>
  </head>
  <body>
${body ? body.split("\n").map((line) => `    ${line}`).join("\n") : ""}
  </body>
</opml>
`;
  downloadTextFile(`${slugify(title)}.opml`, opml, "text/x-opml+xml;charset=utf-8");
}

export function downloadMindMapMarkdown(filename, title, nodes = []) {
  const roots = nodes.filter((node) => !node.parentId);
  const childrenByParent = new Map();
  nodes.forEach((node) => {
    const parent = node.parentId || null;
    if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
    childrenByParent.get(parent).push(node);
  });

  const lines = [`# ${title || "Mind map"}`, ""];
  const walk = (node, depth = 0) => {
    lines.push(`${"#".repeat(Math.min(depth + 2, 6))} ${node.title}`);
    if (node.note) lines.push("", node.note, "");
    const children = childrenByParent.get(node.id) || [];
    children.forEach((child) => walk(child, depth + 1));
  };

  roots.forEach((root) => walk(root, 0));
  downloadMarkdown(filename, lines.join("\n"));
}

export function downloadNotesMarkdown(filename, note) {
  const content = [
    `# ${note?.title || "Note"}`,
    "",
    note?.course_title ? `- Course: ${note.course_title}` : null,
    note?.topic_title ? `- Topic: ${note.topic_title}` : null,
    note?.created_date ? `- Created: ${new Date(note.created_date).toLocaleString()}` : null,
    "",
    note?.content || "",
  ].filter(Boolean).join("\n");
  downloadMarkdown(filename, content);
}

export function downloadFlashcardsAnki(filename, cards = [], deckName = "StudyBridge") {
  const rows = cards.map((card) => {
    const front = String(card.front || "").replace(/\t/g, " ").replace(/\r?\n/g, "<br>");
    const back = String(card.back || "").replace(/\t/g, " ").replace(/\r?\n/g, "<br>");
    return `${front}\t${back}\t${deckName}`;
  });
  downloadTextFile(filename, rows.join("\n"), "text/tab-separated-values;charset=utf-8");
}

export function buildTaskIcsForSelection(task, course, topic) {
  const meta = buildTaskCalendarMeta(task, course, topic);
  const ics = buildIcsForEvents([meta]);
  return { meta, ics };
}

