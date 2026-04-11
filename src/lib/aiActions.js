import { base44 } from "@/api/base44Client";
import { buildTutorPrompt, loadStudyContextBundle } from "@/lib/aiContext";

const MAX_AGENT_ACTIONS_PER_TURN = 5;
const MAX_DETERMINISTIC_TOPICS_PER_TURN = 10;
const MAX_STUDY_GUIDE_SECTIONS = 12;
const MAX_MINDMAP_NODES = 24;
const MAX_QUIZ_QUESTIONS = 8;

const tutorSchema = {
  type: "object",
  properties: {
    reply: { type: "string" },
    grounding: { type: "array", items: { type: "string" } },
    missing_context: { type: "array", items: { type: "string" } },
    next_step: { type: "string" },
  },
};

const actionSchema = {
  type: "object",
  properties: {
    reply: { type: "string" },
    grounding: { type: "array", items: { type: "string" } },
    next_step: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          title: { type: "string" },
          content: { type: "string" },
          description: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          items: { type: "array", items: { type: "string" } },
          priority: { type: "string" },
          task_type: { type: "string" },
          days_from_now: { type: "number" },
          estimated_minutes: { type: "number" },
          difficulty: { type: "string" },
          material_type: { type: "string" },
          key_concepts: { type: "array", items: { type: "string" } },
          nodes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                parentId: { type: "string" },
                title: { type: "string" },
                note: { type: "string" },
                color: { type: "string" },
              },
            },
          },
          sections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                content: { type: "string" },
              },
            },
          },
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                options: { type: "array", items: { type: "string" } },
                correct: { type: "string" },
                explanation: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};

function buildTutorOutputPrompt({ course, topic, context, depth, history, studentText, sourceIds }) {
  return `${buildTutorPrompt({ course, topic, context, depth, history, studentText, sourceIds })}

Return strictly valid JSON with:
- reply: the final student-facing answer in concise markdown
- grounding: only source ids from the allowed list that you actually used
- missing_context: what is missing if the answer is limited by context
- next_step: the best next action for the student

Allowed grounding ids:
${sourceIds.length > 0 ? sourceIds.join(", ") : "none"}

You may also operate StudyBridge when the student explicitly asks you to create, add, save, summarize into, or plan something.

Available actions:
- create_note: Create a note for the selected course/topic. Use for "summarize this into notes", "save notes", "add a note".
- create_topic: Create one topic. Use for "add this topic" or "add topics".
- create_task: Create a planner task. Use for "add a task", "remind me to study", "make a study plan item".
- create_study_guide: Create a structured study guide. Use for "make a study guide".
- create_mindmap: Create a mindmap structure. Use for "make a mindmap", "visualize this as a map", or "show me the connections".
- create_material: Create a metadata-only study material/reference from chat content. Use only when the user asks to save something as a material/resource and no file upload is needed.
- create_quiz: Create a practice quiz with multiple-choice questions. Use for "create a practice quiz", "quiz me", or "make questions".

Action rules:
- Only emit actions when the student clearly asks you to modify StudyBridge data.
- If the student asks for a practice quiz, quiz, conversion questions, or practice questions, use create_quiz. Do not use create_task.
- For create_quiz, include 4-8 questions. Each question needs question, 4 options, correct, and explanation.
- Do not pretend to upload or read files. If a file is needed, tell the student uploads need a file.
- If the request is ambiguous, return no actions and ask a clarification in reply.
- If multiple topics/tasks are requested, emit multiple actions.
- Put all user-facing text in reply. Return strictly valid JSON.`;
}

const normalizeArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

function capText(value, max = 4000) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function capItems(items, max = 12) {
  return normalizeArray(items).slice(0, max);
}

