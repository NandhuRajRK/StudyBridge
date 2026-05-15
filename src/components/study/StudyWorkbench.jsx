import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { studybridge } from "@/api/studybridgeClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowRight, BookOpen, Brain, Clock, History, Layers3, Loader2, MessageSquare, PanelRightClose, PanelRightOpen, Paperclip, Pause, Plus, Send, Sparkles, Square, Wand2 } from "lucide-react";
import { buildStudyModeGuidance, loadStudyContextBundle } from "@/lib/aiContext";
import { executeStudyActions, getRecoverablePendingActions, isPendingActionApproval, isPendingActionCancellation, runStudyTurn } from "@/lib/aiActions";
import { listAIConversations, loadAIConversation, saveAIAnswer, saveAIConversation } from "@/lib/aiConversations";
import { isDesktopAiUnavailable, loadDesktopAiRuntime } from "@/lib/desktopAi";
import { toast } from "@/components/ui/use-toast";
import MarkdownContent from "@/components/ui/markdown-content";
import PendingActionsCard from "@/components/ai/PendingActionsCard";
import StudySummary from "@/components/study/StudySummary";
import StudyFlashcards from "@/components/study/StudyFlashcards";
import StudyQuiz from "@/components/study/StudyQuiz";
import StudyNotes from "@/components/study/StudyNotes";
import ReviewModePanel from "@/components/study/ReviewModePanel";
import MaterialUploader from "@/components/courses/MaterialUploader";
import { buildReviewOutcomePlan, buildReviewTaskPayload, getReviewTasks, normalizeConfidence, normalizeSourceIds, shouldPersistReviewTask, sortReviewTasks } from "@/lib/studyReview";
import RichTextEditor from "@/components/ui/rich-text-editor";
import { normalizeRichTextInput } from "@/lib/richText";
import MindMap from "@/pages/MindMap";

const WORKBENCH_SOURCE = "study_workbench";
const WORKBENCH_STATE_KEY = "studybridge:workbench-state:v1";

const DEFAULT_ARTIFACTS = {
  summary: null,
  flashcards: [],
  quiz: [],
  sourceCatalog: [],
  summarySourceIds: [],
};

const QUICK_PROMPTS = [
  { icon: BookOpen, label: "Explain concept", prompt: "Explain the key concepts of this topic clearly" },
  { icon: Layers3, label: "Worked example", prompt: "Show me a worked example step by step, then ask me why each step was used" },
  { icon: MessageSquare, label: "Practice questions", prompt: "Generate 5 practice questions for this topic" },
  { icon: Sparkles, label: "Summary", prompt: "Provide a comprehensive summary of this topic" },
  { icon: Wand2, label: "Real examples", prompt: "Give me real-world examples that illustrate this topic" },
  { icon: Brain, label: "Key differences", prompt: "What are the key differences between the main concepts in this topic?" },
];

const ARTIFACT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    flashcards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          front: { type: "string" },
          back: { type: "string" },
          source_ids: { type: "array", items: { type: "string" } },
        },
      },
    },
    summary_source_ids: { type: "array", items: { type: "string" } },
    quiz: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correct: { type: "string" },
          explanation: { type: "string" },
          source_ids: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const newMessage = (role, content, extras = {}) => ({
  role,
  content,
  created_at: new Date().toISOString(),
  ...extras,
});

const isCourseTopicReady = (course, topic) => Boolean(course?.id && topic?.id);
function readWorkbenchState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WORKBENCH_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeWorkbenchState(snapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORKBENCH_STATE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage failures.
  }
}

function clearWorkbenchState() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(WORKBENCH_STATE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function normalizePersistedArtifacts(artifacts) {
  const value = artifacts && typeof artifacts === "object" ? artifacts : {};
  return {
    summary: typeof value.summary === "string" ? normalizeRichTextInput(value.summary) : null,
    flashcards: Array.isArray(value.flashcards) ? value.flashcards : [],
    quiz: Array.isArray(value.quiz) ? value.quiz : [],
    sourceCatalog: Array.isArray(value.sourceCatalog) ? value.sourceCatalog : [],
    summarySourceIds: Array.isArray(value.summarySourceIds) ? value.summarySourceIds : [],
  };
}

function normalizePersistedMessages(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      ...item,
      role: item.role === "assistant" ? "assistant" : "user",
      content: typeof item.content === "string" ? item.content : "",
      created_at: typeof item.created_at === "string" ? item.created_at : new Date().toISOString(),
    }));
}

