import { useEffect, useMemo, useRef, useState } from "react";
import { studybridge } from "@/api/studybridgeClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Bot, Loader2, Paperclip, Send } from "lucide-react";
import { loadStudyContextBundle } from "@/lib/aiContext";
import { executeStudyActions, isPendingActionApproval, isPendingActionCancellation, runStudyTurn } from "@/lib/aiActions";
import PendingActionsCard from "@/components/ai/PendingActionsCard";
import MaterialUploader from "@/components/courses/MaterialUploader";
import MarkdownContent from "@/components/ui/markdown-content";
import { toast } from "@/components/ui/use-toast";

const LOCAL_STORAGE_KEY = "studybridge:global-tutor:v1";

const makeMessage = (role, content, extras = {}) => ({
  role,
  content,
  created_at: new Date().toISOString(),
  ...extras,
});

function readPersistedState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writePersistedState(nextState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextState));
  } catch {
    // Ignore storage failures.
  }
}

export default function GlobalTutorDrawer() {
  const persistedRef = useRef();
  if (persistedRef.current === undefined) {
    persistedRef.current = readPersistedState();
  }
  const persisted = persistedRef.current;
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(() => (persisted?.selectedCourseId ? String(persisted.selectedCourseId) : ""));
  const [selectedTopicId, setSelectedTopicId] = useState(() => (persisted?.selectedTopicId ? String(persisted.selectedTopicId) : ""));
  const [messages, setMessages] = useState(() => (Array.isArray(persisted?.messages) ? persisted.messages : []));
  const [pendingActions, setPendingActions] = useState(() => (Array.isArray(persisted?.pendingActions) ? persisted.pendingActions : []));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAttachMaterial, setShowAttachMaterial] = useState(false);
  const scrollRef = useRef(null);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) || null,
    [courses, selectedCourseId],
  );
  const selectedTopic = useMemo(
    () => topics.find((topic) => topic.id === selectedTopicId) || null,
    [topics, selectedTopicId],
  );

  useEffect(() => {
    studybridge.entities.Course.filter({ status: "active" }, "-created_date", 50)
      .then((rows) => setCourses(rows))
      .catch((error) => console.error("Failed to load courses for global tutor", error));
  }, []);

  useEffect(() => {
    if (!selectedCourseId) {
      setTopics([]);
      setSelectedTopicId("");
      return;
    }
    studybridge.entities.Topic.filter({ course_id: selectedCourseId }, "order", 100)
      .then((rows) => {
        setTopics(rows);
        if (selectedTopicId && !rows.some((topic) => topic.id === selectedTopicId)) {
          setSelectedTopicId("");
        }
      })
      .catch((error) => console.error("Failed to load topics for global tutor", error));
  }, [selectedCourseId, selectedTopicId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pendingActions]);

  useEffect(() => {
    writePersistedState({
      selectedCourseId,
      selectedTopicId,
      messages,
      pendingActions,
    });
  }, [messages, pendingActions, selectedCourseId, selectedTopicId]);

  const cancelPendingActions = () => {
    setPendingActions([]);
    setMessages((prev) => [...prev, makeMessage("assistant", "Pending StudyBridge actions canceled. No changes were applied.", { actionStatus: "canceled" })]);
  };

  const applyPendingActions = async () => {
    if (!pendingActions.length) return;
    if (!selectedCourse?.id) {
      window.alert("Select a course first so I know where to apply these updates.");
      return;
    }
    setLoading(true);
    try {
      const actionResults = await executeStudyActions({
        course: selectedCourse,
        topic: selectedTopic,
        actions: pendingActions,
      });
      const summary = actionResults.map((result) => `- ${result.ok ? "Done" : "Failed"}: ${result.message}`).join("\n");
      setMessages((prev) => [...prev, makeMessage("assistant", `StudyBridge actions applied.\n\n**StudyBridge actions**\n${summary || "- No actions executed."}`, { actionStatus: "applied" })]);
      setPendingActions([]);
      toast({
        title: "Changes applied",
        description: "Requested updates were saved to StudyBridge.",
      });
    } catch (error) {
      console.error("Failed to apply global tutor actions", error);
      setMessages((prev) => [...prev, makeMessage("assistant", error.message || "Failed to apply pending actions.")]);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (rawText) => {
    const studentText = String(rawText || "").trim();
    if (!studentText || loading) return;

    const userMessage = makeMessage("user", studentText);
    const history = messages;
    const nextMessages = [...history, userMessage];
    setMessages(nextMessages);
    setInput("");

    if (pendingActions.length && isPendingActionApproval(studentText)) {
      await applyPendingActions();
      return;
    }

    if (pendingActions.length && isPendingActionCancellation(studentText)) {
      cancelPendingActions();
      return;
    }

    setLoading(true);
    try {
      const contextBundle = selectedCourse?.id
        ? await loadStudyContextBundle({ course: selectedCourse, topic: selectedTopic })
        : {
            context: "No course selected. Answer with general study guidance and ask the student to pick a course before creating StudyBridge records.",
            sourceIds: [],
            sourceCatalog: [],
          };

      const turn = await runStudyTurn({
        course: selectedCourse,
        topic: selectedTopic,
        contextBundle,
        depth: "intermediate",
        history,
        studentText,
        studyMode: "explain",
      });

      const nextPending = Array.isArray(turn?.pendingActions) ? turn.pendingActions : [];
      setMessages((prev) => [...prev, makeMessage("assistant", turn.reply, { pendingActions: nextPending })]);
      setPendingActions(nextPending);
    } catch (error) {
      console.error("Global tutor request failed", error);
      setMessages((prev) => [...prev, makeMessage("assistant", error.message || "AI request failed.")]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full shadow-lg"
        size="icon"
        aria-label="Open AI tutor"
      >
        <Bot className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[440px] p-0 sm:max-w-[440px]">
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle>Tutor chat</SheetTitle>
              <SheetDescription>Ask the AI from any page. Select course context for grounded answers and write actions.</SheetDescription>
            </SheetHeader>

            <div className="border-b px-4 py-3 space-y-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Course</p>
                <Select
                  value={selectedCourseId}
                  onValueChange={(value) => {
                    setSelectedCourseId(value);
                    setSelectedTopicId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select course (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((course) => (
                      <SelectItem key={course.id} value={course.id}>
                        {course.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Topic</p>
                <Select value={selectedTopicId} onValueChange={setSelectedTopicId} disabled={!selectedCourseId || topics.length === 0}>
                  <SelectTrigger>
                    <SelectValue placeholder={selectedCourseId ? "Select topic (optional)" : "Pick course first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {topics.map((topic) => (
                      <SelectItem key={topic.id} value={topic.id}>
                        {topic.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
              <div className="space-y-3">
                {messages.length === 0 && (
                  <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                    Ask for explanations, quizzes, study plans, notes, or tasks. For file-based grounding, attach material to the selected course.
                  </div>
                )}

                {messages.map((message, index) => (
                  <div key={`${message.created_at || index}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[92%] rounded-2xl border px-3 py-2 text-sm ${message.role === "user" ? "bg-primary text-primary-foreground border-primary/20" : "bg-background"}`}>
                      {message.role === "user" ? <p>{message.content}</p> : <MarkdownContent>{message.content}</MarkdownContent>}
                    </div>
                  </div>
                ))}

                {pendingActions.length > 0 && (
                  <PendingActionsCard
                    courseTitle={selectedCourse?.title}
                    actions={pendingActions}
                    onApprove={() => {
                      void applyPendingActions();
                    }}
                    onCancel={cancelPendingActions}
                    busy={loading}
                  />
                )}

                {loading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Thinking...</span>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t px-4 py-3">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage(input);
                }}
                className="flex items-center gap-2"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowAttachMaterial(true)}
                  disabled={!selectedCourse?.id || loading}
                  aria-label="Attach study material"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask the tutor..."
                  disabled={loading}
                />
                <Button type="submit" size="icon" disabled={!input.trim() || loading}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <MaterialUploader
        open={showAttachMaterial}
        onClose={() => setShowAttachMaterial(false)}
        courseId={selectedCourse?.id}
        topics={topics}
        onUploaded={() => {
          toast({
            title: "Material uploaded",
            description: "The file was added to your selected course.",
          });
          setMessages((prev) => [...prev, makeMessage("assistant", `Material uploaded to ${selectedCourse?.title || "the selected course"}. Ask me to summarize it or generate practice questions.`)]);
        }}
      />
    </>
  );
}