function sanitizeAction(action) {
  if (!action || typeof action !== "object") return null;

  return {
    ...action,
    type: typeof action.type === "string" ? action.type.trim() : "",
    title: capText(typeof action.title === "string" ? action.title : "", 180),
    content: capText(typeof action.content === "string" ? action.content : "", 8000),
    description: capText(typeof action.description === "string" ? action.description : "", 4000),
    tags: capItems(action.tags, 8).map((tag) => capText(String(tag), 40)),
    items: capItems(action.items, 12).map((item) => capText(String(item), 120)),
    priority: typeof action.priority === "string" ? action.priority.trim() : undefined,
    task_type: typeof action.task_type === "string" ? action.task_type.trim() : undefined,
    days_from_now: Number.isFinite(action.days_from_now) ? Math.max(0, Math.min(90, Math.round(action.days_from_now))) : undefined,
    estimated_minutes: Number.isFinite(action.estimated_minutes) ? Math.max(5, Math.min(600, Math.round(action.estimated_minutes))) : undefined,
    difficulty: typeof action.difficulty === "string" ? action.difficulty.trim() : undefined,
    material_type: typeof action.material_type === "string" ? action.material_type.trim() : undefined,
    key_concepts: capItems(action.key_concepts, 12).map((item) => capText(String(item), 120)),
    sections: capItems(action.sections, MAX_STUDY_GUIDE_SECTIONS)
      .map((section) => ({
        title: capText(section?.title || "", 180),
        content: capText(section?.content || "", 2500),
      }))
      .filter((section) => section.title || section.content),
    nodes: capItems(action.nodes, MAX_MINDMAP_NODES)
      .map((node) => ({
        id: capText(node?.id || "", 80),
        parentId: capText(node?.parentId || "", 80),
        title: capText(node?.title || "", 180),
        note: capText(node?.note || "", 800),
        color: capText(node?.color || "", 40),
      }))
      .filter((node) => node.title),
    questions: capItems(action.questions, MAX_QUIZ_QUESTIONS)
      .map((question) => ({
        question: capText(question?.question || "", 500),
        options: capItems(question?.options, 4).map((option) => capText(String(option), 180)),
        correct: capText(question?.correct || "", 180),
        explanation: capText(question?.explanation || "", 800),
      }))
      .filter((question) => question.question && question.options.length >= 2 && question.correct),
  };
}

function looksLikeCourseStartRequest(text) {
  return /\b(learn|study|teach|start|begin|go through)\b/i.test(text) && /\b(course|class|subject|this)\b/i.test(text);
}

function buildCourseStartReply({ course, topic, context }) {
  const focus = topic?.title || course?.title || "this course";
  return `I can help you learn ${focus}. Here is the practical way to start:

1. Pick one topic from the course and we will do a focused study session.
2. Upload or add any syllabus, slides, notes, or assignments so I can ground answers in your real material.
3. Ask me to create StudyBridge items when you want the platform updated, for example: "add these as topics", "summarize this into notes", or "make tasks for this week".

What I know right now:

${context}

Tell me the first topic you want to learn, or ask me to create a topic list for this course.`;
}

function normalizeGrounding(grounding, allowedIds = []) {
  const allowed = new Set(allowedIds);
  return normalizeArray(grounding)
    .map((id) => String(id).trim())
    .filter((id) => id && allowed.has(id))
    .slice(0, 6);
}

function formatGroundingFooter({ grounding = [], nextStep = "", missingContext = [] }) {
  const sections = [];
  if (grounding.length > 0) {
    sections.push(`**Grounding**: ${grounding.join(", ")}`);
  }
  if (missingContext.length > 0) {
    sections.push(`**Missing context**: ${missingContext.join("; ")}`);
  }
  if (nextStep) {
    sections.push(`**Next step**: ${nextStep}`);
  }
  return sections.length > 0 ? `\n\n${sections.join("\n")}` : "";
}

function buildFallbackReply({ course, topic, context, studentText }) {
  if (looksLikeCourseStartRequest(studentText)) {
    return buildCourseStartReply({ course, topic, context });
  }

  return `I can help with that, but I need a more specific next step.

For example, ask:
- "explain the first topic"
- "add these as topics: ..."
- "summarize this into notes"
- "make me a study plan for this course"

Current context:

${context}`;
}

function extractListItems(text) {
  const afterColon = text.includes(":") ? text.slice(text.indexOf(":") + 1) : text;
  return afterColon
    .split(/\n|,|;/)
    .map((item) => item.replace(/^[-*\d.\s]+/, "").trim())
    .filter((item) => item.length > 1);
}

function wantsExplicitTopicCreation(text) {
  return /\b(add|create|make)\b/i.test(text) && /\btopic|topics\b/i.test(text);
}

function wantsExplicitNoteCreation(text) {
  return /\b(save|add|create|summari[sz]e|turn)\b/i.test(text) && /\b(note|notes)\b/i.test(text);
}

function wantsStudyBridgeAction(text) {
  return /\b(add|create|make|save|summari[sz]e|turn|plan|remind)\b/i.test(text) &&
    /\b(topic|topics|note|notes|task|tasks|guide|material|resource|planner|flashcard|quiz|mindmap|mind\s*map)\b/i.test(text);
}

