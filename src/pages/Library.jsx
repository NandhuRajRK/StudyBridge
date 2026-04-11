import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, FileText, BookOpen, Zap, StickyNote, Bookmark, MessageSquare, Trash2, HelpCircle, Download } from "lucide-react";
import { isConversationRecord, isSavedAnswerRecord } from "@/lib/aiConversations";
import { confirmAndDelete } from "@/lib/deleteEntity";
import { downloadNotesMarkdown } from "@/lib/exporters";

export default function Library() {
  const [courses, setCourses] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [guides, setGuides] = useState([]);
  const [mindMaps, setMindMaps] = useState([]);
  const [decks, setDecks] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [notes, setNotes] = useState([]);
  const [savedAnswers, setSavedAnswers] = useState([]);
  const [search, setSearch] = useState("");
  const [filterCourse, setFilterCourse] = useState("all");
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    const [c, m, g, d, q, qq, n, s] = await Promise.all([
      base44.entities.Course.list("-created_date", 50),
      base44.entities.StudyMaterial.list("-created_date", 100),
      base44.entities.StudyGuide.list("-created_date", 50),
      base44.entities.FlashcardDeck.list("-created_date", 50),
      base44.entities.Quiz.list("-created_date", 50),
      base44.entities.QuizQuestion.list("order", 300),
      base44.entities.Note.list("-created_date", 100),
      base44.entities.SavedAIAnswer.list("-created_date", 50),
    ]);

    setCourses(c);
    setMaterials(m);
    setGuides(g);
    setMindMaps(g.filter((guide) => guide.source === "mindmap"));
    setDecks(d); setQuizzes(q); setQuizQuestions(qq);
    setNotes(n); setSavedAnswers(s);
    setLoading(false);
  };

  useEffect(() => {
    loadData().catch((error) => console.error("Failed to load library", error));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const filter = (items) => {
    let out = filterCourse !== "all" ? items.filter(i => i.course_id === filterCourse) : items;
    if (search) {
      const s = search.toLowerCase();
      out = out.filter(i =>
        (i.title || "").toLowerCase().includes(s) ||
        (i.content || "").toLowerCase().includes(s) ||
        (i.question || "").toLowerCase().includes(s) ||
        (i.context || "").toLowerCase().includes(s)
      );
    }
    return out;
  };

  const courseOf = (id) => courses.find(c => c.id === id);
  const aiChats = savedAnswers.filter(isConversationRecord);
  const savedAnswerItems = savedAnswers.filter(isSavedAnswerRecord);

  const handleDelete = async (entityName, item, label) => {
    try {
      const deleted = await confirmAndDelete(entityName, item, label);
      if (deleted) await loadData();
    } catch (error) {
      console.error("Failed to delete library item", error);
      window.alert(error.message || "Failed to delete item");
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Library</h1>
        <p className="text-sm text-muted-foreground mt-1">All your materials, guides, notes, and saved content</p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-9" />
        </div>
        <Select value={filterCourse} onValueChange={setFilterCourse}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Courses</SelectItem>
            {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="materials">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="materials" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Materials ({filter(materials).length})</TabsTrigger>
          <TabsTrigger value="guides" className="gap-1.5"><BookOpen className="w-3.5 h-3.5" /> Guides ({filter(guides).length})</TabsTrigger>
          <TabsTrigger value="mindmaps" className="gap-1.5"><GitBranch className="w-3.5 h-3.5" /> Mind Maps ({filter(mindMaps).length})</TabsTrigger>
          <TabsTrigger value="flashcards" className="gap-1.5"><Zap className="w-3.5 h-3.5" /> Flashcards ({filter(decks).length})</TabsTrigger>
          <TabsTrigger value="quizzes" className="gap-1.5"><HelpCircle className="w-3.5 h-3.5" /> Quizzes ({filter(quizzes).length})</TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5"><StickyNote className="w-3.5 h-3.5" /> Notes ({filter(notes).length})</TabsTrigger>
          <TabsTrigger value="ai-chats" className="gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> AI Chats ({filter(aiChats).length})</TabsTrigger>
          <TabsTrigger value="saved" className="gap-1.5"><Bookmark className="w-3.5 h-3.5" /> Saved AI ({filter(savedAnswerItems).length})</TabsTrigger>
        </TabsList>

        <TabsContent value="materials" className="mt-4">
          <ItemGrid items={filter(materials)} empty="No materials uploaded yet." renderItem={m => (
            <Card>
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-sm truncate">{m.title}</h3>
                  <p className="text-xs text-muted-foreground capitalize">{m.type} - {m.status}</p>
                </div>
                <DeleteButton onDelete={() => handleDelete("StudyMaterial", m, m.title || "material")} />
              </div>
              {m.summary && <p className="text-xs text-muted-foreground line-clamp-2">{m.summary}</p>}
              <CourseTag course={courseOf(m.course_id)} />
              {m.file_url && <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">View file</a>}
            </Card>
          )} />
        </TabsContent>

        <TabsContent value="guides" className="mt-4">
          <ItemGrid items={filter(guides)} empty="No study guides yet." renderItem={g => (
            <Card>
              <div className="flex items-start gap-2">
                <h3 className="font-medium text-sm flex-1">{g.title}</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const filename = `${(g.title || "study-guide").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "study-guide"}.md`;
                      const content = Array.isArray(g.sections)
                        ? g.sections.map((section, index) => `## ${section.title || `Section ${index + 1}`}\n\n${section.content || ""}`).join("\n\n")
                        : "";
                      downloadNotesMarkdown(filename, { title: g.title || "Study guide", content });
                    }}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    aria-label="Export study guide"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <DeleteButton onDelete={() => handleDelete("StudyGuide", g, g.title || "study guide")} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground capitalize">{g.source === "mindmap" ? "Mind map" : g.difficulty}</p>
              {g.key_concepts?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {g.key_concepts.slice(0, 4).map((c, i) => <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded">{c}</span>)}
                </div>
              )}
              <CourseTag course={courseOf(g.course_id)} />
            </Card>
          )} />
        </TabsContent>

        <TabsContent value="mindmaps" className="mt-4">
          <ItemGrid items={filter(mindMaps)} empty="No mind maps yet." renderItem={g => (
            <Card>
              <div className="flex items-start gap-2">
                <GitBranch className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-sm truncate">{g.title}</h3>
                  <p className="text-xs text-muted-foreground">Mind map</p>
                </div>
                <Link
                  to={`/mindmap?course=${g.course_id}`}
                  className="text-xs text-primary hover:underline shrink-0"
                >
                  Open
                </Link>
              </div>
              <CourseTag course={courseOf(g.course_id)} />
            </Card>
          )} />
        </TabsContent>

        <TabsContent value="flashcards" className="mt-4">
          <ItemGrid items={filter(decks)} empty="No flashcard decks yet." renderItem={d => (
            <Card>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-accent" />
                <h3 className="font-medium text-sm flex-1">{d.title}</h3>
                <DeleteButton onDelete={() => handleDelete("FlashcardDeck", d, d.title || "flashcard deck")} />
              </div>
              <p className="text-xs text-muted-foreground">{d.card_count || 0} cards - {d.mastered_count || 0} mastered</p>
              <CourseTag course={courseOf(d.course_id)} />
            </Card>
          )} />
        </TabsContent>

        <TabsContent value="quizzes" className="mt-4">
          <ItemGrid items={filter(quizzes)} empty="No practice quizzes yet." renderItem={quiz => {
            const questions = quizQuestions.filter(q => q.quiz_id === quiz.id);
            return (
              <Card>
                <div className="flex items-start gap-2">
                  <HelpCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm">{quiz.title}</h3>
                    <p className="text-xs text-muted-foreground">{questions.length || quiz.question_count || 0} questions</p>
                  </div>
                  <DeleteButton onDelete={() => handleDelete("Quiz", quiz, quiz.title || "quiz")} />
                </div>
                {quiz.description && <p className="text-sm text-muted-foreground line-clamp-2">{quiz.description}</p>}
                {questions.slice(0, 2).map((question, index) => (
                  <div key={question.id} className="rounded-md bg-muted/50 p-2">
                    <p className="text-xs font-medium">{index + 1}. {question.question}</p>
                    <p className="text-xs text-muted-foreground mt-1">Answer: {question.correct}</p>
                  </div>
                ))}
                <CourseTag course={courseOf(quiz.course_id)} />
              </Card>
            );
          }} />
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <ItemGrid items={filter(notes)} empty="No notes yet." renderItem={n => (
            <Card>
              <div className="flex items-start gap-2">
                <h3 className="font-medium text-sm flex-1">{n.title}</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadNotesMarkdown(`${(n.title || "note").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "note"}.md`, n)}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    aria-label="Export note"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <DeleteButton onDelete={() => handleDelete("Note", n, n.title || "note")} />
                </div>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-3">{n.content}</p>
              {n.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {n.tags.map((t, i) => <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded">#{t}</span>)}
                </div>
              )}
              <CourseTag course={courseOf(n.course_id)} />
            </Card>
          )} />
        </TabsContent>

        <TabsContent value="saved" className="mt-4">
          <ItemGrid items={filter(savedAnswerItems)} empty="No saved AI answers yet." renderItem={s => (
            <Card>
              <div className="flex items-start gap-2">
                <p className="text-sm font-medium flex-1">{s.question}</p>
                <DeleteButton onDelete={() => handleDelete("SavedAIAnswer", s, "saved AI answer")} />
              </div>
              <p className="text-sm text-muted-foreground line-clamp-4">{s.answer}</p>
              {s.context && <p className="text-xs text-muted-foreground italic">{s.context}</p>}
            </Card>
          )} />
        </TabsContent>

        <TabsContent value="ai-chats" className="mt-4">
          <ItemGrid items={filter(aiChats)} empty="No AI chat history yet." renderItem={chat => (
            <Card>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                <Link to={`/ai-tutor?conversation=${chat.id}`} className="font-medium text-sm line-clamp-1 flex-1 hover:text-primary">
                  {chat.title || "AI chat"}
                </Link>
                <DeleteButton onDelete={() => handleDelete("SavedAIAnswer", chat, chat.title || "AI chat")} />
              </div>
              <p className="text-xs text-muted-foreground">{chat.context || "General"} - {chat.message_count || chat.messages?.length || 0} messages</p>
              {chat.messages?.length > 0 && (
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {chat.messages[chat.messages.length - 1]?.content}
                </p>
              )}
              <CourseTag course={courseOf(chat.course_id)} />
            </Card>
          )} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Card({ children }) {
  return <div className="bg-card border rounded-lg p-4 space-y-2">{children}</div>;
}

function ItemGrid({ items, empty, renderItem }) {
  if (items.length === 0) return <p className="text-center text-sm text-muted-foreground py-10">{empty}</p>;
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map(item => <div key={item.id}>{renderItem(item)}</div>)}
    </div>
  );
}

function DeleteButton({ onDelete }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDelete();
      }}
      className="text-muted-foreground hover:text-destructive transition-colors"
      aria-label="Delete"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

function CourseTag({ course }) {
  if (!course) return null;
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: course.color }} />
      <span className="text-xs text-muted-foreground">{course.title}</span>
    </div>
  );
}
