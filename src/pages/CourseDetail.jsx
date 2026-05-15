import { useState, useEffect } from "react";
import { studybridge } from "@/api/studybridgeClient";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Upload, Brain, FileText, Trash2, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RichTextEditor from "@/components/ui/rich-text-editor";
import { differenceInDays, format } from "date-fns";
import TopicList from "@/components/courses/TopicList";
import MaterialUploader from "@/components/courses/MaterialUploader";
import CourseOverview from "@/components/courses/CourseOverview";
import AddTopicDialog from "@/components/courses/AddTopicDialog";
import { confirmAndDelete } from "@/lib/deleteEntity";
import { goBackOr } from "@/lib/navigation";

export default function CourseDetail() {
  const { courseId: id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [topics, setTopics] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [notes, setNotes] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const handleBack = () => goBackOr(navigate, "/courses");

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    const [c, tp, m, n, s, d] = await Promise.all([
      studybridge.entities.Course.filter({ id }, null, 1).then(r => r[0]),
      studybridge.entities.Topic.filter({ course_id: id }, "order", 100),
      studybridge.entities.StudyMaterial.filter({ course_id: id }, "-created_date", 50),
      studybridge.entities.Note.filter({ course_id: id }, "-created_date", 50),
      studybridge.entities.StudySession.filter({ course_id: id }, "-created_date", 10),
      studybridge.entities.FlashcardDeck.filter({ course_id: id }, "-created_date", 100),
    ]);
    setCourse(c);
    setTopics(tp);
    setMaterials(m);
    setNotes(n);
    setSessions(s);
    setDecks(d);
    setLoading(false);
  };

  const handleDelete = async (entityName, item, label) => {
    try {
      const deleted = await confirmAndDelete(entityName, item, label);
      if (deleted) await loadData();
    } catch (error) {
      console.error("Failed to delete course item", error);
      window.alert(error.message || "Failed to delete item");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="h-full overflow-hidden bg-background">
        <div className="flex h-full min-h-0 w-full flex-col justify-center p-6 lg:p-8">
          <button onClick={handleBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back to courses
          </button>
          <div className="bg-card border rounded-lg p-8 text-center mt-6">
            <h1 className="text-lg font-semibold">Course not found</h1>
            <p className="text-sm text-muted-foreground mt-2">This course may have been deleted or the link is invalid.</p>
          </div>
        </div>
      </div>
    );
  }

  const daysUntilExam = course.exam_date ? differenceInDays(new Date(course.exam_date), new Date()) : null;
  const masteredTopics = topics.filter(t => t.status === "mastered").length;

  return (
    <div className="h-full overflow-hidden bg-background">
      <div className="flex h-full min-h-0 w-full flex-col gap-6 p-6 lg:p-8">
      <div className="flex items-start gap-4">
        <button onClick={handleBack} className="mt-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-semibold shrink-0"
              style={{ backgroundColor: course.color || "#3B5BDB" }}
            >
              {course.code?.substring(0, 2) || "CO"}
            </div>
            <div>
              <h1 className="text-2xl font-semibold">{course.title}</h1>
              <p className="text-sm text-muted-foreground">
                {course.code} - {course.term}
                {course.instructor && ` - Prof. ${course.instructor}`}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/mindmap?course=${course.id}`)} className="gap-2">
            <GitBranch className="w-4 h-4" /> Mind map
          </Button>
          <Button variant="outline" onClick={() => setShowUpload(true)} className="gap-2">
            <Upload className="w-4 h-4" /> Upload
          </Button>
          <Button onClick={() => navigate(`/study?course=${course.id}`)} className="gap-2">
            <Brain className="w-4 h-4" /> Study
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Progress" value={`${course.overall_progress || 0}%`}>
            <Progress value={course.overall_progress || 0} className="h-1 mt-1" />
          </Stat>
          <Stat label="Topics" value={`${masteredTopics}/${topics.length}`} sublabel="mastered" />
          <Stat label="Materials" value={materials.length} sublabel="uploaded" />
          <Stat
            label="Exam"
            value={daysUntilExam !== null ? (daysUntilExam >= 0 ? `${daysUntilExam}d` : "Past") : "-"}
            sublabel={course.exam_date ? format(new Date(course.exam_date), "MMM d, yyyy") : "Not set"}
            danger={daysUntilExam !== null && daysUntilExam <= 7}
          />
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="topics">Topics ({topics.length})</TabsTrigger>
            <TabsTrigger value="materials">Materials ({materials.length})</TabsTrigger>
            <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
            <TabsTrigger value="flashcards">Flashcards ({decks.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <CourseOverview course={course} topics={topics} sessions={sessions} materials={materials} />
          </TabsContent>

          <TabsContent value="topics">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">{topics.length} topics in this course</p>
              <Button size="sm" variant="outline" onClick={() => setShowAddTopic(true)} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Topic
              </Button>
            </div>
            <TopicList topics={topics} course={course} onDelete={(topic) => handleDelete("Topic", topic, topic.title || "topic")} />
          </TabsContent>

          <TabsContent value="materials">
            <MaterialsList materials={materials} onDelete={(material) => handleDelete("StudyMaterial", material, material.title || "material")} />
          </TabsContent>

          <TabsContent value="notes">
            <NotesList notes={notes} onDelete={(note) => handleDelete("Note", note, note.title || "note")} />
          </TabsContent>

          <TabsContent value="flashcards">
            <DecksList decks={decks} courseId={course.id} onReload={loadData} onDelete={(deck) => handleDelete("FlashcardDeck", deck, deck.title || "flashcard deck")} />
          </TabsContent>
        </Tabs>
      </div>

      <AddTopicDialog
        open={showAddTopic}
        onClose={() => setShowAddTopic(false)}
        courseId={course.id}
        onCreated={loadData}
      />
      <MaterialUploader
        open={showUpload}
        onClose={() => setShowUpload(false)}
        courseId={course.id}
        topics={topics}
        onUploaded={loadData}
      />
      </div>
    </div>
  );
}

function Stat({ label, value, sublabel, danger, children }) {
  return (
    <div className="bg-card border rounded-lg p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${danger ? "text-destructive" : ""}`}>{value}</p>
      {children || <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>}
    </div>
  );
}

