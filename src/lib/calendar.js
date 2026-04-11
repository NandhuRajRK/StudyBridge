import { format } from "date-fns";

export function getDateKey(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd");
}

export function dateKeyToDate(dateKey) {
  if (!dateKey) return null;
  const date = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getTaskDateKey(task) {
  return getDateKey(task?.due_date);
}

function icalEscape(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function pad(value) {
  return String(value).padStart(2, "0");
}

export function formatDateKey(dateKey, pattern = "MMM d") {
  const date = dateKeyToDate(dateKey);
  if (!date) return "";
  return format(date, pattern);
}

export function buildTaskCalendarMeta(task, course, topic) {
  const dateKey = getTaskDateKey(task);
  const title = [
    task?.title || "Study task",
    course?.title ? `${course.title}` : null,
  ].filter(Boolean).join(" - ");

  const details = [
    task?.instructions ? `Instructions: ${task.instructions}` : null,
    task?.outcome ? `Done when: ${task.outcome}` : null,
    course?.title ? `Course: ${course.title}` : null,
    course?.code ? `Course code: ${course.code}` : null,
    topic?.title ? `Topic: ${topic.title}` : task?.topic_title ? `Topic: ${task.topic_title}` : null,
    task?.estimated_minutes ? `Estimated time: ${task.estimated_minutes} minutes` : null,
  ].filter(Boolean).join("\n");

  const dueDate = dateKey ? dateKeyToDate(dateKey) : null;
  const nextDateKey = dueDate
    ? getDateKey(new Date(dueDate.getTime() + 24 * 60 * 60 * 1000))
    : "";

  return {
    title,
    details,
    dateKey,
    nextDateKey,
  };
}

export function buildGoogleCalendarUrl({ title, details, dateKey, nextDateKey }) {
  if (!dateKey) return "";
  const params = new URLSearchParams();
  params.set("action", "TEMPLATE");
  params.set("text", title);
  params.set("details", details);
  params.set("dates", `${dateKey.replace(/-/g, "")}/${(nextDateKey || dateKey).replace(/-/g, "")}`);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildIcsEvent({ title, details, dateKey, nextDateKey }) {
  if (!dateKey) return "";
  const compactDate = dateKey.replace(/-/g, "");
  const compactEndDate = (nextDateKey || dateKey).replace(/-/g, "");
  const uid = `${compactDate}-${Math.random().toString(36).slice(2, 10)}@studybridge`;
  const stamp = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");

  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `SUMMARY:${icalEscape(title)}`,
    `DESCRIPTION:${icalEscape(details)}`,
    `DTSTART;VALUE=DATE:${compactDate}`,
    `DTEND;VALUE=DATE:${compactEndDate}`,
    "END:VEVENT",
  ].join("\r\n");
}

export function buildIcsForEvents(events = []) {
  const body = events.map(buildIcsEvent).filter(Boolean).join("\r\n");
  if (!body) return "";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//StudyBridge//Study Planner//EN",
    "CALSCALE:GREGORIAN",
    body,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function buildIcsForTask(meta) {
  return buildIcsForEvents([meta]);
}

export function downloadTextFile(filename, text, mimeType = "text/plain;charset=utf-8") {
  if (typeof document === "undefined") return;
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function openGoogleCalendarTask(task, course, topic) {
  const meta = buildTaskCalendarMeta(task, course, topic);
  const url = buildGoogleCalendarUrl(meta);
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function downloadTaskIcs(task, course, topic) {
  const meta = buildTaskCalendarMeta(task, course, topic);
  const ics = buildIcsForTask(meta);
  if (!ics) return;
  const slug = (meta.title || "study-task").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "study-task";
  downloadTextFile(`${slug}.ics`, ics, "text/calendar;charset=utf-8");
}
