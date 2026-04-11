import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Loader2, Bot, Bookmark, BookOpen, HelpCircle, List, Zap, Layers, History, Plus } from "lucide-react";
import { loadStudyContextBundle } from "@/lib/aiContext";
import { executeStudyActions, runStudyTurn } from "@/lib/aiActions";
import { listAIConversations, loadAIConversation, saveAIAnswer, saveAIConversation } from "@/lib/aiConversations";
import AiAccessNotice from "@/components/ai/AiAccessNotice";
import { getDesktopAiNotice, isDesktopAiUnavailable, loadDesktopAiRuntime } from "@/lib/desktopAi";
import MarkdownContent from "@/components/ui/markdown-content";
import { useLocale } from "@/lib/locale";
import PendingActionsCard from "@/components/ai/PendingActionsCard";

const ACTIONS = [
  { icon: BookOpen, label: "Explain concept", prompt: "Explain the key concepts of this topic clearly" },
  { icon: HelpCircle, label: "Practice questions", prompt: "Generate 5 practice questions for this topic" },
  { icon: List, label: "Summary", prompt: "Provide a comprehensive summary of this topic" },
  { icon: Zap, label: "Key differences", prompt: "What are the key differences between the main concepts in this topic?" },
  { icon: Layers, label: "Real examples", prompt: "Give me real-world examples that illustrate this topic" },
];

const newMessage = (role, content) => ({
  role,
  content,
  created_at: new Date().toISOString(),
});