function ArtifactPlaceholder({ title, body, action }) {
  return (
    <div className="rounded-2xl border border-dashed bg-muted/20 p-5">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

function stripTutorMetaFooter(text = "") {
  return String(text || "")
    .replace(/\n{2}\*\*Grounding\*\*:[\s\S]*$/i, "")
    .replace(/\n{2}\*\*Missing context\*\*:[\s\S]*$/i, "")
    .replace(/\n{2}\*\*Next step\*\*:[\s\S]*$/i, "")
    .trim();
}

function buildSessionArtifactContext(generatedContent = {}) {
  const parts = [];
  if (generatedContent?.summary) {
    parts.push(`[session-summary]\n${generatedContent.summary}`);
  }
  if (Array.isArray(generatedContent?.flashcards) && generatedContent.flashcards.length > 0) {
    parts.push(
      `[session-flashcards]\n${generatedContent.flashcards
        .slice(0, 20)
        .map((card, index) => `- ${index + 1}. Q: ${card.front || ""} | A: ${card.back || ""}`)
        .join("\n")}`,
    );
  }
  if (Array.isArray(generatedContent?.quiz) && generatedContent.quiz.length > 0) {
    parts.push(
      `[session-quiz]\n${generatedContent.quiz
        .slice(0, 20)
        .map((q, index) => `- ${index + 1}. ${q.question || ""} | correct: ${q.correct || ""}`)
        .join("\n")}`,
    );
  }
  return parts.join("\n\n").trim();
}

function getItemSourceIds(item = {}, fallback = [], allowed = []) {
  const sourceIds = normalizeSourceIds(
    item?.source_ids || item?.sourceIds || (item?.source_id ? [item.source_id] : []),
    fallback,
  );
  const allowedIds = normalizeSourceIds(allowed, []);
  if (allowedIds.length === 0) return sourceIds;
  const allowedSet = new Set(allowedIds);
  const filtered = sourceIds.filter((sourceId) => allowedSet.has(sourceId));
  if (filtered.length > 0) return filtered;
  return normalizeSourceIds(fallback, []).filter((sourceId) => allowedSet.has(sourceId));
}

function normalizeArtifactFlashcards(cards = [], allowedSourceIds = [], fallbackSourceIds = []) {
  return cards
    .map((card) => ({
      front: typeof card?.front === "string" ? card.front.trim() : "",
      back: typeof card?.back === "string" ? card.back.trim() : "",
      source_ids: getItemSourceIds(card, fallbackSourceIds, allowedSourceIds),
    }))
    .filter((card) => card.front && card.back);
}

function normalizeArtifactQuiz(questions = [], allowedSourceIds = [], fallbackSourceIds = []) {
  return questions
    .map((question) => ({
      question: typeof question?.question === "string" ? question.question.trim() : "",
      options: Array.isArray(question?.options) ? question.options.map((option) => String(option).trim()).filter(Boolean).slice(0, 4) : [],
      correct: typeof question?.correct === "string" ? question.correct.trim() : "",
      explanation: typeof question?.explanation === "string" ? question.explanation.trim() : "",
      source_ids: getItemSourceIds(question, fallbackSourceIds, allowedSourceIds),
    }))
    .filter((question) => question.question && question.options.length >= 2 && question.correct);
}

export default function StudyWorkbench() {
  const navigate = useNavigate();
  const location = useLocation();
  const { courseId, topicId } = useParams();
  const searchParams = new URLSearchParams(location.search);
  const routeConversationId = searchParams.get("conversation") || "";
  const routeCourseId = courseId || searchParams.get("course") || "";
  const routeTopicId = topicId || searchParams.get("topic") || "";
  const persistedStateRef = useRef();
  if (persistedStateRef.current === undefined) {
    persistedStateRef.current = readWorkbenchState();
  }
  const persistedState = persistedStateRef.current;
  const usePersistedState = !routeConversationId && !routeCourseId && !routeTopicId && Boolean(persistedState);
  const initialConversationId = routeConversationId;
  const initialCourseId = routeCourseId || (usePersistedState ? String(persistedState?.selectedCourseId || "") : "");
  const initialTopicId = routeTopicId || (usePersistedState ? String(persistedState?.selectedTopicId || "") : "");
  const initialDepth = usePersistedState && ["beginner", "intermediate", "advanced"].includes(persistedState?.depth)
    ? persistedState.depth
    : "intermediate";
  const initialStudyMode = usePersistedState && ["explain", "worked_example", "practice", "review"].includes(persistedState?.studyMode)
    ? persistedState.studyMode
    : "explain";
  const initialRemainingMinutes = Math.max(1, Math.min(180, Number.parseInt(usePersistedState ? persistedState?.remainingMinutesInput : 25, 10) || 25));
  const initialRemainingSeconds = Math.max(0, Number.parseInt(usePersistedState ? persistedState?.remainingSeconds : initialRemainingMinutes * 60, 10) || initialRemainingMinutes * 60);

  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(() => (
    usePersistedState && persistedState?.activeConversation && typeof persistedState.activeConversation === "object"
      ? persistedState.activeConversation
      : null
  ));
  const [selectedCourseId, setSelectedCourseId] = useState(initialCourseId);
  const [selectedTopicId, setSelectedTopicId] = useState(initialTopicId);
  const [depth, setDepth] = useState(initialDepth);
  const [studyMode, setStudyMode] = useState(initialStudyMode);
  const [reviewModeActive, setReviewModeActive] = useState(() => Boolean(usePersistedState && persistedState?.reviewModeActive));
  const [activeReviewTaskId, setActiveReviewTaskId] = useState(() => (
    usePersistedState && persistedState?.activeReviewTaskId ? String(persistedState.activeReviewTaskId) : ""
  ));
  const [reviewConfidence, setReviewConfidence] = useState(() => normalizeConfidence(usePersistedState ? persistedState?.reviewConfidence : 3, 3));
  const [reviewAnswerRevealed, setReviewAnswerRevealed] = useState(() => Boolean(usePersistedState && persistedState?.reviewAnswerRevealed));
  const [sessionConfidenceBefore, setSessionConfidenceBefore] = useState(() => normalizeConfidence(usePersistedState ? persistedState?.sessionConfidenceBefore : 3, 3));
  const [sessionConfidenceAfter, setSessionConfidenceAfter] = useState(() => normalizeConfidence(usePersistedState ? persistedState?.sessionConfidenceAfter : 3, 3));
  const [messages, setMessages] = useState(() => normalizePersistedMessages(usePersistedState ? persistedState?.messages : []));
  const [input, setInput] = useState(() => (usePersistedState && typeof persistedState?.input === "string" ? persistedState.input : ""));
  const [loading, setLoading] = useState(false);
  const [pendingActions, setPendingActions] = useState(() => (
    usePersistedState && Array.isArray(persistedState?.pendingActions) ? persistedState.pendingActions : []
  ));
  const [runtime, setRuntime] = useState(null);
  const [session, setSession] = useState(() => (
    usePersistedState && persistedState?.session && typeof persistedState.session === "object" ? persistedState.session : null
  ));
  const [courseTasks, setCourseTasks] = useState([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(() => Math.max(0, Number.parseInt(usePersistedState ? persistedState?.elapsedSeconds : 0, 10) || 0));
  const [remainingSeconds, setRemainingSeconds] = useState(initialRemainingSeconds);
  const [remainingMinutesInput, setRemainingMinutesInput] = useState(initialRemainingMinutes);
  const [timerPaused, setTimerPaused] = useState(() => Boolean(usePersistedState && persistedState?.timerPaused));
  const [generatedContent, setGeneratedContent] = useState(() => normalizePersistedArtifacts(usePersistedState ? persistedState?.generatedContent : DEFAULT_ARTIFACTS));
  const [generatingContent, setGeneratingContent] = useState(false);
  const [selectedArtifactTab, setSelectedArtifactTab] = useState(() => (
    usePersistedState && typeof persistedState?.selectedArtifactTab === "string" ? persistedState.selectedArtifactTab : "summary"
  ));
  const [mindmaps, setMindmaps] = useState([]);
  const [mindmapTitleDrafts, setMindmapTitleDrafts] = useState({});
  const [summaryCandidates, setSummaryCandidates] = useState([]);
  const [deckCandidates, setDeckCandidates] = useState([]);
  const [quizCandidates, setQuizCandidates] = useState([]);
  const [quizQuestionRows, setQuizQuestionRows] = useState([]);
  const [selectedSummaryItem, setSelectedSummaryItem] = useState("");
  const [selectedDeckItem, setSelectedDeckItem] = useState("");
  const [selectedQuizItem, setSelectedQuizItem] = useState("");
  const [summaryEditorToken, setSummaryEditorToken] = useState(0);
  const [cardsEditorSignal, setCardsEditorSignal] = useState(0);
  const [quizEditorSignal, setQuizEditorSignal] = useState(0);
  const [manualCardDialogOpen, setManualCardDialogOpen] = useState(false);
  const [manualCardFront, setManualCardFront] = useState("");
  const [manualCardBack, setManualCardBack] = useState("");
  const [manualQuizDialogOpen, setManualQuizDialogOpen] = useState(false);
  const [manualQuizQuestion, setManualQuizQuestion] = useState("");
  const [manualQuizOptions, setManualQuizOptions] = useState(["Option A", "Option B", "Option C", "Option D"]);
  const [manualQuizCorrect, setManualQuizCorrect] = useState("Option A");
  const [manualQuizExplanation, setManualQuizExplanation] = useState("");
  const [chatSidebarOpen, setChatSidebarOpen] = useState(() => !(usePersistedState && persistedState?.chatSidebarOpen === false));
  const [showAttachMaterial, setShowAttachMaterial] = useState(false);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completionReason, setCompletionReason] = useState("manual_stop");
  const [completionConfidenceDraft, setCompletionConfidenceDraft] = useState("3");
  const [completionRestartRequested, setCompletionRestartRequested] = useState(false);
  const [completionRestartMinutes, setCompletionRestartMinutes] = useState(String(initialRemainingMinutes));
  const scrollRef = useRef(null);
  const scheduledReviewKeysRef = useRef(new Set());
  const previousStudyModeRef = useRef("explain");
  const timerCompletionHandledRef = useRef(false);

  useEffect(() => {
    let active = true;

    const loadInitialData = async () => {
      try {
        const [courseRows, conversationRows, runtimeConfig] = await Promise.all([
          studybridge.entities.Course.filter({ status: "active" }, "-created_date", 50),
          listAIConversations(),
          loadDesktopAiRuntime(),
        ]);

        if (!active) return;

        setCourses(courseRows);
        setConversations(conversationRows);
        setRuntime(runtimeConfig);

        if (initialConversationId) {
          await loadConversation(initialConversationId);
        }
      } catch (error) {
        console.error("Failed to load study workbench data", error);
      }
    };

    loadInitialData();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session?.id) return;
    let active = true;

    studybridge.entities.StudySession.filter({ id: session.id }, null, 1)
      .then((rows) => {
        if (!active) return;
        const record = rows?.[0];
        if (!record) {
          setSession(null);
          return;
        }
        syncSessionState(record);
      })
      .catch((error) => console.error("Failed to restore study session state", error));

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  useEffect(() => {
    if (!selectedCourseId) {
      setTopics([]);
      setSelectedTopicId("");
      return;
    }

    studybridge.entities.Topic.filter({ course_id: selectedCourseId }, "order", 100)
      .then((rows) => {
        setTopics(rows);
        if (selectedTopicId && !rows.some((topicRow) => topicRow.id === selectedTopicId)) {
          setSelectedTopicId("");
        }
      })
      .catch((error) => console.error("Failed to load topics", error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId]);

  useEffect(() => {
    if (!selectedCourseId) {
      setMindmaps([]);
      return;
    }

    const filters = {
      course_id: selectedCourseId,
      source: "mindmap",
    };

    studybridge.entities.StudyGuide.filter(filters, "-updated_date", 30)
      .then((rows) => {
        if (!selectedTopicId) {
          setMindmaps(rows);
          return;
        }
        setMindmaps(rows.filter((row) => !row.topic_id || row.topic_id === selectedTopicId));
      })
      .catch((error) => console.error("Failed to load mindmaps", error));
  }, [selectedCourseId, selectedTopicId]);

  useEffect(() => {
    if (!selectedCourseId) {
      setSummaryCandidates([]);
      setDeckCandidates([]);
      setQuizCandidates([]);
      setQuizQuestionRows([]);
      setSelectedSummaryItem("");
      setSelectedDeckItem("");
      setSelectedQuizItem("");
      return;
    }

    const loadExistingArtifacts = async () => {
      const [notes, guides, decks, quizzes, questions] = await Promise.all([
        studybridge.entities.Note.filter({ course_id: selectedCourseId }, "-created_date", 100),
        studybridge.entities.StudyGuide.filter({ course_id: selectedCourseId }, "-updated_date", 100),
        studybridge.entities.FlashcardDeck.filter({ course_id: selectedCourseId }, "-created_date", 100),
        studybridge.entities.Quiz.filter({ course_id: selectedCourseId }, "-created_date", 100),
        studybridge.entities.QuizQuestion.filter({ course_id: selectedCourseId }, "order", 500),
      ]);

      const topicScoped = (rows) => (
        selectedTopicId ? rows.filter((row) => !row.topic_id || row.topic_id === selectedTopicId) : rows
      );

      const scopedNotes = topicScoped(notes);
      const scopedGuides = topicScoped(guides).filter((guide) => guide.source !== "mindmap");
      const scopedDecks = topicScoped(decks);
      const scopedQuizzes = topicScoped(quizzes);

      setSummaryCandidates([
        ...scopedNotes.map((note) => ({ key: `note:${note.id}`, label: `Note: ${note.title || "Untitled"}`, item: note })),
        ...scopedGuides.map((guide) => ({ key: `guide:${guide.id}`, label: `Guide: ${guide.title || "Untitled"}`, item: guide })),
      ]);
      setDeckCandidates(scopedDecks);
      setQuizCandidates(scopedQuizzes);
      setQuizQuestionRows(questions);
    };

    loadExistingArtifacts().catch((error) => console.error("Failed to load existing study artifacts", error));
  }, [selectedCourseId, selectedTopicId]);

  useEffect(() => {
    setMindmapTitleDrafts((current) => {
      const next = { ...current };
      mindmaps.forEach((mapItem) => {
        if (!(mapItem.id in next)) {
          next[mapItem.id] = mapItem.title || "Untitled mind map";
        }
      });
      return next;
    });
  }, [mindmaps]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (session?.status !== "active" || timerPaused || remainingSeconds <= 0) return undefined;

    const interval = setInterval(() => {
      setElapsedSeconds((value) => value + 1);
      setRemainingSeconds((value) => Math.max(0, value - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [remainingSeconds, session?.status, timerPaused]);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId);
  const selectedTopic = topics.find((topic) => topic.id === selectedTopicId);
  const aiUnavailable = isDesktopAiUnavailable(runtime);
  const selectionLocked = Boolean(session) || messages.length > 0 || Boolean(activeConversation);
  const conversationLocked = session?.status === "active";
  const workspaceReady = isCourseTopicReady(selectedCourse, selectedTopic);
  const workspaceBusy = loading || generatingContent;

  useEffect(() => {
    if (session) return;
    const baselineConfidence = normalizeConfidence(selectedTopic?.confidence ?? 3, 3);
    setSessionConfidenceBefore(baselineConfidence);
    setSessionConfidenceAfter(baselineConfidence);
  }, [selectedTopicId, selectedTopic?.confidence, session?.status]);

  useEffect(() => {
    if (pendingActions.length > 0 && !chatSidebarOpen) {
      setChatSidebarOpen(true);
    }
  }, [chatSidebarOpen, pendingActions.length]);

  useEffect(() => {
    let active = true;

    if (!selectedCourseId) {
      setCourseTasks([]);
      return undefined;
    }

    refreshCourseTasks(selectedCourseId)
      .then((rows) => {
        if (!active) return;
        setCourseTasks(rows);
      })
      .catch((error) => console.error("Failed to load review tasks", error));

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId]);

  const setRemainingMinutes = (minutes) => {
    const safeMinutes = Math.max(1, Math.min(180, Number.parseInt(minutes, 10) || 1));
    setRemainingMinutesInput(safeMinutes);
    setRemainingSeconds(safeMinutes * 60);
  };

  const createActiveSession = async ({ plannedMinutes, confidence, mode = studyMode }) => (
    studybridge.entities.StudySession.create({
      course_id: selectedCourse.id,
      topic_id: selectedTopic.id,
      course_title: selectedCourse.title,
      topic_title: selectedTopic.title,
      mode,
      study_mode: mode,
      status: "active",
      started_at: new Date().toISOString(),
      planned_duration_minutes: plannedMinutes,
      confidence_before: confidence,
      confidence_after: confidence,
    })
  );

  const startFollowUpSession = async ({ baselineConfidence, plannedMinutes = remainingMinutesInput }) => {
    if (!selectedCourse?.id || !selectedTopic?.id) return false;
    const clampedMinutes = Math.max(1, Math.min(180, Number.parseInt(plannedMinutes, 10) || remainingMinutesInput || 25));
    const confidence = normalizeConfidence(baselineConfidence ?? selectedTopic?.confidence ?? 3, 3);
    const createdSession = await createActiveSession({
      plannedMinutes: clampedMinutes,
      confidence,
      mode: studyMode,
    });

    syncSessionState(createdSession);
    setRemainingMinutesInput(clampedMinutes);
    setSessionConfidenceBefore(confidence);
    setSessionConfidenceAfter(confidence);
    setTimerPaused(false);
    timerCompletionHandledRef.current = false;
    if (activeConversation?.id) {
      setActiveConversation((current) => (current ? { ...current, session_id: createdSession.id } : current));
    }
    toast({
      title: "New session started",
      description: `Timer set to ${clampedMinutes} minutes.`,
    });
    return true;
  };

  const openSessionCompletionDialog = ({ reason = "manual_stop" } = {}) => {
    if (!session?.id || session.status !== "active" || !selectedCourse?.id || !selectedTopic?.id) return;
    const beforeConfidence = normalizeConfidence(sessionConfidenceBefore ?? selectedTopic.confidence ?? 3, 3);
    const currentConfidence = normalizeConfidence(sessionConfidenceAfter ?? beforeConfidence, beforeConfidence);
    if (reason === "timer_elapsed") {
      setRemainingSeconds(0);
      setTimerPaused(true);
    }
    setCompletionReason(reason);
    setCompletionConfidenceDraft(String(currentConfidence));
    setCompletionRestartRequested(reason === "timer_elapsed");
    setCompletionRestartMinutes(String(Math.max(1, remainingMinutesInput || 25)));
    setCompletionDialogOpen(true);
  };

  const handleExitWorkspace = () => {
    if (session?.status === "active") {
      openSessionCompletionDialog({ reason: "manual_stop" });
      return;
    }
    clearWorkspaceState();
  };

  const clearWorkspaceState = () => {
    clearWorkbenchState();
    setActiveConversation(null);
    setMessages([]);
    setPendingActions([]);
    setInput("");
    setSession(null);
    setReviewModeActive(false);
    setActiveReviewTaskId("");
    setReviewConfidence(3);
    setReviewAnswerRevealed(false);
    setStudyMode(previousStudyModeRef.current || "explain");
    setElapsedSeconds(0);
    setRemainingSeconds(remainingMinutesInput * 60);
    setTimerPaused(false);
    setGeneratedContent(DEFAULT_ARTIFACTS);
    setGeneratingContent(false);
    setSelectedArtifactTab("summary");
    setShowAttachMaterial(false);
    setCompletionDialogOpen(false);
    timerCompletionHandledRef.current = false;
    const baselineConfidence = normalizeConfidence(selectedTopic?.confidence ?? 3, 3);
    setSessionConfidenceBefore(baselineConfidence);
    setSessionConfidenceAfter(baselineConfidence);
    scheduledReviewKeysRef.current = new Set();
  };

  const syncSessionState = (record) => {
    setSession(record);
    const plannedMinutes = Math.max(1, Number.parseInt(record?.planned_duration_minutes, 10) || remainingMinutesInput || 25);
    setRemainingMinutesInput(plannedMinutes);
    const beforeConfidence = normalizeConfidence(record?.confidence_before ?? selectedTopic?.confidence ?? 3, 3);
    const afterConfidence = normalizeConfidence(record?.confidence_after ?? beforeConfidence, beforeConfidence);
    setSessionConfidenceBefore(beforeConfidence);
    setSessionConfidenceAfter(afterConfidence);
    if (["explain", "worked_example", "practice", "review"].includes(record?.study_mode)) {
      setStudyMode(record.study_mode);
    }

    if (record?.status === "active" && record?.started_at) {
      timerCompletionHandledRef.current = false;
      const startedAt = new Date(record.started_at).getTime();
      const elapsed = Number.isFinite(startedAt) ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
      setElapsedSeconds(elapsed);
      setRemainingSeconds(Math.max(0, plannedMinutes * 60 - elapsed));
      setTimerPaused(false);
      return;
    }

    setElapsedSeconds(Math.max(0, Number.parseInt(record?.duration_minutes, 10) || 0) * 60);
    setRemainingSeconds(0);
    setTimerPaused(true);
  };

  const refreshConversations = async () => {
    const rows = await listAIConversations();
    setConversations(rows);
  };

  const refreshCourseTasks = async (courseId = selectedCourseId) => {
    if (!courseId) {
      setCourseTasks([]);
      return [];
    }

    const rows = await studybridge.entities.Task.filter({ course_id: courseId }, "due_date", 200);
    setCourseTasks(rows);
    return rows;
  };

  const refreshTopicsAfterActions = async (actionResults) => {
    if (!selectedCourse?.id || !actionResults.some((result) => result.ok && result.label === "topic")) return;
    const updatedTopics = await studybridge.entities.Topic.filter({ course_id: selectedCourse.id }, "order", 100);
    setTopics(updatedTopics);
  };

  const refreshSelectedCourseTopics = async (courseId = selectedCourse?.id) => {
    if (!courseId) return [];
    const rows = await studybridge.entities.Topic.filter({ course_id: courseId }, "order", 100);
    setTopics(rows);
    return rows;
  };

  const exitReviewMode = (restoreStudyMode = true) => {
    setReviewModeActive(false);
    setActiveReviewTaskId("");
    setReviewAnswerRevealed(false);
    setReviewConfidence(3);
    if (restoreStudyMode) {
      setStudyMode(previousStudyModeRef.current || "explain");
    }
  };

  const enterReviewMode = (task = null) => {
    const targetTask = task || nextDueReviewTask;
    if (!targetTask) return null;
    const dueDate = targetTask.due_date ? new Date(targetTask.due_date).getTime() : Date.now();
    if (targetTask.due_date && dueDate > Date.now()) return null;

    if (!reviewModeActive) {
      previousStudyModeRef.current = studyMode;
    }

    setStudyMode("review");
    setReviewModeActive(true);
    setActiveReviewTaskId(targetTask.id);
    setReviewAnswerRevealed(false);
    setReviewConfidence(normalizeConfidence(targetTask.review_last_confidence ?? targetTask.confidence_after ?? selectedTopic?.confidence ?? 3, 3));
    return targetTask;
  };

  const startWorkedExampleRetry = (task = null) => {
    const targetTask = task || activeReviewTask || nextDueReviewTask || nextUpcomingReviewTask;
    const prompt = targetTask?.review_prompt || targetTask?.title || selectedTopic?.title || "this topic";
    exitReviewMode(false);
    setStudyMode("worked_example");
    setInput(`Show me a worked example for ${prompt}. Break it into steps, explain why each step matters, and then ask me a follow-up question.`);
  };

  const scheduleReviewTask = async (payload) => {
    if (!selectedCourse?.id || !payload?.review_key) return null;

    const existingTask = courseTasks.find((task) => task.review_key === payload.review_key && task.status !== "completed") || null;

    if (existingTask) {
      if (!shouldPersistReviewTask(courseTasks, payload)) {
        return existingTask;
      }

      const existingFields = { ...existingTask };
      delete existingFields.id;
      delete existingFields.created_date;
      delete existingFields.updated_date;
      const updatedTask = await studybridge.entities.Task.update(existingTask.id, {
        ...existingFields,
        ...payload,
        course_id: selectedCourse.id,
        topic_id: payload.topic_id || selectedTopic?.id || existingTask.topic_id || null,
        course_title: selectedCourse.title,
        topic_title: payload.topic_title || selectedTopic?.title || existingTask.topic_title || null,
      });

      setCourseTasks((current) => current.map((task) => (task.id === existingTask.id ? updatedTask : task)));
      scheduledReviewKeysRef.current.add(payload.review_key);
      return updatedTask;
    }

    if (scheduledReviewKeysRef.current.has(payload.review_key) || !shouldPersistReviewTask(courseTasks, payload)) {
      return null;
    }

    const createdTask = await studybridge.entities.Task.create({
      ...payload,
      course_id: selectedCourse.id,
      topic_id: payload.topic_id || selectedTopic?.id || null,
      course_title: selectedCourse.title,
      topic_title: payload.topic_title || selectedTopic?.title || null,
      source: payload.source || "study_workbench",
      status: payload.status || "todo",
    });

    scheduledReviewKeysRef.current.add(payload.review_key);
    setCourseTasks((current) => [createdTask, ...current]);
    return createdTask;
  };

  const queueConceptReview = async ({
    kind,
    label,
    sourceId,
    sourceIds = [],
    question,
    answer,
    explanation,
    front,
    back,
    result = "incorrect",
    shaky = false,
    confidenceBefore = sessionConfidenceBefore,
    confidenceAfter = sessionConfidenceAfter,
    dueDays = null,
    estimatedMinutes = 15,
    priority = "high",
  }) => {
    const payload = buildReviewTaskPayload({
      course: selectedCourse,
      topic: selectedTopic,
      kind,
      label,
      sourceId,
      question,
      answer,
      explanation,
      front,
      back,
      result,
      shaky,
      confidenceBefore,
      confidenceAfter,
      sourceIds: normalizeSourceIds(sourceIds, generatedContent.sourceCatalog?.map((source) => source.id) || []),
      sourceCatalog: generatedContent.sourceCatalog || [],
      dueDays,
      estimatedMinutes,
      priority,
      reviewSource: "study_workbench",
      sessionId: session?.id,
    });

    return scheduleReviewTask(payload);
  };

  const handleQuizResult = async ({ question, questionIndex, isCorrect, correctAnswer }) => {
    if (isCorrect) return null;

    return queueConceptReview({
      kind: "quiz",
      label: question.question || `Quiz item ${questionIndex + 1}`,
      sourceId: `quiz-${questionIndex}-${question.question || "question"}`,
      sourceIds: getItemSourceIds(question, generatedContent.summarySourceIds, generatedContent.sourceCatalog?.map((source) => source.id) || []),
      question: question.question,
      answer: correctAnswer,
      explanation: question.explanation,
      result: "incorrect",
      shaky: true,
      confidenceAfter: 1,
      estimatedMinutes: 15,
      priority: "high",
    });
  };

  const handleFlashcardResult = async ({ card, cardIndex, result }) => {
    if (result !== "incorrect") return null;

    return queueConceptReview({
      kind: "flashcard",
      label: card.front || `Flashcard ${cardIndex + 1}`,
      sourceId: `flashcard-${cardIndex}-${card.front || "card"}`,
      sourceIds: getItemSourceIds(card, generatedContent.summarySourceIds, generatedContent.sourceCatalog?.map((source) => source.id) || []),
      front: card.front,
      back: card.back,
      result: "incorrect",
      shaky: true,
      confidenceAfter: 1,
      estimatedMinutes: 10,
      priority: "high",
    });
  };

  const completeReviewAttempt = async ({ task, outcome, confidence }) => {
    if (!task?.id || !selectedTopic?.id) return null;

    const plan = buildReviewOutcomePlan({
      task,
      topic: selectedTopic,
      outcome,
      confidence,
      reviewedAt: new Date(),
    });

    setLoading(true);
    try {
      const updatedTask = await studybridge.entities.Task.update(task.id, {
        ...task,
        ...plan.taskUpdates,
        course_id: selectedCourse?.id || task.course_id || null,
        topic_id: selectedTopic.id,
        course_title: selectedCourse?.title || task.course_title || null,
        topic_title: selectedTopic.title,
      });

      const updatedTopic = await studybridge.entities.Topic.update(selectedTopic.id, {
        ...selectedTopic,
        ...plan.topicUpdates,
      });

      setCourseTasks((current) => current.map((item) => (item.id === updatedTask.id ? updatedTask : item)));
      await refreshSelectedCourseTopics(selectedCourse?.id || selectedCourseId);
      const refreshedTasks = await refreshCourseTasks(selectedCourse?.id || selectedCourseId);
      const nextQueue = sortReviewTasks(getReviewTasks(refreshedTasks)).filter((item) => !item.due_date || new Date(item.due_date).getTime() <= Date.now());
      const nextTask = nextQueue[0] || null;
      if (nextTask) {
        setStudyMode("review");
        setReviewModeActive(true);
        setActiveReviewTaskId(nextTask.id);
        setReviewAnswerRevealed(false);
        setReviewConfidence(normalizeConfidence(nextTask.review_last_confidence ?? nextTask.confidence_after ?? updatedTopic.confidence ?? 3, 3));
      } else {
        exitReviewMode(true);
      }

      return { updatedTask, updatedTopic, plan };
    } catch (error) {
      console.error("Failed to update review outcome", error);
      window.alert(error.message || "Failed to save the review outcome.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const loadConversation = async (conversationId) => {
    if (!conversationId) return;

    const record = await loadAIConversation(conversationId);
    if (!record) return;

    const conversationMessages = Array.isArray(record.messages) ? record.messages : [];
    setActiveConversation(record);
    setMessages(conversationMessages);
    setPendingActions(getRecoverablePendingActions(conversationMessages));
    setSelectedCourseId(record.course_id || initialCourseId || "");
    setSelectedTopicId(record.topic_id || initialTopicId || "");
    setGeneratedContent(DEFAULT_ARTIFACTS);
    setInput("");
    scheduledReviewKeysRef.current = new Set();
    exitReviewMode(true);

    if (record.session_id) {
      try {
        const [sessionRecord] = await studybridge.entities.StudySession.filter({ id: record.session_id }, null, 1);
        if (sessionRecord) syncSessionState(sessionRecord);
      } catch (error) {
        console.error("Failed to load linked study session", error);
      }
    } else {
      setSession(null);
      setElapsedSeconds(0);
      setRemainingSeconds(remainingMinutesInput * 60);
      setTimerPaused(false);
    }

    navigate(`/study?conversation=${record.id}`, { replace: true });
  };

  const finishSession = async ({
    afterConfidenceInput,
    restartAfterCompletion = false,
    restartMinutesInputValue,
  } = {}) => {
    if (!session?.id || session.status !== "active" || !selectedCourse?.id || !selectedTopic?.id) return;

    const durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    const completedAt = new Date().toISOString();
    const beforeConfidence = normalizeConfidence(sessionConfidenceBefore ?? selectedTopic.confidence ?? 3, 3);
    const afterConfidence = normalizeConfidence(afterConfidenceInput ?? sessionConfidenceAfter ?? beforeConfidence, beforeConfidence);
    setSessionConfidenceAfter(afterConfidence);

    await studybridge.entities.StudySession.update(session.id, {
      status: "completed",
      completed_at: completedAt,
      duration_minutes: durationMinutes,
      confidence_before: beforeConfidence,
      confidence_after: afterConfidence,
      study_mode: studyMode,
    });

    const newMastery = Math.min(100, (selectedTopic.mastery_level || 0) + Math.round(durationMinutes * 1.5));
    await studybridge.entities.Topic.update(selectedTopic.id, {
      mastery_level: newMastery,
      confidence: afterConfidence,
      status: newMastery >= 80 ? "mastered" : newMastery > 0 ? "in_progress" : "not_started",
      total_study_time: (selectedTopic.total_study_time || 0) + durationMinutes,
      last_studied: completedAt,
    });

    await scheduleReviewTask(buildReviewTaskPayload({
      course: selectedCourse,
      topic: selectedTopic,
      kind: "session_confidence",
      label: `${selectedTopic.title} session review`,
      sourceId: selectedTopic.id,
      question: `Revisit ${selectedTopic.title} from memory and close the weakest gap.`,
      answer: `Session confidence moved from ${beforeConfidence}/5 to ${afterConfidence}/5.`,
      result: afterConfidence <= 2 ? "incorrect" : "correct",
      shaky: afterConfidence <= 3 || afterConfidence <= beforeConfidence,
      confidenceBefore: beforeConfidence,
      confidenceAfter: afterConfidence,
      sourceIds: ["current-topic"],
      sourceCatalog: [],
      dueDays: afterConfidence <= 2 ? 1 : undefined,
      estimatedMinutes: afterConfidence <= 2 ? 20 : 15,
      priority: afterConfidence <= 2 ? "high" : "medium",
      reviewSource: "study_session",
      sessionId: session.id,
    }));

    await refreshSelectedCourseTopics(selectedCourse.id);
    setSession((current) => (current ? { ...current, status: "completed", completed_at: completedAt, duration_minutes: durationMinutes } : current));
    setTimerPaused(true);
    setRemainingSeconds(0);
    await refreshCourseTasks(selectedCourse.id);

    if (restartAfterCompletion) {
      await startFollowUpSession({
        baselineConfidence: afterConfidence,
        plannedMinutes: restartMinutesInputValue,
      });
    }
  };

  const submitSessionCompletion = async (event) => {
    event.preventDefault();
    const nextConfidence = normalizeConfidence(completionConfidenceDraft, sessionConfidenceBefore);
    const wantsRestart = Boolean(completionRestartRequested);
    const nextMinutes = Math.max(1, Math.min(180, Number.parseInt(completionRestartMinutes, 10) || remainingMinutesInput || 25));

    if (wantsRestart && (!Number.isFinite(nextMinutes) || nextMinutes < 1 || nextMinutes > 180)) {
      window.alert("Set a valid timer between 1 and 180 minutes.");
      return;
    }

    setLoading(true);
    try {
      await finishSession({
        afterConfidenceInput: nextConfidence,
        restartAfterCompletion: wantsRestart,
        restartMinutesInputValue: nextMinutes,
      });
      setCompletionDialogOpen(false);
    } catch (error) {
      console.error("Failed to complete session", error);
      window.alert(error?.message || "Failed to complete this session.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.status !== "active") {
      timerCompletionHandledRef.current = false;
      return;
    }
    if (remainingSeconds > 0) {
      timerCompletionHandledRef.current = false;
      return;
    }
    if (timerPaused || timerCompletionHandledRef.current) return;
    timerCompletionHandledRef.current = true;
    openSessionCompletionDialog({ reason: "timer_elapsed" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds, session?.status, timerPaused]);

  const generateArtifacts = async (course, topic, mode = studyMode) => {
    if (!course?.id || !topic?.id) return DEFAULT_ARTIFACTS;

    setGeneratingContent(true);
    try {
      const contextBundle = await loadStudyContextBundle({ course, topic });
      const result = await studybridge.integrations.Core.InvokeLLM({
        prompt: `You are an expert university tutor inside StudyBridge. Generate study content for the topic "${topic.title}" in the course "${course.title}".

Use this live StudyBridge context as the source of truth:
${contextBundle.context}

Generate content at a ${depth} level.
Study mode: ${mode}
Mode guidance: ${buildStudyModeGuidance(mode)}

If the mode is "worked_example", include one concrete step-by-step worked example in the summary and briefly explain why each step matters before moving on.
If the mode is "practice", emphasize retrieval prompts and short checks for understanding.
If the mode is "review", emphasize weak points, common mistakes, and what to revisit next.
Attach source ids to every generated artifact:
- summary_source_ids should list the sources used for the summary.
- Each flashcard should include source_ids.
- Each quiz question should include source_ids.
Use only the allowed source ids from the context.

Generate:
1. A clear, well-structured summary using markdown with headers and bullet points
2. 6 flashcards (question/answer pairs) covering the key concepts
3. 5 multiple-choice quiz questions with 4 options each

Return as JSON with this structure:
{
  "summary": "markdown formatted summary...",
  "summary_source_ids": ["current-topic", "material-1"],
  "flashcards": [{"front": "question", "back": "answer", "source_ids": ["material-1"]}],
  "quiz": [{"question": "...", "options": ["A", "B", "C", "D"], "correct": "A", "explanation": "...", "source_ids": ["topic-1"]}]
}`,
        response_json_schema: ARTIFACT_SCHEMA,
      });

      const sourceCatalog = contextBundle.sourceCatalog || [];
      const allowedSourceIds = sourceCatalog.map((source) => source.id);
      const summarySourceIds = getItemSourceIds(
        { source_ids: result.summary_source_ids || result.summarySourceIds || [] },
        allowedSourceIds.slice(0, 4),
        allowedSourceIds,
      );
      const flashcards = normalizeArtifactFlashcards(result.flashcards || [], allowedSourceIds, summarySourceIds);
      const quiz = normalizeArtifactQuiz(result.quiz || [], allowedSourceIds, summarySourceIds);

      return {
        summary: normalizeRichTextInput(result.summary || "No summary returned."),
        summarySourceIds,
        flashcards,
        quiz,
        sourceCatalog,
      };
    } catch (error) {
      console.error("Failed to generate study artifacts", error);
      const isAiUnavailableError = error?.code === "AI_UNAVAILABLE" || /AI is disabled/i.test(error?.message || "");
      return {
        summary: isAiUnavailableError
          ? "AI is not configured on this desktop yet. Open Settings to download the local runtime or add a cloud API key, then restart the workbench."
          : `Study artifact generation failed: ${error.message || "Unknown AI error."}`,
        flashcards: [],
        quiz: [],
        sourceCatalog: [],
        summarySourceIds: [],
      };
    } finally {
      setGeneratingContent(false);
    }
  };

  const regenerateArtifacts = async () => {
    if (!selectedCourse?.id || !selectedTopic?.id || workspaceBusy || aiUnavailable || !session?.id) return;
    const artifacts = await generateArtifacts(selectedCourse, selectedTopic, studyMode);
    setGeneratedContent(artifacts);
  };

  const formatGuideAsSummary = (guide) => {
    const concepts = Array.isArray(guide?.key_concepts) ? guide.key_concepts.filter(Boolean) : [];
    const sections = Array.isArray(guide?.sections) ? guide.sections : [];
    const sectionLines = sections
      .slice(0, 30)
      .map((section) => {
        if (typeof section === "string") return `- ${section}`;
        if (!section || typeof section !== "object") return "";
        const title = section.title || section.heading || section.label || "Section";
        const note = section.note || section.content || section.text || "";
        return `- **${title}**${note ? `: ${note}` : ""}`;
      })
      .filter(Boolean);
    const markdown = [
      `# ${guide?.title || "Study guide summary"}`,
      concepts.length > 0 ? `## Key concepts\n${concepts.map((item) => `- ${item}`).join("\n")}` : "",
      sectionLines.length > 0 ? `## Sections\n${sectionLines.join("\n")}` : "",
    ].filter(Boolean).join("\n\n");
    return normalizeRichTextInput(markdown);
  };

  const updateSummaryContent = (nextSummary) => {
    setGeneratedContent((prev) => ({ ...prev, summary: normalizeRichTextInput(nextSummary) }));
  };

  const updateFlashcardsContent = (nextCards) => {
    setGeneratedContent((prev) => ({
      ...prev,
      flashcards: Array.isArray(nextCards) ? nextCards : [],
    }));
  };

  const updateQuizContent = (nextQuestions) => {
    setGeneratedContent((prev) => ({
      ...prev,
      quiz: Array.isArray(nextQuestions) ? nextQuestions : [],
    }));
  };

  const loadSelectedSummaryCandidate = (value) => {
    setSelectedSummaryItem(value);
    if (!value) return;
    const selected = summaryCandidates.find((candidate) => candidate.key === value);
    if (!selected) return;
    if (value.startsWith("note:")) {
      setGeneratedContent((prev) => ({ ...prev, summary: normalizeRichTextInput(selected.item?.content || "") }));
      return;
    }
    if (value.startsWith("guide:")) {
      setGeneratedContent((prev) => ({ ...prev, summary: formatGuideAsSummary(selected.item) }));
    }
  };

  const loadSelectedDeck = (value) => {
    setSelectedDeckItem(value);
    if (!value) return;
    const deck = deckCandidates.find((item) => item.id === value);
    if (!deck) return;
    const deckCards = Array.isArray(deck.cards)
      ? deck.cards
      : Array.isArray(deck.flashcards)
        ? deck.flashcards
        : [];
    setGeneratedContent((prev) => ({ ...prev, flashcards: normalizeArtifactFlashcards(deckCards, [], prev.summarySourceIds || []) }));
  };

  const loadSelectedQuiz = (value) => {
    setSelectedQuizItem(value);
    if (!value) return;
    const quiz = quizCandidates.find((item) => item.id === value);
    if (!quiz) return;
    const questions = quizQuestionRows
      .filter((row) => row.quiz_id === quiz.id)
      .map((row) => ({
        question: row.question || "",
        options: Array.isArray(row.options) ? row.options : [],
        correct: row.correct || "",
        explanation: row.explanation || "",
        source_ids: [],
      }));
    setGeneratedContent((prev) => ({ ...prev, quiz: normalizeArtifactQuiz(questions, [], prev.summarySourceIds || []) }));
  };

  const addManualCardFromDialog = () => {
    const front = manualCardFront.trim();
    const back = manualCardBack.trim();
    if (!front || !back) return;
    updateFlashcardsContent([...(generatedContent.flashcards || []), { front, back, source_ids: [] }]);
    setManualCardFront("");
    setManualCardBack("");
    setManualCardDialogOpen(false);
    setCardsEditorSignal((value) => value + 1);
  };

  const addManualQuizFromDialog = () => {
    const question = manualQuizQuestion.trim();
    const options = manualQuizOptions.map((item) => String(item || "").trim()).filter(Boolean);
    const correct = manualQuizCorrect.trim();
    if (!question || options.length < 2 || !correct) return;
    updateQuizContent([...(generatedContent.quiz || []), {
      question,
      options,
      correct,
      explanation: manualQuizExplanation.trim(),
      source_ids: [],
    }]);
    setManualQuizQuestion("");
    setManualQuizOptions(["Option A", "Option B", "Option C", "Option D"]);
    setManualQuizCorrect("Option A");
    setManualQuizExplanation("");
    setManualQuizDialogOpen(false);
    setQuizEditorSignal((value) => value + 1);
  };

  const createMindmapDraft = async () => {
    if (!selectedCourse?.id) return;
    const created = await studybridge.entities.StudyGuide.create({
      course_id: selectedCourse.id,
      topic_id: selectedTopic?.id,
      title: `${selectedTopic?.title || selectedCourse.title} mind map`,
      difficulty: "custom",
      key_concepts: [],
      sections: [],
      source: "mindmap",
    });
    const rows = await studybridge.entities.StudyGuide.filter({ course_id: selectedCourse.id, source: "mindmap" }, "-updated_date", 30);
    setMindmaps(selectedTopic?.id ? rows.filter((row) => !row.topic_id || row.topic_id === selectedTopic.id) : rows);
    setMindmapTitleDrafts((prev) => ({ ...prev, [created.id]: created.title || "Untitled mind map" }));
  };

  const saveMindmapTitle = async (mapItem) => {
    const nextTitle = String(mindmapTitleDrafts[mapItem.id] || "").trim();
    if (!nextTitle) return;
    await studybridge.entities.StudyGuide.update(mapItem.id, { title: nextTitle });
    setMindmaps((prev) => prev.map((item) => (item.id === mapItem.id ? { ...item, title: nextTitle } : item)));
  };

  const startWorkbench = async () => {
    if (loading || generatingContent || aiUnavailable || !workspaceReady || session?.status === "active") return;

    setLoading(true);
    try {
      clearWorkspaceState();
      const baselineConfidence = normalizeConfidence(selectedTopic?.confidence ?? 3, 3);
      setSessionConfidenceBefore(baselineConfidence);
      setSessionConfidenceAfter(baselineConfidence);

      const createdSession = await createActiveSession({
        plannedMinutes: remainingMinutesInput,
        confidence: baselineConfidence,
        mode: studyMode,
      });

      syncSessionState(createdSession);
      const artifacts = await generateArtifacts(selectedCourse, selectedTopic, studyMode);
      setGeneratedContent(artifacts);
      navigate("/study", { replace: true });
    } catch (error) {
      console.error("Failed to start study workbench", error);
      window.alert(error.message || "Failed to start the study workbench.");
    } finally {
      setLoading(false);
    }
  };

  const cancelPendingActions = async ({ messagesBase = messages, conversationBase = activeConversation } = {}) => {
    const messagesWithCancel = [
      ...messagesBase,
      newMessage("assistant", "Pending StudyBridge actions canceled. No changes were applied.", { actionStatus: "canceled" }),
    ];

    setMessages(messagesWithCancel);
    setPendingActions([]);

    const saved = await saveAIConversation({
      conversation: conversationBase,
      messages: messagesWithCancel,
      course: selectedCourse,
      topic: selectedTopic,
      source: WORKBENCH_SOURCE,
      sessionId: session?.id,
    });

    setActiveConversation(saved);
    await refreshConversations();
    navigate(`/study?conversation=${saved.id}`, { replace: true });
  };

  const applyPendingActions = async ({ messagesBase = messages, conversationBase = activeConversation } = {}) => {
    if (!pendingActions.length) return;

    setLoading(true);
    try {
      const actionResults = await executeStudyActions({
        course: selectedCourse,
        topic: selectedTopic,
        sessionId: session?.id,
        actions: pendingActions,
      });

      await refreshTopicsAfterActions(actionResults);
      await refreshCourseTasks(selectedCourse.id);

      const summary = actionResults.map((result) => `- ${result.ok ? "Done" : "Failed"}: ${result.message}`).join("\n");
      const approvalMessage = `StudyBridge actions applied.\n\n**StudyBridge actions**\n${summary || "- No actions executed."}`;
      const messagesWithApproval = [...messagesBase, newMessage("assistant", approvalMessage, { actionStatus: "applied" })];
      setMessages(messagesWithApproval);
      setPendingActions([]);

      const saved = await saveAIConversation({
        conversation: conversationBase,
        messages: messagesWithApproval,
        course: selectedCourse,
        topic: selectedTopic,
        source: WORKBENCH_SOURCE,
        sessionId: session?.id,
      });
      setActiveConversation(saved);
      await refreshConversations();
      navigate(`/study?conversation=${saved.id}`, { replace: true });
    } catch (error) {
      setMessages((prev) => [...prev, newMessage("assistant", error.message || "Failed to apply pending actions.")]);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (text) => {
    if (reviewModeActive || !text.trim() || loading || generatingContent || aiUnavailable || !workspaceReady || !session?.id) return;

    const userMessage = newMessage("user", text.trim());
    const conversationBeforeTurn = activeConversation;
    const historyBeforeTurn = messages;
    const messagesWithUser = [...historyBeforeTurn, userMessage];

    setMessages(messagesWithUser);
    setInput("");

    if (pendingActions.length && isPendingActionApproval(userMessage.content)) {
      await applyPendingActions({
        messagesBase: messagesWithUser,
        conversationBase: conversationBeforeTurn,
      });
      return;
    }

    if (pendingActions.length && isPendingActionCancellation(userMessage.content)) {
      await cancelPendingActions({
        messagesBase: messagesWithUser,
        conversationBase: conversationBeforeTurn,
      });
      return;
    }

    setLoading(true);
    try {
      const contextBundle = await loadStudyContextBundle({ course: selectedCourse, topic: selectedTopic });
      const sessionArtifactsContext = buildSessionArtifactContext(generatedContent);
      const mergedContext = sessionArtifactsContext
        ? `${contextBundle.context}\n\n[session-artifacts]\n${sessionArtifactsContext}`
        : contextBundle.context;
      const turnResult = await runStudyTurn({
        course: selectedCourse,
        topic: selectedTopic,
        contextBundle: {
          ...contextBundle,
          context: mergedContext,
          sourceIds: (contextBundle.sourceIds || []).includes("session-artifacts")
            ? (contextBundle.sourceIds || [])
            : [...(contextBundle.sourceIds || []), "session-artifacts"],
          sourceCatalog: (contextBundle.sourceCatalog || []).some((source) => source.id === "session-artifacts")
            ? (contextBundle.sourceCatalog || [])
            : [
              ...(contextBundle.sourceCatalog || []),
              { id: "session-artifacts", label: "Session artifacts", detail: "Manual and generated summary/cards/quiz from this active study session." },
            ],
        },
        depth,
        history: historyBeforeTurn,
        studentText: userMessage.content,
        sessionId: session?.id,
        studyMode,
      });
      const nextPendingActions = Array.isArray(turnResult?.pendingActions) ? turnResult.pendingActions : [];
      const cleanReply = stripTutorMetaFooter(turnResult.reply);
      const messagesWithAssistant = [
        ...messagesWithUser,
        newMessage("assistant", cleanReply, {
          pendingActions: nextPendingActions,
          grounding: turnResult.grounding || [],
          nextStep: turnResult.nextStep || "",
          missingContext: turnResult.missingContext || [],
          sourceCatalog: turnResult.sourceCatalog || contextBundle.sourceCatalog || [],
          studyMode,
        }),
      ];

      setMessages(messagesWithAssistant);
      setPendingActions(nextPendingActions);

      const saved = await saveAIConversation({
        conversation: conversationBeforeTurn,
        messages: messagesWithAssistant,
        course: selectedCourse,
        topic: selectedTopic,
        source: WORKBENCH_SOURCE,
        sessionId: session?.id,
      });
      setActiveConversation(saved);
      await refreshConversations();
      navigate(`/study?conversation=${saved.id}`, { replace: true });
    } catch (error) {
      console.error("Study workbench request failed", error);
      setMessages((prev) => [...prev, newMessage("assistant", error.message || "The AI request failed. Check the runtime and try again.")]);
    } finally {
      setLoading(false);
    }
  };

  const saveAnswer = async (msg, idx) => {
    const question = messages[idx - 1]?.content || "";
    await saveAIAnswer({
      course: selectedCourse,
      topic: selectedTopic,
      question,
      answer: msg.content,
    });
  };

  const timerLabel = `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;
  const canEditSelection = !selectionLocked && !workspaceBusy;
  const workspaceLaunched = Boolean(session) || messages.length > 0 || Boolean(activeConversation);
  const reviewQueue = sortReviewTasks(getReviewTasks(courseTasks));
  const dueReviewQueue = reviewQueue.filter((task) => !task.due_date || new Date(task.due_date).getTime() <= Date.now());
  const nextDueReviewTask = dueReviewQueue[0] || null;
  const nextUpcomingReviewTask = reviewQueue[0] || null;
  const activeReviewTask = reviewQueue.find((task) => task.id === activeReviewTaskId) || null;
  const reviewTask = reviewModeActive ? (activeReviewTask || nextDueReviewTask) : null;

  useEffect(() => {
    if (!reviewModeActive) return;

    if (!activeReviewTaskId) {
      if (nextDueReviewTask?.id) {
        setActiveReviewTaskId(nextDueReviewTask.id);
        setReviewAnswerRevealed(false);
        setReviewConfidence(normalizeConfidence(nextDueReviewTask.review_last_confidence ?? nextDueReviewTask.confidence_after ?? selectedTopic?.confidence ?? 3, 3));
      } else {
        exitReviewMode(true);
      }
      return;
    }

    if (activeReviewTaskId && !reviewQueue.some((task) => task.id === activeReviewTaskId)) {
      if (nextDueReviewTask?.id && nextDueReviewTask.id !== activeReviewTaskId) {
        setActiveReviewTaskId(nextDueReviewTask.id);
        setReviewAnswerRevealed(false);
        setReviewConfidence(normalizeConfidence(nextDueReviewTask.review_last_confidence ?? nextDueReviewTask.confidence_after ?? selectedTopic?.confidence ?? 3, 3));
      } else {
        exitReviewMode(true);
      }
    }
  }, [activeReviewTaskId, nextDueReviewTask, reviewModeActive, reviewQueue, selectedTopic?.confidence]);

  useEffect(() => {
    writeWorkbenchState({
      selectedCourseId,
      selectedTopicId,
      depth,
      studyMode,
      reviewModeActive,
      activeReviewTaskId,
      reviewConfidence,
      reviewAnswerRevealed,
      sessionConfidenceBefore,
      sessionConfidenceAfter,
      messages,
      input,
      pendingActions,
      session,
      activeConversation,
      elapsedSeconds,
      remainingSeconds,
      remainingMinutesInput,
      timerPaused,
      generatedContent,
      selectedArtifactTab,
      chatSidebarOpen,
      savedAt: new Date().toISOString(),
    });
  }, [
    selectedCourseId,
    selectedTopicId,
    depth,
    studyMode,
    reviewModeActive,
    activeReviewTaskId,
    reviewConfidence,
    reviewAnswerRevealed,
    sessionConfidenceBefore,
    sessionConfidenceAfter,
    messages,
    input,
    pendingActions,
    session,
    activeConversation,
    elapsedSeconds,
    remainingSeconds,
    remainingMinutesInput,
    timerPaused,
    generatedContent,
    selectedArtifactTab,
    chatSidebarOpen,
  ]);

  return (
    <div className="h-full overflow-hidden bg-background">
      <div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-hidden p-4 lg:p-6">
        {!workspaceLaunched ? (
          <div className="mx-auto w-full max-w-2xl">
            <aside className="flex min-h-0 flex-col gap-4">
              <section className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Setup</p>
                    <h2 className="mt-1 text-base font-semibold">Choose what to study</h2>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/courses" className="gap-2">
                      Courses <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Course</label>
                    <Select
                      value={selectedCourseId}
                      onValueChange={(value) => {
                        if (!canEditSelection) return;
                        setSelectedCourseId(value);
                        setSelectedTopicId("");
                      }}
                      disabled={!canEditSelection}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a course" />
                      </SelectTrigger>
                      <SelectContent>
                        {courses.map((course) => (
                          <SelectItem key={course.id} value={course.id}>
                            <span className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: course.color || "#3B5BDB" }} />
                              {course.title}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Topic</label>
                    {selectedCourseId ? (
                      topics.length === 0 ? (
                        <div className="rounded-2xl border bg-muted/20 p-3 text-sm text-muted-foreground">
                          No topics in this course yet. Add topics from the course page first.
                        </div>
                      ) : (
                        <Select
                          value={selectedTopicId}
                          onValueChange={(value) => {
                            if (!canEditSelection) return;
                            setSelectedTopicId(value);
                          }}
                          disabled={!canEditSelection}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a topic" />
                          </SelectTrigger>
                          <SelectContent>
                            {topics.map((topic) => (
                              <SelectItem key={topic.id} value={topic.id}>
                                {topic.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )
                    ) : (
                      <div className="rounded-2xl border bg-muted/20 p-3 text-sm text-muted-foreground">
                        Pick a course first, then choose a topic.
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Depth</label>
                    <Select value={depth} onValueChange={setDepth} disabled={workspaceBusy || selectionLocked}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Study style</label>
                    <Select value={studyMode} onValueChange={setStudyMode} disabled={workspaceBusy || selectionLocked}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="explain">Explain</SelectItem>
                        <SelectItem value="worked_example">Worked example</SelectItem>
                        <SelectItem value="practice">Practice</SelectItem>
                        <SelectItem value="review">Review</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Confidence now</label>
                    <Select
                      value={String(sessionConfidenceBefore)}
                      onValueChange={(value) => setSessionConfidenceBefore(normalizeConfidence(value, 3))}
                      disabled={workspaceBusy || selectionLocked}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((value) => (
                          <SelectItem key={value} value={String(value)}>
                            {value}/5
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Study session minutes</label>
                    <Input
                      type="number"
                      min="1"
                      max="180"
                      value={remainingMinutesInput}
                      onChange={(event) => setRemainingMinutes(event.target.value)}
                      className="text-center"
                      aria-label="Study minutes"
                      disabled={workspaceBusy}
                    />
                  </div>

                  <Button onClick={startWorkbench} disabled={!workspaceReady || workspaceBusy || aiUnavailable} className="w-full gap-2">
                    <Sparkles className="h-4 w-4" />
                    Start
                  </Button>
                </div>
              </section>
            </aside>
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between rounded-3xl border border-border/60 bg-card px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="text-xs">Session timer</span>
              </div>
              <div className="flex items-center gap-2">
                <p className="font-mono text-2xl font-semibold tabular-nums">{timerLabel}</p>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setTimerPaused((value) => !value)}
                  disabled={session?.status !== "active" || workspaceBusy}
                  aria-label={timerPaused ? "Resume session timer" : "Pause session timer"}
                >
                  <Pause className="h-4 w-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => openSessionCompletionDialog({ reason: "manual_stop" })}
                  disabled={session?.status !== "active" || workspaceBusy}
                  aria-label="Stop study session"
                >
                  <Square className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExitWorkspace}
                  disabled={workspaceBusy}
                >
                  Exit
                </Button>
              </div>
            </header>

            <div className={`grid h-full min-h-0 flex-1 gap-4 ${chatSidebarOpen ? "xl:grid-cols-[minmax(0,1fr)_430px]" : "xl:grid-cols-[minmax(0,1fr)_56px]"}`}>
              <main className="flex min-h-0 flex-col overflow-hidden">
                <Tabs value={selectedArtifactTab} onValueChange={setSelectedArtifactTab} className="flex min-h-0 flex-1 flex-col">
                  <div className="border-b px-1 pb-3">
                    <TabsList className="grid h-auto w-full grid-cols-5 bg-muted/50">
                      <TabsTrigger value="summary" className="text-xs">Summary</TabsTrigger>
                      <TabsTrigger value="flashcards" className="text-xs">Cards</TabsTrigger>
                      <TabsTrigger value="quiz" className="text-xs">Quiz</TabsTrigger>
                      <TabsTrigger value="notes" className="text-xs">Notes</TabsTrigger>
                      <TabsTrigger value="mindmap" className="text-xs">Mind map</TabsTrigger>
                    </TabsList>
                  </div>

                  <div className="flex-1 overflow-hidden">
                    <TabsContent value="summary" forceMount className="m-0 h-full overflow-y-auto">
                      <div className="mb-3 flex flex-wrap items-center gap-2 px-2">
                        <select
                          value={selectedSummaryItem}
                          onChange={(event) => loadSelectedSummaryCandidate(event.target.value)}
                          className="h-9 min-w-[260px] rounded-md border bg-background px-3 text-sm"
                        >
                          <option value="">Load existing summary/note...</option>
                          {summaryCandidates.map((candidate) => (
                            <option key={candidate.key} value={candidate.key}>{candidate.label}</option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            updateSummaryContent(generatedContent.summary || `# ${selectedTopic?.title || "Summary"}\n\nWrite your summary here.`);
                            setSummaryEditorToken((value) => value + 1);
                          }}
                        >
                          Add manual summary
                        </Button>
                      </div>
                      {generatedContent.summary ? (
                        <StudySummary
                          content={generatedContent.summary}
                          topic={selectedTopic}
                          course={selectedCourse}
                          sources={generatedContent.sourceCatalog || []}
                          sourceIds={generatedContent.summarySourceIds || []}
                          onContentChange={updateSummaryContent}
                          forceEditToken={summaryEditorToken}
                        />
                      ) : (
                        <ArtifactPlaceholder
                          title="No summary yet"
                          body={session?.id ? "Generate a summary for this topic." : "Start the session to generate a course-grounded summary."}
                          action={session?.id ? (
                            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void regenerateArtifacts()} disabled={workspaceBusy || aiUnavailable}>
                              Generate now
                            </Button>
                          ) : null}
                        />
                      )}
                    </TabsContent>

                    <TabsContent value="flashcards" forceMount className="m-0 h-full overflow-y-auto">
                      <div className="mb-3 flex flex-wrap items-center gap-2 px-2">
                        <select
                          value={selectedDeckItem}
                          onChange={(event) => loadSelectedDeck(event.target.value)}
                          className="h-9 min-w-[260px] rounded-md border bg-background px-3 text-sm"
                        >
                          <option value="">Load existing flashcard deck...</option>
                          {deckCandidates.map((deck) => (
                            <option key={deck.id} value={deck.id}>{deck.title || "Untitled deck"}</option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setManualCardDialogOpen(true)}
                        >
                          Add manual card
                        </Button>
                      </div>
                      {generatedContent.flashcards.length > 0 ? (
                        <StudyFlashcards
                          cards={generatedContent.flashcards}
                          sourceCatalog={generatedContent.sourceCatalog || []}
                          onCardsChange={updateFlashcardsContent}
                          openEditorSignal={cardsEditorSignal}
                          courseId={selectedCourse?.id}
                          topicId={selectedTopic?.id}
                          onCardResult={(result) => {
                            void handleFlashcardResult(result).catch((error) => console.error("Failed to queue flashcard review", error));
                          }}
                        />
                      ) : (
                        <ArtifactPlaceholder
                          title="No flashcards yet"
                          body={session?.id ? "Generate flashcards for this topic." : "Start the session to generate flashcards."}
                          action={session?.id ? (
                            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void regenerateArtifacts()} disabled={workspaceBusy || aiUnavailable}>
                              Generate now
                            </Button>
                          ) : null}
                        />
                      )}
                    </TabsContent>

                    <TabsContent value="quiz" forceMount className="m-0 h-full overflow-y-auto">
                      <div className="mb-3 flex flex-wrap items-center gap-2 px-2">
                        <select
                          value={selectedQuizItem}
                          onChange={(event) => loadSelectedQuiz(event.target.value)}
                          className="h-9 min-w-[260px] rounded-md border bg-background px-3 text-sm"
                        >
                          <option value="">Load existing quiz...</option>
                          {quizCandidates.map((quiz) => (
                            <option key={quiz.id} value={quiz.id}>{quiz.title || "Untitled quiz"}</option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setManualQuizDialogOpen(true)}
                        >
                          Add manual question
                        </Button>
                      </div>
                      {generatedContent.quiz.length > 0 ? (
                        <StudyQuiz
                          questions={generatedContent.quiz}
                          sourceCatalog={generatedContent.sourceCatalog || []}
                          onQuestionsChange={updateQuizContent}
                          openEditorSignal={quizEditorSignal}
                          courseId={selectedCourse?.id}
                          topicId={selectedTopic?.id}
                          onQuestionResult={(result) => {
                            void handleQuizResult(result).catch((error) => console.error("Failed to queue quiz review", error));
                          }}
                        />
                      ) : (
                        <ArtifactPlaceholder
                          title="No quiz yet"
                          body={session?.id ? "Generate a quiz for this topic." : "Start the session to generate quiz questions."}
                          action={session?.id ? (
                            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void regenerateArtifacts()} disabled={workspaceBusy || aiUnavailable}>
                              Generate now
                            </Button>
                          ) : null}
                        />
                      )}
                    </TabsContent>

                    <TabsContent value="notes" forceMount className="m-0 h-full overflow-y-auto">
                      {workspaceReady ? (
                        <StudyNotes courseId={selectedCourse?.id} topicId={selectedTopic?.id} sessionId={session?.id} />
                      ) : (
                        <ArtifactPlaceholder
                          title="Notes need a topic"
                          body="Pick a course and topic first, then use this tab to save notes back into StudyBridge."
                        />
                      )}
                    </TabsContent>

                    <TabsContent value="mindmap" forceMount className="m-0 h-full overflow-y-auto">
                      {selectedCourse?.id ? (
                        <div className="h-full overflow-hidden rounded-2xl border bg-background">
                          <MindMap forcedCourseId={selectedCourse.id} />
                        </div>
                      ) : (
                        <ArtifactPlaceholder
                          title="Mind map needs a course"
                          body="Pick a course first, then the full mind map editor will load in this tab."
                        />
                      )}
                    </TabsContent>
                  </div>
                </Tabs>

                <div className="border-t px-1 py-3">
                  <p className="text-xs text-muted-foreground">
                    Approved writes are saved back into StudyBridge. Generated study outputs stay attached to this session and can be exported from the individual panels.
                  </p>
                </div>
              </main>

              <aside className={`flex min-h-0 flex-col rounded-3xl border border-border/60 bg-card shadow-sm ${chatSidebarOpen ? "" : "w-[56px] shrink-0"}`}>
                <div className={`flex items-center gap-2 border-b px-3 py-2 ${chatSidebarOpen ? "justify-between" : "justify-center"}`}>
                  {chatSidebarOpen && (
                    <div>
                      <p className="text-xs text-muted-foreground">{reviewModeActive ? "Review mode" : "Tutor chat"}</p>
                      <h2 className="mt-1 max-w-[260px] truncate text-base font-semibold">
                        {reviewModeActive ? (reviewTask?.title || "Scheduled follow-up") : (selectedTopic ? selectedTopic.title : "Pick a topic to start")}
                      </h2>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setChatSidebarOpen((value) => !value)}
                    aria-label={chatSidebarOpen ? "Collapse tutor chat" : "Expand tutor chat"}
                  >
                    {chatSidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                  </Button>
                </div>

                {chatSidebarOpen ? (
                  <>
                    <div className="border-b px-3 py-2">
                      <Select
                        value={activeConversation?.id || "recent"}
                        onValueChange={(value) => {
                          if (value === "recent" || conversationLocked) return;
                          const conversation = conversations.find((item) => item.id === value);
                          if (conversation) {
                            loadConversation(conversation.id).catch((error) => console.error("Failed to load conversation", error));
                          }
                        }}
                        disabled={conversationLocked || reviewModeActive || conversations.length === 0}
                      >
                        <SelectTrigger className="w-full">
                          <div className="flex items-center gap-2 min-w-0">
                            <History className="h-3.5 w-3.5 text-muted-foreground" />
                            <SelectValue placeholder="Recent chats" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="recent" disabled>
                            Recent chats
                          </SelectItem>
                          {conversations.map((conversation) => (
                            <SelectItem key={conversation.id} value={conversation.id}>
                              <span className="block max-w-[260px] truncate">
                                {conversation.title || conversation.context || "Study chat"}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
                      <div className="mx-auto flex max-w-3xl flex-col gap-4">
                        {reviewModeActive ? (
                          <>
                            <ReviewModePanel
                              task={reviewTask}
                              queueCount={dueReviewQueue.length}
                              sourceCatalog={reviewTask?.review_source_catalog?.length > 0 ? reviewTask.review_source_catalog : generatedContent.sourceCatalog || []}
                              confidence={reviewConfidence}
                              revealed={reviewAnswerRevealed}
                              busy={loading || generatingContent}
                              onConfidenceChange={(value) => setReviewConfidence(normalizeConfidence(value, 3))}
                              onRevealToggle={() => setReviewAnswerRevealed((value) => !value)}
                              onMarkCorrect={() => {
                                if (!reviewTask) return;
                                void completeReviewAttempt({ task: reviewTask, outcome: "correct", confidence: reviewConfidence });
                              }}
                              onMarkIncorrect={() => {
                                if (!reviewTask) return;
                                void completeReviewAttempt({ task: reviewTask, outcome: "incorrect", confidence: reviewConfidence });
                              }}
                              onStartWorkedExample={() => startWorkedExampleRetry(reviewTask)}
                              onExit={() => exitReviewMode(true)}
                            />

                            {pendingActions.length > 0 && (
                              <PendingActionsCard
                                courseTitle={selectedCourse?.title}
                                actions={pendingActions}
                                onApprove={() => applyPendingActions()}
                                onCancel={() => cancelPendingActions()}
                                busy={loading}
                              />
                            )}
                          </>
                        ) : (
                          <>
                            {messages.length === 0 && (
                              <div className="rounded-3xl border bg-gradient-to-br from-primary/5 via-background to-transparent p-6">
                                <div className="flex items-start gap-4">
                                  <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                                    <Brain className="h-6 w-6" />
                                  </div>
                                  <div className="space-y-2">
                                    <h3 className="text-lg font-semibold">Build the study session from here</h3>
                                    <p className="max-w-2xl text-sm text-muted-foreground">
                                      Click Start in setup to generate a summary, flashcards, and quiz for this topic, then continue through tutor chat.
                                    </p>
                                    <div className="flex flex-wrap gap-2 pt-2">
                                      {QUICK_PROMPTS.map((action) => {
                                        const Icon = action.icon;
                                        return (
                                          <Button
                                            key={action.label}
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => sendMessage(action.prompt)}
                                            disabled={!session?.id || loading || generatingContent || aiUnavailable || !workspaceReady}
                                            className="gap-2"
                                          >
                                            <Icon className="h-3.5 w-3.5" />
                                            {action.label}
                                          </Button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {messages.map((message, index) => (
                              <div key={`${message.created_at || index}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[92%] rounded-3xl border px-4 py-3 shadow-sm ${message.role === "user" ? "rounded-br-md bg-primary text-primary-foreground border-primary/20" : "rounded-bl-md bg-background"}`}>
                                  {message.role === "user" ? (
                                    <p className="text-sm leading-6">{message.content}</p>
                                  ) : (
                                    <div className="space-y-2">
                                      <MarkdownContent>{message.content}</MarkdownContent>
                                      <button
                                        type="button"
                                        onClick={() => saveAnswer(message, index)}
                                        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
                                      >
                                        <Plus className="h-3 w-3" />
                                        Save answer
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}

                            {pendingActions.length > 0 && (
                              <PendingActionsCard
                                courseTitle={selectedCourse?.title}
                                actions={pendingActions}
                                onApprove={() => applyPendingActions()}
                                onCancel={() => cancelPendingActions()}
                                busy={loading}
                              />
                            )}

                            {(generatingContent || loading) && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>{generatingContent ? "Preparing artifacts..." : "Thinking with your StudyBridge context..."}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="border-t bg-background/80 px-3 py-3">
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          sendMessage(input);
                        }}
                        className="flex items-center gap-2"
                      >
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setShowAttachMaterial(true)}
                          disabled={!selectedCourse?.id || loading || generatingContent}
                          aria-label="Attach study material"
                        >
                          <Paperclip className="h-4 w-4" />
                        </Button>
                        <Input
                          value={input}
                          onChange={(event) => setInput(event.target.value)}
                          placeholder={reviewModeActive ? "Exit review mode to continue the tutor chat" : workspaceReady ? "Ask a question or request a write action..." : "Select a course and topic first"}
                          disabled={reviewModeActive || !session?.id || loading || generatingContent || aiUnavailable || !workspaceReady}
                          className="flex-1"
                        />
                        <Button type="submit" disabled={reviewModeActive || !input.trim() || !session?.id || loading || generatingContent || aiUnavailable || !workspaceReady} size="icon">
                          <Send className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  </>
                ) : (
                  <div className="flex-1" />
                )}
              </aside>
            </div>
          </>
        )}

        <MaterialUploader
          open={showAttachMaterial}
          onClose={() => setShowAttachMaterial(false)}
          courseId={selectedCourse?.id}
          topics={topics}
          onUploaded={async () => {
            if (selectedCourse?.id) {
              await refreshSelectedCourseTopics(selectedCourse.id);
              toast({
                title: "Material uploaded",
                description: "The file was added to this course. Ask the tutor to summarize or quiz you from it.",
              });
            }
          }}
        />

        <Dialog open={completionDialogOpen} onOpenChange={setCompletionDialogOpen}>
          <DialogContent
            className="sm:max-w-md"
            onPointerDownOutside={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => event.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>Session complete</DialogTitle>
              <DialogDescription>
                Record your confidence now and choose whether to continue with another timed session.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={submitSessionCompletion} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="session-confidence-after">Confidence now (1-5)</Label>
                <Input
                  id="session-confidence-after"
                  type="number"
                  min="1"
                  max="5"
                  value={completionConfidenceDraft}
                  onChange={(event) => setCompletionConfidenceDraft(event.target.value)}
                />
              </div>

              <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={completionRestartRequested}
                    onChange={(event) => setCompletionRestartRequested(event.target.checked)}
                  />
                  Start another session now
                </label>

                {completionRestartRequested && (
                  <div className="space-y-1.5">
                    <Label htmlFor="session-restart-minutes">Next session minutes</Label>
                    <Input
                      id="session-restart-minutes"
                      type="number"
                      min="1"
                      max="180"
                      value={completionRestartMinutes}
                      onChange={(event) => setCompletionRestartMinutes(event.target.value)}
                    />
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="submit" disabled={loading}>
                  {loading ? "Saving..." : completionReason === "timer_elapsed" ? "Finish session" : "Save and finish"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={manualCardDialogOpen} onOpenChange={setManualCardDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Manual Card</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="manual-card-front">Front</Label>
              <Input id="manual-card-front" value={manualCardFront} onChange={(event) => setManualCardFront(event.target.value)} />
              <Label htmlFor="manual-card-back">Back</Label>
              <RichTextEditor value={manualCardBack} onChange={setManualCardBack} placeholder="Card answer..." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setManualCardDialogOpen(false)}>Cancel</Button>
              <Button type="button" onClick={addManualCardFromDialog}>Add card</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={manualQuizDialogOpen} onOpenChange={setManualQuizDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Manual Question</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="manual-quiz-question">Question</Label>
              <RichTextEditor value={manualQuizQuestion} onChange={setManualQuizQuestion} placeholder="Question..." />
              {manualQuizOptions.map((value, index) => (
                <Input
                  key={`manual-option-${index}`}
                  value={value}
                  onChange={(event) => setManualQuizOptions((prev) => prev.map((item, i) => (i === index ? event.target.value : item)))}
                  placeholder={`Option ${index + 1}`}
                />
              ))}
              <Label htmlFor="manual-quiz-correct">Correct option text</Label>
              <Input id="manual-quiz-correct" value={manualQuizCorrect} onChange={(event) => setManualQuizCorrect(event.target.value)} />
              <Label htmlFor="manual-quiz-explanation">Explanation (optional)</Label>
              <RichTextEditor value={manualQuizExplanation} onChange={setManualQuizExplanation} placeholder="Explanation (optional)..." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setManualQuizDialogOpen(false)}>Cancel</Button>
              <Button type="button" onClick={addManualQuizFromDialog}>Add question</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
