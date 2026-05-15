import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, ExternalLink } from "lucide-react";
import { studybridge } from "@/api/studybridgeClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isConversationRecord, isSavedAnswerRecord } from "@/lib/aiConversations";
import { downloadNotesMarkdown } from "@/lib/exporters";
import { DataTablePagination, DataTableToolbar } from "@/components/ui/data-table-controls";
import DeleteActionButton from "@/components/common/DeleteActionButton";

const TYPE_LABEL = {
  material: "Material",
  guide: "Guide",
  mindmap: "Mind map",
  flashcards: "Flashcards",
  quiz: "Quiz",
  note: "Note",
  ai_chat: "AI chat",
  saved_ai: "Saved AI",
};

export default function Library() {
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [guides, setGuides] = useState([]);
  const [decks, setDecks] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [notes, setNotes] = useState([]);
  const [savedAnswers, setSavedAnswers] = useState([]);
  const [search, setSearch] = useState("");
  const [filterCourse, setFilterCourse] = useState("all");
  const [filterTopic, setFilterTopic] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    const [courseRows, topicRows, materialRows, guideRows, deckRows, quizRows, quizQuestionRows, noteRows, savedRows] = await Promise.all([
      studybridge.entities.Course.list("-created_date", 50),
      studybridge.entities.Topic.list("-created_date", 300),
      studybridge.entities.StudyMaterial.list("-created_date", 200),
      studybridge.entities.StudyGuide.list("-created_date", 100),
      studybridge.entities.FlashcardDeck.list("-created_date", 100),
      studybridge.entities.Quiz.list("-created_date", 100),
      studybridge.entities.QuizQuestion.list("order", 500),
      studybridge.entities.Note.list("-created_date", 300),
      studybridge.entities.SavedAIAnswer.list("-created_date", 200),
    ]);

    setCourses(courseRows);
    setTopics(topicRows);
    setMaterials(materialRows);
    setGuides(guideRows);
    setDecks(deckRows);
    setQuizzes(quizRows);
    setQuizQuestions(quizQuestionRows);
    setNotes(noteRows);
    setSavedAnswers(savedRows);
    setLoading(false);
  };

  useEffect(() => {
    loadData().catch((error) => console.error("Failed to load library", error));
  }, []);

  const rows = useMemo(() => {
    const courseById = new Map(courses.map((course) => [course.id, course]));
    const topicById = new Map(topics.map((topic) => [topic.id, topic]));
    const aiChats = savedAnswers.filter(isConversationRecord);
    const savedAnswerItems = savedAnswers.filter(isSavedAnswerRecord);

    const result = [];

    materials.forEach((item) => {
      result.push({
        id: `material-${item.id}`,
        type: "material",
        title: item.title || "Untitled material",
        courseId: item.course_id || "",
        topicId: item.topic_id || "",
        courseTitle: courseById.get(item.course_id)?.title || "No course",
        topicTitle: topicById.get(item.topic_id)?.title || item.topic_title || "—",
        createdAt: item.created_date || item.updated_date || "",
        source: item.type || item.status || "uploaded",
        entity: "StudyMaterial",
        entityRecord: item,
        deleteLabel: item.title || "material",
        openExternalUrl: item.file_url || "",
        searchText: `${item.title || ""} ${item.summary || ""} ${item.type || ""}`.toLowerCase(),
      });
    });

    guides.forEach((item) => {
      const isMindMap = item.source === "mindmap";
      result.push({
        id: `guide-${item.id}`,
        type: isMindMap ? "mindmap" : "guide",
        title: item.title || "Untitled guide",
        courseId: item.course_id || "",
        topicId: "",
        courseTitle: courseById.get(item.course_id)?.title || "No course",
        topicTitle: "—",
        createdAt: item.created_date || item.updated_date || "",
        source: item.source || item.difficulty || "guide",
        entity: "StudyGuide",
        entityRecord: item,
        deleteLabel: item.title || "guide",
        openLink: isMindMap && item.course_id ? `/mindmap?course=${item.course_id}` : "",
        exportGuide: true,
        searchText: `${item.title || ""} ${item.source || ""} ${(item.key_concepts || []).join(" ")}`.toLowerCase(),
      });
    });

    decks.forEach((item) => {
      result.push({
        id: `deck-${item.id}`,
        type: "flashcards",
        title: item.title || "Untitled deck",
        courseId: item.course_id || "",
        topicId: item.topic_id || "",
        courseTitle: courseById.get(item.course_id)?.title || "No course",
        topicTitle: topicById.get(item.topic_id)?.title || item.topic_title || "—",
        createdAt: item.created_date || item.updated_date || "",
        source: `${item.card_count || 0} cards`,
        entity: "FlashcardDeck",
        entityRecord: item,
        deleteLabel: item.title || "flashcard deck",
        searchText: `${item.title || ""} ${item.topic_title || ""}`.toLowerCase(),
      });
    });

    quizzes.forEach((item) => {
      const questionCount = quizQuestions.filter((question) => question.quiz_id === item.id).length || item.question_count || 0;
      result.push({
        id: `quiz-${item.id}`,
        type: "quiz",
        title: item.title || "Untitled quiz",
        courseId: item.course_id || "",
        topicId: item.topic_id || "",
        courseTitle: courseById.get(item.course_id)?.title || "No course",
        topicTitle: topicById.get(item.topic_id)?.title || item.topic_title || "—",
        createdAt: item.created_date || item.updated_date || "",
        source: `${questionCount} questions`,
        entity: "Quiz",
        entityRecord: item,
        deleteLabel: item.title || "quiz",
        searchText: `${item.title || ""} ${item.description || ""}`.toLowerCase(),
      });
    });

    notes.forEach((item) => {
      result.push({
        id: `note-${item.id}`,
        type: "note",
        title: item.title || "Untitled note",
        courseId: item.course_id || "",
        topicId: item.topic_id || "",
        courseTitle: courseById.get(item.course_id)?.title || "No course",
        topicTitle: topicById.get(item.topic_id)?.title || item.topic_title || "—",
        createdAt: item.created_date || item.updated_date || "",
        source: "manual note",
        entity: "Note",
        entityRecord: item,
        deleteLabel: item.title || "note",
        exportNote: true,
        searchText: `${item.title || ""} ${item.content || ""} ${(item.tags || []).join(" ")}`.toLowerCase(),
      });
    });

    aiChats.forEach((item) => {
      result.push({
        id: `chat-${item.id}`,
        type: "ai_chat",
        title: item.title || "AI chat",
        courseId: item.course_id || "",
        topicId: item.topic_id || "",
        courseTitle: courseById.get(item.course_id)?.title || "No course",
        topicTitle: topicById.get(item.topic_id)?.title || item.topic_title || "—",
        createdAt: item.created_date || item.updated_date || "",
        source: `${item.message_count || item.messages?.length || 0} messages`,
        entity: "SavedAIAnswer",
        entityRecord: item,
        deleteLabel: item.title || "AI chat",
        openLink: `/study?conversation=${item.id}`,
        searchText: `${item.title || ""} ${item.context || ""}`.toLowerCase(),
      });
    });

    savedAnswerItems.forEach((item) => {
      result.push({
        id: `saved-${item.id}`,
        type: "saved_ai",
        title: item.question || "Saved AI answer",
        courseId: item.course_id || "",
        topicId: item.topic_id || "",
        courseTitle: courseById.get(item.course_id)?.title || "No course",
        topicTitle: topicById.get(item.topic_id)?.title || item.topic_title || "—",
        createdAt: item.created_date || item.updated_date || "",
        source: item.context || "saved answer",
        entity: "SavedAIAnswer",
        entityRecord: item,
        deleteLabel: "saved AI answer",
        searchText: `${item.question || ""} ${item.answer || ""} ${item.context || ""}`.toLowerCase(),
      });
    });

    return result.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [courses, decks, guides, materials, notes, quizQuestions, quizzes, savedAnswers, topics]);

  const typeOptions = useMemo(() => {
    const types = [...new Set(rows.map((row) => row.type))];
    return types.sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    const searchText = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filterCourse !== "all" && row.courseId !== filterCourse) return false;
      if (filterTopic !== "all" && row.topicId !== filterTopic) return false;
      if (filterType !== "all" && row.type !== filterType) return false;
      if (!searchText) return true;
      return (
        row.searchText.includes(searchText) ||
        row.courseTitle.toLowerCase().includes(searchText) ||
        row.topicTitle.toLowerCase().includes(searchText) ||
        row.source.toLowerCase().includes(searchText)
      );
    });
  }, [filterCourse, filterTopic, filterType, rows, search]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="h-full overflow-hidden bg-background">
      <div className="flex h-full min-h-0 w-full flex-col gap-6 p-6 lg:p-8">
        <div>
          <h1 className="text-2xl font-semibold">Library</h1>
        </div>

        <DataTableToolbar
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          searchPlaceholder="Search artifacts or chats..."
        >
          <Select value={filterCourse} onValueChange={(value) => { setFilterCourse(value); setPage(1); }}>
            <SelectTrigger className="w-full md:w-52"><SelectValue placeholder="Course" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All courses</SelectItem>
              {courses.map((course) => (
                <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterTopic} onValueChange={(value) => { setFilterTopic(value); setPage(1); }}>
            <SelectTrigger className="w-full md:w-56"><SelectValue placeholder="Topic" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All topics</SelectItem>
              {topics.map((topic) => (
                <SelectItem key={topic.id} value={topic.id}>{topic.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={(value) => { setFilterType(value); setPage(1); }}>
            <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {typeOptions.map((type) => (
                <SelectItem key={type} value={type}>{TYPE_LABEL[type] || type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DataTableToolbar>

        <div className="bg-card border rounded-lg min-h-0 flex-1 overflow-hidden flex flex-col">
          {filteredRows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No items match your current filters.</p>
          ) : (
            <>
            <div className="min-h-0 flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{TYPE_LABEL[row.type] || row.type}</p>
                        <p className="font-medium truncate">{row.title}</p>
                      </div>
                    </TableCell>
                    <TableCell>{row.courseTitle}</TableCell>
                    <TableCell>{row.topicTitle || "—"}</TableCell>
                    <TableCell>{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="max-w-[240px] truncate">{row.source}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {row.openLink && (
                          <Link to={row.openLink} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            Open <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        )}
                        {row.openExternalUrl && (
                          <a href={row.openExternalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            View file <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {row.exportGuide && (
                          <button
                            type="button"
                            onClick={() => {
                              const guide = row.entityRecord;
                              const filename = `${(guide.title || "study-guide").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "study-guide"}.md`;
                              const content = Array.isArray(guide.sections)
                                ? guide.sections.map((section, index) => `## ${section.title || `Section ${index + 1}`}\n\n${section.content || ""}`).join("\n\n")
                                : "";
                              downloadNotesMarkdown(filename, { title: guide.title || "Study guide", content });
                            }}
                            className="text-muted-foreground hover:text-primary transition-colors"
                            aria-label="Export guide"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {row.exportNote && (
                          <button
                            type="button"
                            onClick={() => {
                              const note = row.entityRecord;
                              const filename = `${(note.title || "note").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "note"}.md`;
                              downloadNotesMarkdown(filename, note);
                            }}
                            className="text-muted-foreground hover:text-primary transition-colors"
                            aria-label="Export note"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <DeleteActionButton
                          entityName={row.entity}
                          item={row.entityRecord}
                          label={row.deleteLabel}
                          onDeleted={loadData}
                          ariaLabel="Delete row"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            <DataTablePagination
              page={safePage}
              pageSize={pageSize}
              total={filteredRows.length}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
