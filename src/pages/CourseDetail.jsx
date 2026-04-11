import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Upload, Brain, FileText, BookOpen, Trash2, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { differenceInDays, format } from "date-fns";
import TopicList from "@/components/courses/TopicList";
import MaterialUploader from "@/components/courses/MaterialUploader";
import CourseOverview from "@/components/courses/CourseOverview";
import AddTopicDialog from "@/components/courses/AddTopicDialog";
import { confirmAndDelete } from "@/lib/deleteEntity";

export default function CourseDetail() {
  const { courseId: id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [topics, setTopics] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [guides, setGuides] = useState([]);
  const [notes, setNotes] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    const [c, tp, m, g, n, s] = await Promise.all([
      base44.entities.Course.filter({ id }, null, 1).then(r => r[0]),
      base44.entities.Topic.filter({ course_id: id }, "order", 100),
      base44.entities.StudyMaterial.filter({ course_id: id }, "-created_date", 50),
      base44.entities.StudyGuide.filter({ course_id: id }, "-created_date", 20),
      base44.entities.Note.filter({ course_id: id }, "-created_date", 50),
      base44.entities.StudySession.filter({ course_id: id }, "-created_date", 10),
    ]);
    setCourse(c);
    setTopics(tp);
    setMaterials(m);
    setGuides(g);
    setNotes(n);
    setSessions(s);
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
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <button onClick={() => navigate("/courses")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to courses
        </button>
        <div className="bg-card border rounded-lg p-8 text-center mt-6">
          <h1 className="text-lg font-semibold">Course not found</h1>
          <p className="text-sm text-muted-foreground mt-2">This course may have been deleted or the link is invalid.</p>
        </div>
      </div>
    );
  }

  const daysUntilExam = course.exam_date ? differenceInDays(new Date(course.exam_date), new Date()) : null;
  const masteredTopics = topics.filter(t => t.status === "mastered").length;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start gap-4">
        <button onClick={() => navigate("/courses")} className="mt-1 text-muted-foreground hover:text-foreground">
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
          <TabsTrigger value="guides">Guides ({guides.length})</TabsTrigger>
          <TabsTrigger value="mindmap">Mind Map ({guides.filter((guide) => guide.source === "mindmap").length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
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

        <TabsContent value="guides">
          <GuidesList guides={guides} onDelete={(guide) => handleDelete("StudyGuide", guide, guide.title || "study guide")} />
        </TabsContent>

        <TabsContent value="mindmap">
          <div className="bg-card border rounded-lg p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Mind map</h2>
                <p className="text-sm text-muted-foreground">
                  Open the course mind map to arrange topics visually, pan around large maps, and save a structured study overview.
                </p>
              </div>
              <Button variant="outline" onClick={() => navigate(`/mindmap?course=${course.id}`)} className="gap-2">
                <GitBranch className="w-4 h-4" /> Open mind map
              </Button>
            </div>
            {guides.filter((guide) => guide.source === "mindmap").length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This course does not have a saved mind map yet. Open the map and save it once you create one.
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {guides.filter((guide) => guide.source === "mindmap").map((guide) => (
                  <div key={guide.id} className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-sm font-medium">{guide.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {Array.isArray(guide.sections) ? `${guide.sections.length} nodes saved` : "Saved map"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="notes">
          <NotesList notes={notes} onDelete={(note) => handleDelete("Note", note, note.title || "note")} />
        </TabsContent>
      </Tabs>

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

function GuidesList({ guides, onDelete }) {
  if (guides.length === 0) {
    return <Empty icon={BookOpen} text="No study guides generated yet. Start a study session to generate guides." />;
  }
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {guides.map(g => (
        <div key={g.id} className="bg-card border rounded-lg p-4">
          <div className="flex items-start gap-2">
            <h3 className="font-medium text-sm flex-1">{g.title}</h3>
            <DeleteButton onDelete={() => onDelete(g)} />
          </div>
          <p className="text-xs text-muted-foreground capitalize mt-1">{g.difficulty}</p>
          {g.key_concepts?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {g.key_concepts.slice(0, 3).map((c, i) => (
                <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded">{c}</span>
              ))}
            </div>
          )}
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
