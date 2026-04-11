import { base44 } from "@/api/base44Client";

const truncate = (value, max = 700) => {
  if (!value) return "";
  const text = String(value).trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

const makeSourceId = (kind, index) => `${kind}-${index + 1}`;

const DEFAULT_CONTEXT_LIMITS = {
  course_limit: 5,
  topic_limit: 6,
  material_limit: 3,
  note_limit: 3,
  session_limit: 3,
  task_limit: 3,
  planner_item_limit: 8,
};

export function getContextLimits(profile = {}) {
  return {
    ...DEFAULT_CONTEXT_LIMITS,
    ...(profile.context_limits || {}),
    course_limit: profile.context_course_limit || profile.course_limit || DEFAULT_CONTEXT_LIMITS.course_limit,
    topic_limit: profile.context_topic_limit || profile.topic_limit || DEFAULT_CONTEXT_LIMITS.topic_limit,
    material_limit: profile.context_material_limit || profile.material_limit || DEFAULT_CONTEXT_LIMITS.material_limit,
    note_limit: profile.context_note_limit || profile.note_limit || DEFAULT_CONTEXT_LIMITS.note_limit,
    session_limit: profile.context_session_limit || profile.session_limit || DEFAULT_CONTEXT_LIMITS.session_limit,
    task_limit: profile.context_task_limit || profile.task_limit || DEFAULT_CONTEXT_LIMITS.task_limit,
    planner_item_limit: profile.planner_item_limit || DEFAULT_CONTEXT_LIMITS.planner_item_limit,
  };
}

export function buildProfileContext(profile = {}) {
  const lines = [
    `Student: ${profile.full_name || "Student"}`,
    profile.email ? `Email: ${profile.email}` : null,
    profile.university ? `University: ${profile.university}` : null,
    profile.major ? `Major: ${profile.major}` : null,
    profile.year ? `Academic year: ${profile.year}` : null,
    profile.daily_goal_minutes ? `Daily study goal: ${profile.daily_goal_minutes} minutes` : null,
    profile.preferred_language ? `Preferred UI language: ${profile.preferred_language}` : null,
    profile.planner_item_limit ? `Planner item limit: ${profile.planner_item_limit}` : null,
    profile.context_course_limit ? `Context course limit: ${profile.context_course_limit}` : null,
    profile.context_topic_limit ? `Context topic limit: ${profile.context_topic_limit}` : null,
    profile.context_material_limit ? `Context material limit: ${profile.context_material_limit}` : null,
    profile.context_note_limit ? `Context note limit: ${profile.context_note_limit}` : null,
    profile.context_session_limit ? `Context session limit: ${profile.context_session_limit}` : null,
    profile.context_task_limit ? `Context task limit: ${profile.context_task_limit}` : null,
  ].filter(Boolean);

  if (profile.notifications) {
    lines.push(`Notifications: ${Object.entries(profile.notifications).filter(([, enabled]) => enabled).map(([key]) => key).join(", ") || "none"}`);
  }

  return lines.join("\n");
}

function groupCourseBundle({ course, topics, materials, notes, sessions, tasks, limits }) {
  const courseTopics = topics
    .filter((topic) => topic.course_id === course.id)
    .slice(0, limits.topic_limit);

  const courseMaterials = materials
    .filter((item) => item.course_id === course.id)
    .slice(0, limits.material_limit);

  const courseNotes = notes
    .filter((item) => item.course_id === course.id)
    .slice(0, limits.note_limit);

  const courseSessions = sessions
    .filter((item) => item.course_id === course.id)
    .slice(0, limits.session_limit);

  const courseTasks = tasks
    .filter((item) => item.course_id === course.id)
    .slice(0, limits.task_limit);

  return [
    `Course: ${course.title}${course.code ? ` (${course.code})` : ""}`,
    course.exam_date ? `Exam date: ${course.exam_date}` : "Exam date: not set",
    course.overall_progress !== undefined ? `Overall progress: ${course.overall_progress}%` : null,
    courseTopics.length > 0
      ? `Topics:\n${courseTopics.map((topic) => `- ${topic.title} | status ${topic.status || "not_started"} | mastery ${topic.mastery_level || 0}% | confidence ${topic.confidence || 0}/5`).join("\n")}`
      : "Topics: none yet",
    courseMaterials.length > 0
      ? `Materials:\n${courseMaterials.map((material) => `- ${material.title} [${material.type || "material"}]: ${truncate(material.summary || material.extracted_topics?.join(", "), 240)}`).join("\n")}`
      : "Materials: none yet",
    courseNotes.length > 0
      ? `Notes:\n${courseNotes.map((note) => `- ${note.title || "Untitled"}: ${truncate(note.content, 240)}`).join("\n")}`
      : "Notes: none yet",
    courseSessions.length > 0
      ? `Recent sessions:\n${courseSessions.map((session) => `- ${session.topic_title || "Topic"}: ${session.duration_minutes || 0}m, confidence ${session.confidence_before || "?"}->${session.confidence_after || "?"}`).join("\n")}`
      : "Recent sessions: none yet",
    courseTasks.length > 0
      ? `Open tasks:\n${courseTasks.filter((task) => task.status !== "completed").map((task) => `- ${task.title}${task.topic_title ? ` (${task.topic_title})` : ""}: ${truncate(task.instructions || task.outcome, 180)}`).join("\n")}`
      : "Open tasks: none",
  ].filter(Boolean).join("\n\n");
}

export async function loadProfileContext() {
  const profile = await base44.auth.me();
  return buildProfileContext(profile);
}

export async function loadStudyContext({ course, topic }) {
  const bundle = await loadStudyContextBundle({ course, topic });
  return bundle.context;
}

export async function loadStudyContextBundle({ course, topic }) {
  const profile = await base44.auth.me();
  const limits = getContextLimits(profile);
  const filters = course?.id ? { course_id: course.id } : null;
  if (!filters) {
    return { context: "No course context selected.", sourceIds: [], limits };
  }

  const [topics, materials, notes, sessions, tasks] = await Promise.all([
    base44.entities.Topic.filter(filters, "order", 100),
    base44.entities.StudyMaterial.filter(filters, "-created_date", 20),
    base44.entities.Note.filter(filters, "-created_date", 20),
    base44.entities.StudySession.filter(filters, "-created_date", 10),
    base44.entities.Task.filter(filters, "due_date", 20),
  ]);

  const relevantMaterials = topic?.id ? materials.filter((m) => !m.topic_id || m.topic_id === topic.id) : materials;
  const relevantNotes = topic?.id ? notes.filter((n) => !n.topic_id || n.topic_id === topic.id) : notes;
  const relevantSessions = topic?.id ? sessions.filter((s) => !s.topic_id || s.topic_id === topic.id) : sessions;
  const sourceIds = ["profile", "course", "current-topic", "exam", "topics", "materials", "notes", "sessions", "tasks"];
  topics.slice(0, limits.topic_limit).forEach((_, index) => sourceIds.push(makeSourceId("topic", index)));
  relevantMaterials.slice(0, limits.material_limit).forEach((_, index) => sourceIds.push(makeSourceId("material", index)));
  relevantNotes.slice(0, limits.note_limit).forEach((_, index) => sourceIds.push(makeSourceId("note", index)));
  relevantSessions.slice(0, limits.session_limit).forEach((_, index) => sourceIds.push(makeSourceId("session", index)));
  tasks.filter((t) => t.status !== "completed").slice(0, limits.task_limit).forEach((_, index) => sourceIds.push(makeSourceId("task", index)));

  const sections = [
    `[profile] ${buildProfileContext(profile)}`,
    "",
    `[course] Course: ${course.title}${course.code ? ` (${course.code})` : ""}`,
    topic ? `[current-topic] Current topic: ${topic.title} | mastery ${topic.mastery_level || 0}% | confidence ${topic.confidence || 0}/5 | status ${topic.status || "not_started"}` : "[current-topic] Current topic: not selected",
    `[exam] ${course.exam_date ? `Exam date: ${course.exam_date}` : "Exam date: not set"}`,
    topics.length > 0
      ? `[topics] Course topics:\n${topics.slice(0, limits.topic_limit).map((t, index) => `- [${makeSourceId("topic", index)}] ${t.title} (${t.mastery_level || 0}%) | status ${t.status || "not_started"} | confidence ${t.confidence || 0}/5`).join("\n")}`
      : "[topics] Course topics: none yet",
    relevantMaterials.length > 0
      ? `[materials] Study materials:\n${relevantMaterials.slice(0, limits.material_limit).map((m, index) => `- [${makeSourceId("material", index)}] ${m.title} [${m.type || "material"}]: ${truncate(m.summary || m.extracted_topics?.join(", "), 280)}`).join("\n")}`
      : "[materials] Study materials: none yet",
    relevantNotes.length > 0
      ? `[notes] Student notes:\n${relevantNotes.slice(0, limits.note_limit).map((n, index) => `- [${makeSourceId("note", index)}] ${n.title || "Untitled"}: ${truncate(n.content, 260)}`).join("\n")}`
      : "[notes] Student notes: none yet",
    relevantSessions.length > 0
      ? `[sessions] Recent study sessions:\n${relevantSessions.slice(0, limits.session_limit).map((s, index) => `- [${makeSourceId("session", index)}] ${s.topic_title || topic?.title || "Topic"}: ${s.duration_minutes || 0}m, confidence ${s.confidence_before || "?"}->${s.confidence_after || "?"}`).join("\n")}`
      : "[sessions] Recent study sessions: none yet",
    tasks.length > 0
      ? `[tasks] Open tasks:\n${tasks.filter((t) => t.status !== "completed").slice(0, limits.task_limit).map((t, index) => `- [${makeSourceId("task", index)}] ${t.title} (${t.priority || "medium"}, due ${t.due_date || "unset"})`).join("\n")}`
      : "[tasks] Open tasks: none",
  ];

  return {
    context: sections.join("\n\n"),
    sourceIds,
    limits,
  };
}

export async function loadPlannerContext() {
  const profile = await base44.auth.me();
  const limits = getContextLimits(profile);
  const [courses, topics, materials, notes, sessions, tasks] = await Promise.all([
    base44.entities.Course.list("-created_date", 50),
    base44.entities.Topic.list("order", 300),
    base44.entities.StudyMaterial.list("-created_date", 100),
    base44.entities.Note.list("-created_date", 100),
    base44.entities.StudySession.list("-created_date", 50),
    base44.entities.Task.list("due_date", 200),
  ]);

  const activeCourses = courses.filter((course) => course.status !== "completed");
  const bundles = activeCourses.slice(0, limits.course_limit).map((course) =>
    groupCourseBundle({ course, topics, materials, notes, sessions, tasks, limits }),
  );

  return [
    buildProfileContext(profile),
    "",
    bundles.length > 0 ? bundles.join("\n\n---\n\n") : "No courses yet.",
  ].join("\n\n");
}

export async function loadProgressContext() {
  const profile = await base44.auth.me();
  const limits = getContextLimits(profile);
  const [courses, topics, sessions] = await Promise.all([
    base44.entities.Course.list("-created_date", 50),
    base44.entities.Topic.list("-mastery_level", 200),
    base44.entities.StudySession.list("-created_date", 50),
  ]);

  return [
    buildProfileContext(profile),
    "",
    `Courses tracked: ${Math.min(courses.length, limits.course_limit)} active course bundles in context`,
    `Total topics in context: ${topics.length}`,
    `Recent sessions: ${sessions.slice(0, limits.session_limit).map((s) => `${s.course_title || "Course"} / ${s.topic_title || "Topic"} (${s.duration_minutes || 0}m)`).join("; ") || "none"}`,
    profile.daily_goal_minutes ? `Weekly goal pace: ${profile.daily_goal_minutes * 7} minutes per week` : null,
  ].join("\n\n");
}

export function buildTutorPrompt({ course, topic, context, depth, history, studentText }) {
  const focus = topic
    ? `Focus on "${topic.title}" in "${course?.title || "the selected course"}".`
    : course
      ? `Focus on "${course.title}".`
      : "No course is selected, so answer as a general study tutor.";

  return `You are StudyBridge, an integrated university study companion. Use the student's actual course data below as primary context. If context is missing, say what is missing and still help.

If the profile context includes a preferred UI language, reply in that language unless the student asks for a different language.

${focus}
Depth: ${depth || "intermediate"}

StudyBridge context:
${context}

Conversation history:
${history.slice(-8).map((m) => `${m.role}: ${m.content}`).join("\n") || "No previous messages."}

Student:
${studentText}

Answer in concise markdown. Be specific to the course/topic when context exists. If you suggest actions, make them usable in StudyBridge (topics to review, tasks to create, notes to save, materials to upload).`;
}

export function buildConversationTitle(messages, fallback = "AI chat") {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content;
  if (!firstUserMessage) return fallback;
  return truncate(firstUserMessage.replace(/\s+/g, " "), 64);
}