export default function AITutor() {
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingActions, setPendingActions] = useState([]);
  const [depth, setDepth] = useState("intermediate");
  const [runtime, setRuntime] = useState(null);
  const scrollRef = useRef(null);
  const { t } = useLocale();

  useEffect(() => {
    const loadInitialData = async () => {
      const [courseRows, conversationRows] = await Promise.all([
        base44.entities.Course.filter({ status: "active" }, "-created_date", 50),
        listAIConversations(),
      ]);

      setCourses(courseRows);
      setConversations(conversationRows);

      const conversationId = new URLSearchParams(window.location.search).get("conversation");
      if (conversationId) {
        const record = await loadAIConversation(conversationId);
        if (record) selectConversation(record);
      }
    };

    loadInitialData().catch((error) => console.error("Failed to load AI tutor data", error));
  }, []);

  useEffect(() => {
    loadDesktopAiRuntime().then(setRuntime);
  }, []);

  useEffect(() => {
    if (selectedCourseId) {
      base44.entities.Topic.filter({ course_id: selectedCourseId }, "order", 100).then(setTopics);
    } else {
      setTopics([]);
      setSelectedTopicId("");
    }
  }, [selectedCourseId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId);
  const selectedTopic = topics.find((topic) => topic.id === selectedTopicId);
  const aiUnavailable = isDesktopAiUnavailable(runtime);
  const aiNotice = getDesktopAiNotice(runtime, t);

  const refreshConversations = async () => {
    const rows = await listAIConversations();
    setConversations(rows);
  };

  const selectConversation = (conversation) => {
    setActiveConversation(conversation);
    setMessages(conversation.messages || []);
    setSelectedCourseId(conversation.course_id || "");
    setSelectedTopicId(conversation.topic_id || "");
    setPendingActions([]);
    window.history.replaceState(null, "", `/ai-tutor?conversation=${conversation.id}`);
  };

  const handleConversationChange = (conversationId) => {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (conversation) selectConversation(conversation);
  };

  const startNewChat = () => {
    setActiveConversation(null);
    setMessages([]);
    setInput("");
    setPendingActions([]);
    window.history.replaceState(null, "", "/ai-tutor");
  };

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;

    const userMessage = newMessage("user", text.trim());
    const conversationBeforeTurn = activeConversation;
    const historyBeforeTurn = messages;
    const messagesWithUser = [...historyBeforeTurn, userMessage];

    setMessages(messagesWithUser);
    setInput("");
    setLoading(true);

    try {
      const contextBundle = await loadStudyContextBundle({ course: selectedCourse, topic: selectedTopic });
      const turnResult = await runStudyTurn({
        course: selectedCourse,
        topic: selectedTopic,
        contextBundle,
        depth,
        history: historyBeforeTurn,
        studentText: userMessage.content,
      });
      const { reply, actionResults } = turnResult;

      if (selectedCourse?.id && actionResults.some((result) => result.ok && result.label === "topic")) {
        const updatedTopics = await base44.entities.Topic.filter({ course_id: selectedCourse.id }, "order", 100);
        setTopics(updatedTopics);
      }

      const messagesWithAssistant = [...messagesWithUser, newMessage("assistant", reply)];
      setMessages(messagesWithAssistant);
      setPendingActions(Array.isArray(turnResult?.pendingActions) ? turnResult.pendingActions : []);

      const saved = await saveAIConversation({
        conversation: conversationBeforeTurn,
        messages: messagesWithAssistant,
        course: selectedCourse,
        topic: selectedTopic,
        source: "ai_tutor",
      });
      setActiveConversation(saved);
      await refreshConversations();
      window.history.replaceState(null, "", `/ai-tutor?conversation=${saved.id}`);
    } catch (error) {
      console.error("AI tutor request failed", error);
      setMessages((prev) => [...prev, newMessage("assistant", error.message || "The local AI request failed. Check the desktop model runtime and try again.")]);
    } finally {
      setLoading(false);
    }
  };

  const approvePendingActions = async () => {
    if (!pendingActions.length) return;
    setLoading(true);
    try {
      const actionResults = await executeStudyActions({
        course: selectedCourse,
        topic: selectedTopic,
        sessionId: activeConversation?.session_id,
        actions: pendingActions,
      });

      if (selectedCourse?.id && actionResults.some((result) => result.ok && result.label === "topic")) {
        const updatedTopics = await base44.entities.Topic.filter({ course_id: selectedCourse.id }, "order", 100);
        setTopics(updatedTopics);
      }

      const summary = actionResults
        .map((result) => `- ${result.ok ? "Done" : "Failed"}: ${result.message}`)
        .join("\n");
      const approvalMessage = `StudyBridge actions applied.\n\n**StudyBridge actions**\n${summary || "- No actions executed."}`;
      const messagesWithApproval = [...messages, newMessage("assistant", approvalMessage)];
      setMessages(messagesWithApproval);
      setPendingActions([]);

      const saved = await saveAIConversation({
        conversation: activeConversation,
        messages: messagesWithApproval,
        course: selectedCourse,
        topic: selectedTopic,
        source: "ai_tutor",
      });
      setActiveConversation(saved);
      await refreshConversations();
      window.history.replaceState(null, "", `/ai-tutor?conversation=${saved.id}`);
    } catch (error) {
      setMessages((prev) => [...prev, newMessage("assistant", error.message || "Failed to apply pending actions.")]);
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

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b bg-card px-6 py-3 shrink-0">
        <div className="flex items-center gap-4 max-w-6xl mx-auto">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <h1 className="font-semibold">AI Tutor</h1>
          </div>
          <Button variant="outline" size="sm" onClick={startNewChat} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New chat
          </Button>
          <div className="flex-1" />
          {conversations.length > 0 && (
            <Select value={activeConversation?.id || "recent"} onValueChange={handleConversationChange}>
              <SelectTrigger className="w-56">
                <div className="flex items-center gap-2 min-w-0">
                  <History className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Recent chats" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent" disabled>Recent chats</SelectItem>
                {conversations.map((conversation) => (
                  <SelectItem key={conversation.id} value={conversation.id}>
                    {conversation.title || conversation.context || "AI chat"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={selectedCourseId} onValueChange={(v) => { setSelectedCourseId(v); setSelectedTopicId(""); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All courses" /></SelectTrigger>
            <SelectContent>
              {courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}
            </SelectContent>
          </Select>
          {selectedCourseId && topics.length > 0 && (
            <Select value={selectedTopicId} onValueChange={setSelectedTopicId}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All topics" /></SelectTrigger>
              <SelectContent>
                {topics.map((topic) => <SelectItem key={topic.id} value={topic.id}>{topic.title}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={depth} onValueChange={setDepth}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="beginner">Beginner</SelectItem>
              <SelectItem value="intermediate">Intermediate</SelectItem>
              <SelectItem value="advanced">Advanced</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {aiUnavailable && (
            <AiAccessNotice
              title="AI is not ready on this desktop"
              message={aiNotice}
            />
          )}

          {messages.length === 0 && (
            <div className="py-12 text-center">
              <Bot className="w-12 h-12 text-primary/20 mx-auto mb-4" />
              <h2 className="text-lg font-medium mb-2">What would you like to learn?</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                {selectedTopic
                  ? `Ask me anything about "${selectedTopic.title}". I will use your materials, notes, sessions, and tasks as context.`
                  : "Select a course and topic for grounded help, or ask a general study question."}
              </p>
              <div className="flex flex-wrap justify-center gap-2 mb-6">
                {ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Button
                      key={action.label}
                      variant="outline"
                      size="sm"
                      onClick={() => sendMessage(action.prompt)}
                      disabled={loading || aiUnavailable}
                      className="gap-1.5"
                    >
                      <Icon className="w-3.5 h-3.5" /> {action.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {pendingActions.length > 0 && (
            <PendingActionsCard
              courseTitle={selectedCourse?.title}
              actions={pendingActions}
              onApprove={approvePendingActions}
              onCancel={() => setPendingActions([])}
              busy={loading}
            />
          )}

          {messages.map((msg, i) => (
            <div key={`${msg.created_at || i}-${i}`} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5" : "bg-card text-card-foreground rounded-2xl rounded-bl-md px-4 py-3 border shadow-sm"}`}>
                {msg.role === "user" ? (
                  <p className="text-sm">{msg.content}</p>
                ) : (
                  <div className="space-y-2">
                    <MarkdownContent>{msg.content}</MarkdownContent>
                    <button
                      onClick={() => saveAnswer(msg, i)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Bookmark className="w-3 h-3" /> Save answer
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Thinking with your StudyBridge context...</span>
            </div>
          )}
        </div>
      </div>

      <div className="border-t bg-card p-4">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2 max-w-3xl mx-auto">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            disabled={loading || aiUnavailable}
            className="flex-1"
          />
          <Button type="submit" disabled={!input.trim() || loading || aiUnavailable} size="icon">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
