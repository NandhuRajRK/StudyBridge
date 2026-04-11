import { studybridge } from "@/api/studybridgeClient";

const relatedCourseEntities = [
  "StudyMaterial",
  "StudyGuide",
  "FlashcardDeck",
  "Note",
  "SavedAIAnswer",
  "StudySession",
  "Task",
  "Topic",
  "TopicMastery",
  "Quiz",
  "QuizQuestion",
  "Flashcard",
];

export async function deleteEntity(entityName, item) {
  if (!item?.id) return;

  if (entityName === "Course") {
    for (const relatedEntity of relatedCourseEntities) {
      const rows = await studybridge.entities[relatedEntity].filter({ course_id: item.id }, null, 500);
      for (const row of rows) {
        await deleteEntity(relatedEntity, row);
      }
    }
  }

  if (entityName === "Quiz") {
    const questions = await studybridge.entities.QuizQuestion.filter({ quiz_id: item.id }, null, 500);
    for (const question of questions) {
      await deleteEntity("QuizQuestion", question);
    }
  }

  if (entityName === "StudyMaterial" && item.file_url) {
    await studybridge.integrations.Core.DeleteFile({ file_url: item.file_url });
  }

  await studybridge.entities[entityName].delete(item.id);
}

export async function confirmAndDelete(entityName, item, label = "item") {
  if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return false;
  await deleteEntity(entityName, item);
  return true;
}
