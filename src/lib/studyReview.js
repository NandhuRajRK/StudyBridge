import addDays from "date-fns/addDays";
import { getDateKey } from "@/lib/calendar";

const PRIORITY_ORDER = {
  high: 0,
  medium: 1,
  low: 2,
};

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clampConfidence(value, fallback = 3) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return Math.max(1, Math.min(5, fallback));
  return Math.max(1, Math.min(5, parsed));
}

function toDateKey(value) {
  if (!value) return "";
  return getDateKey(value);
}

function toTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : Number.POSITIVE_INFINITY;
}

export function normalizeConfidence(value, fallback = 3) {
  return clampConfidence(value, fallback);
}

export function normalizeSourceIds(values = [], fallback = []) {
  const combined = [...normalizeArray(values), ...normalizeArray(fallback)];
  return [...new Set(combined.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function reviewDelayDays({ result = "incorrect", confidence = 3, shaky = false } = {}) {
  const normalized = normalizeConfidence(confidence, 3);

  if (shaky || result !== "correct") {
    if (normalized <= 2) return 1;
    if (normalized === 3) return 1;
    if (normalized === 4) return 2;
    return 3;
  }

  if (normalized >= 5) return 14;
  if (normalized === 4) return 7;
  if (normalized === 3) return 3;
  return 1;
}

export function reviewStageForDays(days) {
  const normalizedDays = Math.max(0, Math.round(Number(days) || 0));
  if (normalizedDays <= 1) return 1;
  if (normalizedDays <= 3) return 2;
  if (normalizedDays <= 7) return 3;
  if (normalizedDays <= 14) return 4;
  return 5;
}

export function makeReviewKey({ courseId, topicId, kind, sourceId, label }) {
  return [
    slugify(courseId || "course"),
    slugify(topicId || "topic"),
    slugify(kind || "review"),
    slugify(sourceId || label || "item"),
  ].join(":");
}

export function buildReviewTaskPayload({
  course,
  topic,
  kind = "quiz",
  label,
  sourceId,
  question,
  answer,
  explanation,
  front,
  back,
  result = "incorrect",
  shaky = false,
  confidenceBefore,
  confidenceAfter,
  sourceIds = [],
  sourceCatalog = [],
  dueDays = null,
  dueDate = null,
  estimatedMinutes = 15,
  priority = "high",
  reviewSource = "study_workbench",
  sessionId = null,
}) {
  const normalizedBefore = normalizeConfidence(confidenceBefore, 3);
  const normalizedAfter = normalizeConfidence(confidenceAfter, normalizedBefore);
  const normalizedSourceIds = normalizeSourceIds(sourceIds);
  const resolvedDays = Math.max(
    1,
    Number.isFinite(dueDays)
      ? Math.round(dueDays)
      : reviewDelayDays({ result, confidence: normalizedAfter, shaky }),
  );
  const resolvedDate = dueDate
    ? new Date(dueDate)
    : addDays(new Date(), resolvedDays);
  const dueIso = Number.isNaN(resolvedDate.getTime()) ? addDays(new Date(), resolvedDays).toISOString() : resolvedDate.toISOString();
  const reviewKey = makeReviewKey({
    courseId: course?.id,
    topicId: topic?.id,
    kind,
    sourceId,
    label: label || question || front || topic?.title || course?.title,
  });
  const sourceLabel = sourceCatalog.find((item) => item.id === sourceId)?.label || label || question || front || topic?.title || course?.title || "Review item";
  const titleBase = label || question || front || topic?.title || course?.title || "Review item";
  const title = `Review: ${titleBase}`.slice(0, 120);
  const instructionsByKind = {
    flashcard: "Recall the answer from the front of the card, then compare your answer against the back and explain the gap.",
    quiz: "Re-answer the question from memory, then explain why the correct answer is right and why the other options are wrong.",
    concept: "Revisit the concept from memory, write the definition in your own words, and add one example.",
    session_confidence: "Revisit the topic, answer the core concept from memory, and focus on the weakest subtopic from the session.",
  };

  return {
    title,
    instructions:
      instructionsByKind[kind] ||
      "Revisit the item from memory, then check the source material and write the correction in your own words.",
    outcome: "You can answer the item correctly from memory and explain the reasoning without notes.",
    type: "review",
    priority: resolvedDays <= 2 ? "high" : priority,
    due_date: dueIso,
    estimated_minutes: estimatedMinutes,
    course_title: course?.title,
    topic_title: topic?.title,
    course_id: course?.id,
    topic_id: topic?.id,
    source: reviewSource,
    status: "todo",
    review_key: reviewKey,
    review_kind: kind,
    review_stage: reviewStageForDays(resolvedDays),
    review_interval_days: resolvedDays,
    review_prompt: question || front || label || titleBase,
    review_question: question || "",
    review_answer: answer || "",
    review_explanation: explanation || "",
    review_card_front: front || "",
    review_card_back: back || "",
    review_source_id: sourceId || "",
    review_source_label: sourceLabel,
    review_source_ids: normalizedSourceIds,
    review_source_catalog: sourceCatalog,
    confidence_before: normalizedBefore,
    confidence_after: normalizedAfter,
    review_attempt_count: 0,
    review_last_result: result,
    review_last_confidence: normalizedAfter,
    review_last_reviewed_at: "",
    session_id: sessionId,
  };
}

export function buildReviewOutcomePlan({
  task = null,
  topic = null,
  outcome = "incorrect",
  confidence = 3,
  reviewedAt = new Date(),
} = {}) {
  const reviewedDate = reviewedAt instanceof Date ? reviewedAt : new Date(reviewedAt);
  const reviewedIso = Number.isNaN(reviewedDate.getTime()) ? new Date().toISOString() : reviewedDate.toISOString();
  const normalizedTopicMastery = Number.isFinite(Number(topic?.mastery_level)) ? Number(topic.mastery_level) : 0;
  const normalizedTopicConfidence = normalizeConfidence(topic?.confidence ?? 3, 3);
  const normalizedConfidence = normalizeConfidence(confidence, normalizedTopicConfidence);
  const isCorrect = String(outcome || "").toLowerCase() === "correct";
  const shaky = !isCorrect || normalizedConfidence <= 3;
  const nextIntervalDays = reviewDelayDays({ result: isCorrect ? "correct" : "incorrect", confidence: normalizedConfidence, shaky });
  const nextDueDate = addDays(reviewedDate, nextIntervalDays).toISOString();

  const kind = String(task?.review_kind || task?.kind || "").toLowerCase();
  const kindScale = kind === "session_confidence" ? 0.65 : kind === "concept" ? 0.9 : kind === "flashcard" ? 1 : kind === "quiz" ? 1.1 : 0.85;
  const baseMasteryDelta = isCorrect
    ? (normalizedConfidence >= 4 ? 6 : normalizedConfidence === 3 ? 4 : 2)
    : (normalizedConfidence >= 4 ? -4 : normalizedConfidence === 3 ? -3 : -2);
  const masteryDelta = Math.round(baseMasteryDelta * kindScale);
  const nextMastery = Math.max(0, Math.min(100, normalizedTopicMastery + masteryDelta));
  const confidenceDelta = isCorrect
    ? (normalizedConfidence >= 4 ? 1 : 0)
    : (normalizedConfidence >= 4 ? -2 : -1);
  const nextConfidence = normalizeConfidence(normalizedTopicConfidence + confidenceDelta, normalizedTopicConfidence);
  const nextStatus = nextMastery >= 80 ? "mastered" : nextMastery > 0 ? "in_progress" : "not_started";
  const nextStage = reviewStageForDays(nextIntervalDays);
  const nextPriority = nextIntervalDays <= 2 ? "high" : nextIntervalDays <= 7 ? "medium" : "low";
  const nextAttempts = Math.max(0, Number.parseInt(task?.review_attempt_count, 10) || 0) + 1;

  return {
    reviewedAt: reviewedIso,
    isCorrect,
    confidence: normalizedConfidence,
    nextIntervalDays,
    nextDueDate,
    nextStage,
    nextPriority,
    nextMastery,
    nextConfidence,
    nextStatus,
    masteryDelta,
    confidenceDelta,
    shaky,
    taskUpdates: {
      due_date: nextDueDate,
      review_interval_days: nextIntervalDays,
      review_stage: nextStage,
      review_last_result: isCorrect ? "correct" : "incorrect",
      review_last_confidence: normalizedConfidence,
      review_last_reviewed_at: reviewedIso,
      review_attempt_count: nextAttempts,
      status: "todo",
      priority: nextPriority,
    },
    topicUpdates: {
      mastery_level: nextMastery,
      confidence: nextConfidence,
      status: nextStatus,
      last_studied: reviewedIso,
    },
  };
}

export function isReviewTask(task) {
  if (!task) return false;
  return Boolean(task.review_key || task.type === "review" || task.source === "study_review");
}

export function findReviewTaskByKey(tasks = [], reviewKey) {
  if (!reviewKey) return null;
  return tasks.find((task) => isReviewTask(task) && task.review_key === reviewKey) || null;
}

export function getReviewTasks(tasks = []) {
  return tasks.filter((task) => isReviewTask(task) && task.status !== "completed");
}

export function sortReviewTasks(tasks = []) {
  return [...tasks].sort((a, b) => {
    const timeDiff = toTime(a.due_date) - toTime(b.due_date);
    if (timeDiff !== 0) return timeDiff;

    const priorityDiff = (PRIORITY_ORDER[a.priority] ?? PRIORITY_ORDER.medium) - (PRIORITY_ORDER[b.priority] ?? PRIORITY_ORDER.medium);
    if (priorityDiff !== 0) return priorityDiff;

    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

export function shouldPersistReviewTask(existingTasks = [], payload = {}) {
  const reviewKey = payload.review_key;
  if (!reviewKey) return true;

  const existing = findReviewTaskByKey(existingTasks, reviewKey);
  if (!existing) return true;

  const existingKey = toDateKey(existing.due_date);
  const nextKey = toDateKey(payload.due_date);
  if (!existingKey || !nextKey) return true;
  return nextKey < existingKey;
}