function MaterialsList({ materials, onDelete }) {
  if (materials.length === 0) {
    return <Empty icon={FileText} text="No materials uploaded yet" />;
  }
  return (
    <div className="bg-card border rounded-lg divide-y">
      {materials.map(m => (
        <div key={m.id} className="p-3 flex items-center gap-3">
          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{m.title}</p>
            <p className="text-xs text-muted-foreground capitalize">{m.type} - {m.status}</p>
          </div>
          {m.file_url && (
            <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
              View
            </a>
          )}
          <DeleteButton onDelete={() => onDelete(m)} />
        </div>
      ))}
    </div>
  );
}

function NotesList({ notes, onDelete }) {
  if (notes.length === 0) {
    return <Empty icon={FileText} text="No notes yet. Take notes during study sessions." />;
  }
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {notes.map(n => (
        <div key={n.id} className="bg-card border rounded-lg p-4">
          <div className="flex items-start gap-2">
            <h3 className="font-medium text-sm flex-1">{n.title}</h3>
            <DeleteButton onDelete={() => onDelete(n)} />
          </div>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{n.content}</p>
          {n.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {n.tags.map((t, i) => (
                <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded">#{t}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Empty({ icon: Icon, text }) {
  return (
    <div className="bg-card border rounded-lg p-8 text-center">
      <Icon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function normalizeDeckCards(deck) {
  if (Array.isArray(deck?.cards)) return deck.cards;
  if (Array.isArray(deck?.flashcards)) return deck.flashcards;
  return [];
}

function DecksList({ decks, courseId, onReload, onDelete }) {
  const [editingDeckId, setEditingDeckId] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCards, setDraftCards] = useState([]);
  const [selectedCardIndex, setSelectedCardIndex] = useState(0);

  if (decks.length === 0) {
    return <Empty icon={FileText} text="No flashcard decks yet. Generate one from Study session." />;
  }

  const openEditor = (deck) => {
    setEditingDeckId(deck.id);
    setDraftTitle(deck.title || "Untitled deck");
    setDraftCards(normalizeDeckCards(deck).map((item) => ({
      front: item?.front || "",
      back: item?.back || "",
      source_ids: Array.isArray(item?.source_ids) ? item.source_ids : [],
    })));
    setSelectedCardIndex(0);
  };

  const saveDeck = async () => {
    const cards = draftCards.filter((item) => item.front.trim() && item.back.trim());
    if (!editingDeckId) return;
    await studybridge.entities.FlashcardDeck.update(editingDeckId, {
      title: draftTitle.trim() || "Untitled deck",
      cards,
      flashcards: cards,
      card_count: cards.length,
      course_id: courseId,
    });
    setEditingDeckId("");
    await onReload?.();
  };

  return (
    <div className="space-y-3">
      {decks.map((deck) => (
        <div key={deck.id} className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{deck.title || "Untitled deck"}</p>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => openEditor(deck)}>Edit cards</Button>
              <DeleteButton onDelete={() => onDelete(deck)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{normalizeDeckCards(deck).length} cards</p>
        </div>
      ))}

      {editingDeckId ? (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Deck title" />
          <div className="flex flex-wrap gap-2">
            {draftCards.map((_, index) => (
              <Button key={`card-select-${index}`} type="button" size="sm" variant={index === selectedCardIndex ? "default" : "outline"} onClick={() => setSelectedCardIndex(index)}>
                Card {index + 1}
              </Button>
            ))}
          </div>
          {draftCards[selectedCardIndex] ? (
            <div className="rounded border p-2 space-y-2">
              <Input
                value={draftCards[selectedCardIndex].front}
                placeholder="Front"
                onChange={(event) => setDraftCards((prev) => prev.map((card, i) => (i === selectedCardIndex ? { ...card, front: event.target.value } : card)))}
              />
              <RichTextEditor
                value={draftCards[selectedCardIndex].back}
                onChange={(value) => setDraftCards((prev) => prev.map((card, i) => (i === selectedCardIndex ? { ...card, back: value } : card)))}
                placeholder="Back"
              />
              <Button type="button" size="sm" variant="outline" onClick={() => {
                setDraftCards((prev) => prev.filter((_, i) => i !== selectedCardIndex));
                setSelectedCardIndex((current) => Math.max(0, current - 1));
              }}>Remove</Button>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => {
              setDraftCards((prev) => {
                const next = [...prev, { front: "", back: "", source_ids: [] }];
                setSelectedCardIndex(next.length - 1);
                return next;
              });
            }}>Add card</Button>
            <Button type="button" onClick={saveDeck}>Save deck</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DeleteButton({ onDelete }) {
  return (
    <button
      type="button"
      onClick={onDelete}
      className="text-muted-foreground hover:text-destructive transition-colors"
      aria-label="Delete"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}