function buildAgentPrompt({ course, topic, context, depth, history, studentText, sourceIds = [] }) {
  return `${buildTutorOutputPrompt({ course, topic, context, depth, history, studentText, sourceIds })}

Action rules:
- Only emit actions when the student clearly asks you to modify StudyBridge data.
- If the student asks for a practice quiz, quiz, conversion questions, or practice questions, use create_quiz. Do not use create_task.
- For create_quiz, include 4-8 questions. Each question needs question, 4 options, correct, and explanation.
- Do not pretend to upload or read files. If a file is needed, tell the student uploads need a file.
- If the request is ambiguous, return no actions and ask a clarification in reply.
- If multiple topics/tasks are requested, emit multiple actions.
- Put all user-facing text in reply. Return strictly valid JSON.`;
}

function hasExplicitList(text) {
  return text.includes(":") || text.includes("\n") || text.includes(",") || text.includes(";");
}

function isLowQualityReply(reply) {
  if (typeof reply !== "string") return true;
  const text = reply.trim();
  if (!text) return true;
  if (/^i handled that request\.?$/i.test(text)) return true;
  if (/^\{/.test(text)) return true;
  if (text.length < 20 && text.split(/\s+/).length < 4) return true;

  const chars = text.replace(/\s/g, "");
  if (!chars) return true;
  const normalChars = chars.match(/[a-zA-Z0-9.,;:!?'"()[\]#%/\\-]/g)?.length || 0;
  return normalChars / chars.length < 0.75;
}

function isClarificationFallback(reply) {
  return typeof reply === "string" && /need a more specific next step/i.test(reply);
}

function buildActionReply({ course, actionResults, rawReply }) {
  const successful = actionResults.filter((item) => item.ok);
  const failed = actionResults.filter((item) => !item.ok);

  const summary = actionResults
    .map((item) => `- ${item.ok ? "Done" : "Failed"}: ${item.message}`)
    .join("\n");
  const quizDetails = actionResults
    .filter((item) => item.ok && item.label === "quiz" && item.details?.length)
    .map((item) => item.details.map((question, index) => {
      const options = question.options.map(option => `  - ${option}`).join("\n");
      return `${index + 1}. ${question.question}\n${options}\n  Answer: ${question.correct}${question.explanation ? `\n  Why: ${question.explanation}` : ""}`;
    }).join("\n\n"))
    .join("\n\n");
  const detailsBlock = quizDetails ? `\n\n**Practice quiz**\n${quizDetails}` : "";

  if (successful.length > 0 && (isLowQualityReply(rawReply) || isClarificationFallback(rawReply))) {
    return `I updated ${course?.title || "StudyBridge"}.\n\n**StudyBridge actions**\n${summary}${detailsBlock}\n\nNext, pick one item and start working through it.`;
  }

  if (failed.length === actionResults.length) {
    return `${rawReply || "I could not complete that update."}\n\n**StudyBridge actions**\n${summary}`;
  }

  return `${rawReply}\n\n**StudyBridge actions**\n${summary}${detailsBlock}`;
}

async function runDeterministicActions({ course, topic, context, studentText, sessionId, sourceIds = [] }) {
  if (!course?.id) return null;
  const grounding = normalizeGrounding(["course", "current-topic", "topics", "materials", "notes", "sessions", "tasks"], sourceIds);

  if (wantsExplicitTopicCreation(studentText) && hasExplicitList(studentText)) {
    const items = extractListItems(studentText)
      .filter((item) => !/\b(add|create|make)\b/i.test(item) || item.length > 25)
      .slice(0, MAX_DETERMINISTIC_TOPICS_PER_TURN);

    if (items.length > 0) {
      const actionResults = [];
      for (const item of items) {
        actionResults.push(await executeAction({ type: "create_topic", title: capText(item, 180) }, { course, topic, sessionId }));
      }
      const skipped = extractListItems(studentText).length - items.length;
      const skippedNotice = skipped > 0 ? `\nThe safety guard skipped ${skipped} extra item${skipped === 1 ? "" : "s"}. Send smaller batches if you want the rest.` : "";
      return {
        reply: `I added those topics to ${course.title}.\n\n**StudyBridge actions**\n${actionResults.map((item) => `- ${item.ok ? "Done" : "Failed"}: ${item.message}`).join("\n")}${skippedNotice}${formatGroundingFooter({ grounding, nextStep: `Open ${course.title} and review the new topics.` })}`,
        actionResults,
        grounding,
      };
    }
  }

  if (wantsExplicitNoteCreation(studentText) && /this|chat|conversation|all of this|above/i.test(studentText)) {
    const action = {
      type: "create_note",
      title: `${topic?.title || course.title} AI notes`,
      content: capText(context, 8000),
      tags: ["ai-generated"],
    };
    const actionResults = [await executeAction(action, { course, topic, sessionId })];
    return {
      reply: `I saved the current StudyBridge context into a note.\n\n**StudyBridge actions**\n${actionResults.map((item) => `- ${item.ok ? "Done" : "Failed"}: ${item.message}`).join("\n")}${formatGroundingFooter({ grounding, nextStep: "Open Library to review the new note." })}`,
      actionResults,
      grounding,
    };
  }

  return null;
}

function actionNeedsCourse(action) {
  return ["create_note", "create_topic", "create_task", "create_study_guide", "create_mindmap", "create_material", "create_quiz"].includes(action.type);
}

async function executeAction(action, { course, topic, sessionId }) {
  if (actionNeedsCourse(action) && !course?.id) {
    return { ok: false, label: action.type, message: "No course selected." };
  }

  if (action.type === "create_note") {
    if (!action.content && !action.description) {
      return { ok: false, label: "note", message: "Note content was empty." };
    }
    const note = await base44.entities.Note.create({
      course_id: course.id,
      topic_id: topic?.id,
      session_id: sessionId,
      title: action.title || `AI note - ${new Date().toLocaleDateString()}`,
      content: action.content || action.description || "",
      tags: normalizeArray(action.tags),
    });
    return { ok: true, label: "note", message: `Created note: ${note.title}` };
  }

  if (action.type === "create_topic") {
    if (!action.title && !action.content) {
      return { ok: false, label: "topic", message: "Topic title was empty." };
    }
    const topicRow = await base44.entities.Topic.create({
      course_id: course.id,
      title: action.title || action.content,
      description: action.description || action.content || "",
      source: "ai_agent",
    });
    return { ok: true, label: "topic", message: `Created topic: ${topicRow.title}` };
  }

  if (action.type === "create_task") {
    if (!action.title && !action.content) {
      return { ok: false, label: "task", message: "Task title was empty." };
    }
    const dueDate = Number.isFinite(action.days_from_now)
      ? new Date(Date.now() + action.days_from_now * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    const task = await base44.entities.Task.create({
      course_id: course.id,
      topic_id: topic?.id,
      title: action.title || action.content,
      type: action.task_type || "study",
      priority: action.priority || "medium",
      due_date: dueDate,
      estimated_minutes: action.estimated_minutes || 30,
      status: "todo",
    });
    return { ok: true, label: "task", message: `Created task: ${task.title}` };
  }

  if (action.type === "create_study_guide") {
    if (!action.title && !topic?.title && !course?.title) {
      return { ok: false, label: "study guide", message: "Study guide title was empty." };
    }
    const guide = await base44.entities.StudyGuide.create({
      course_id: course.id,
      topic_id: topic?.id,
      title: action.title || `${topic?.title || course.title} study guide`,
      difficulty: action.difficulty || "intermediate",
      key_concepts: normalizeArray(action.key_concepts),
      sections: normalizeArray(action.sections),
      source: "ai_agent",
    });
    return { ok: true, label: "study guide", message: `Created study guide: ${guide.title}` };
  }

  if (action.type === "create_mindmap") {
    const nodes = normalizeArray(action.nodes).filter((node) => node?.title);
    if (nodes.length === 0) {
      return { ok: false, label: "mindmap", message: "Mindmap nodes were empty." };
    }

    const mindmap = await base44.entities.StudyGuide.create({
      course_id: course.id,
      topic_id: topic?.id,
      title: action.title || `${topic?.title || course.title} mind map`,
      difficulty: action.difficulty || "custom",
      key_concepts: normalizeArray(action.key_concepts),
      sections: nodes,
      source: "mindmap",
    });

    return { ok: true, label: "mindmap", message: `Created mindmap: ${mindmap.title}` };
  }

  if (action.type === "create_material") {
    if (!action.title && !action.content) {
      return { ok: false, label: "material", message: "Material title was empty." };
    }
    const material = await base44.entities.StudyMaterial.create({
      course_id: course.id,
      topic_id: topic?.id,
      title: action.title || "AI-created material reference",
      type: action.material_type || "notes",
      status: "processed",
      summary: action.content || action.description || "",
      extracted_topics: normalizeArray(action.key_concepts?.length > 0 ? action.key_concepts : action.items),
      source: "ai_agent",
    });
    return { ok: true, label: "material", message: `Created material reference: ${material.title}` };
  }

  if (action.type === "create_quiz") {
    const questions = normalizeArray(action.questions).filter(q => q.question && q.options?.length >= 2 && q.correct);
    if (questions.length === 0) {
      return { ok: false, label: "quiz", message: "Quiz questions were empty." };
    }

    const quiz = await base44.entities.Quiz.create({
      course_id: course.id,
      topic_id: topic?.id,
      title: action.title || `${topic?.title || course.title} practice quiz`,
      description: action.description || action.content || "",
      question_count: questions.length,
      source: "ai_agent",
    });

    for (const [index, question] of questions.entries()) {
      await base44.entities.QuizQuestion.create({
        course_id: course.id,
        topic_id: topic?.id,
        quiz_id: quiz.id,
        question: question.question,
        options: question.options,
        correct: question.correct,
        explanation: question.explanation || "",
        order: index,
      });
    }

    return {
      ok: true,
      label: "quiz",
      message: `Created quiz: ${quiz.title} (${questions.length} questions)`,
      details: questions,
    };
  }

  return { ok: false, label: action.type || "unknown", message: "Unsupported action." };
}

export async function runStudyAgent({ course, topic, context, contextBundle, depth, history, studentText, sessionId }) {
  const groundedContext = contextBundle?.context || context || "";
  const sourceIds = contextBundle?.sourceIds || [];

  const deterministicResult = await runDeterministicActions({ course, topic, context: groundedContext, studentText, sessionId, sourceIds });
  if (deterministicResult) return deterministicResult;

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: buildAgentPrompt({ course, topic, context: groundedContext, depth, history, studentText, sourceIds }),
    response_json_schema: actionSchema,
  });

  const actions = Array.isArray(result?.actions) ? result.actions : [];
  const sanitizedActions = actions.map(sanitizeAction).filter(Boolean).slice(0, MAX_AGENT_ACTIONS_PER_TURN);
  const skippedActions = Math.max(0, actions.length - sanitizedActions.length);
  const actionResults = [];

  for (const action of sanitizedActions) {
    try {
      actionResults.push(await executeAction(action, { course, topic, sessionId }));
    } catch (error) {
      actionResults.push({
        ok: false,
        label: action.type || "action",
        message: error.message || "Action failed.",
      });
    }
  }

  const rawReply = typeof result?.reply === "string" && result.reply.trim()
    ? result.reply.trim()
    : buildFallbackReply({ course, topic, context: groundedContext, studentText });
  const grounding = normalizeGrounding(result?.grounding, sourceIds);
  const nextStep = typeof result?.next_step === "string" ? result.next_step.trim() : "";
  const missingContext = normalizeArray(result?.missing_context).map((item) => String(item).trim()).filter(Boolean);

  if (actionResults.length === 0) {
    return {
      reply: `${rawReply}${skippedActions > 0 ? `\n\nStudyBridge safety skipped ${skippedActions} extra action${skippedActions === 1 ? "" : "s"}.` : ""}${formatGroundingFooter({ grounding, nextStep, missingContext })}`,
      grounding,
      nextStep,
      missingContext,
      actionResults,
    };
  }

  return {
    reply: `${buildActionReply({ course, actionResults, rawReply })}${skippedActions > 0 ? `\n\nStudyBridge safety skipped ${skippedActions} extra action${skippedActions === 1 ? "" : "s"}.` : ""}${formatGroundingFooter({ grounding, nextStep, missingContext })}`,
    grounding,
    nextStep,
    missingContext,
    actionResults,
  };
}

export async function runStudyTurn(args) {
  const contextBundle = args.contextBundle || { context: args.context || "", sourceIds: [] };

  if (wantsStudyBridgeAction(args.studentText)) {
    return runStudyAgent({ ...args, contextBundle });
  }

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: buildTutorOutputPrompt({ ...args, context: contextBundle.context, sourceIds: contextBundle.sourceIds }),
    response_json_schema: tutorSchema,
  });

  const reply = typeof result?.reply === "string" && result.reply.trim()
    ? result.reply.trim()
    : buildFallbackReply({ ...args, context: contextBundle.context });
  const grounding = normalizeGrounding(result?.grounding, contextBundle.sourceIds);
  const nextStep = typeof result?.next_step === "string" ? result.next_step.trim() : "";
  const missingContext = normalizeArray(result?.missing_context).map((item) => String(item).trim()).filter(Boolean);

  return {
    reply: `${isLowQualityReply(reply) ? buildFallbackReply({ ...args, context: contextBundle.context }) : reply}${formatGroundingFooter({ grounding, nextStep, missingContext })}`,
    grounding,
    nextStep,
    missingContext,
    actionResults: [],
  };
}
