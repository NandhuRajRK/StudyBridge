import { studybridge } from "@/api/studybridgeClient";
import { buildConversationTitle } from "@/lib/aiContext";

export const isConversationRecord = (record) => record?.record_type === "conversation";
export const isSavedAnswerRecord = (record) => !record?.record_type || record.record_type === "answer";

export async function listAIConversations(limit = 30) {
  const records = await studybridge.entities.SavedAIAnswer.list("-updated_date", 100);
  return records
    .filter(isConversationRecord)
    .sort((a, b) => new Date(b.last_message_at || b.updated_date || 0) - new Date(a.last_message_at || a.updated_date || 0))
    .slice(0, limit);
}

export async function loadAIConversation(id) {
  if (!id) return null;
  const [record] = await studybridge.entities.SavedAIAnswer.filter({ id }, null, 1);
  return isConversationRecord(record) ? record : null;
}

export async function saveAIConversation({
  conversation,
  messages,
  course,
  topic,
  source = "ai_tutor",
  sessionId,
  title,
}) {
  const now = new Date().toISOString();
  const payload = {
    record_type: "conversation",
    title: title || conversation?.title || buildConversationTitle(messages),
    course_id: course?.id,
    topic_id: topic?.id,
    course_title: course?.title,
    topic_title: topic?.title,
    source,
    session_id: sessionId,
    context: topic ? `${course?.title || "Course"} - ${topic.title}` : course?.title || "General",
    messages,
    message_count: messages.length,
    last_message_at: now,
    updated_at: now,
  };

  if (conversation?.id) {
    return studybridge.entities.SavedAIAnswer.update(conversation.id, payload);
  }

  return studybridge.entities.SavedAIAnswer.create(payload);
}

export async function saveAIAnswer({ question, answer, course, topic, context }) {
  return studybridge.entities.SavedAIAnswer.create({
    record_type: "answer",
    course_id: course?.id,
    topic_id: topic?.id,
    question,
    answer,
    context: context || (topic ? `${course?.title || "Course"} - ${topic.title}` : course?.title || "General"),
  });
}
