import { useState, useRef, useEffect } from "react";
import { studybridge } from "@/api/studybridgeClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Bookmark, Lightbulb } from "lucide-react";
import { loadStudyContextBundle } from "@/lib/aiContext";
import { executeStudyActions, getRecoverablePendingActions, isPendingActionApproval, isPendingActionCancellation, runStudyTurn } from "@/lib/aiActions";
import { isConversationRecord, saveAIAnswer, saveAIConversation } from "@/lib/aiConversations";
import AiAccessNotice from "@/components/ai/AiAccessNotice";
import { getDesktopAiNotice, isDesktopAiUnavailable, loadDesktopAiRuntime } from "@/lib/desktopAi";
import MarkdownContent from "@/components/ui/markdown-content";
import { useLocale } from "@/lib/locale";
import PendingActionsCard from "@/components/ai/PendingActionsCard";

const SUGGESTED_PROMPTS = [
  "Explain this topic in simple terms",
  "What are the key concepts I need to know?",
  "Give me a real-world example",
  "What's the difference between the main concepts?",
  "What questions might appear on the exam?",
];

const newMessage = (role, content, extras = {}) => ({
  role,
  content,
  created_at: new Date().toISOString(),
  ...extras,
});

export default function StudyAIChat({ course, topic, sessionId }) {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingActions, setPendingActions] = useState([]);
  const [runtime, setRuntime] = useState(null);
  const scrollRef = useRef(null);
  const { t } = useLocale();

  useEffect(() => {
    const loadConversation = async () => {
      if (!course?.id || !topic?.id) return;

      const records = await studybridge.entities.SavedAIAnswer.list("-updated_date", 100);
      const found = records.find((record) => (
        isConversationRecord(record) &&
        record.source === "study_session" &&
        (sessionId ? record.session_id === sessionId : record.course_id === course.id && record.topic_id === topic.id)
      ));

      if (found) {
        const conversationMessages = found.messages || [];
        setConversation(found);
        setMessages(conversationMessages);
        setPendingActions(getRecoverablePendingActions(conversationMessages));
      }
    };

    loadConversation().catch((error) => console.error("Failed to load study chat", error));
  }, [course?.id, topic?.id, sessionId]);

  useEffect(() => {
    loadDesktopAiRuntime().then(setRuntime);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const cancelPendingActions = async ({ messagesBase = messages, conversationBase = conversation } = {}) => {
    const messagesWithCancel = [...messagesBase, newMessage("assistant", "Pending StudyBridge actions canceled. No changes were applied.", { actionStatus: "canceled" })];
    setMessages(messagesWithCancel);
    setPendingActions([]);

    const saved = await saveAIConversation({
      conversation: conversationBase,
      messages: messagesWithCancel,
      course,
      topic,
      source: "study_session",
      sessionId,
      title: `${topic.title} study chat`,
    });
    setConversation(saved);
  };

  const applyPendingActions = async ({ messagesBase = messages, conversationBase = conversation } = {}) => {
    if (!pendingActions.length) return;
    setLoading(true);
    try {
      const actionResults = await executeStudyActions({
        course,
        topic,
        sessionId,
        actions: pendingActions,
      });
      const summary = actionResults
        .map((result) => `- ${result.ok ? "Done" : "Failed"}: ${result.message}`)
        .join("\n");
      const approvalMessage = `StudyBridge actions applied.\n\n**StudyBridge actions**\n${summary || "- No actions executed."}`;
      const messagesWithApproval = [...messagesBase, newMessage("assistant", approvalMessage, { actionStatus: "applied" })];
      setMessages(messagesWithApproval);
      setPendingActions([]);

      const saved = await saveAIConversation({
        conversation: conversationBase,
        messages: messagesWithApproval,
        course,
        topic,
        source: "study_session",
        sessionId,
        title: `${topic.title} study chat`,
      });
      setConversation(saved);
    } catch (error) {
      setMessages((prev) => [...prev, newMessage("assistant", error.message || "Failed to apply pending actions.")]);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;

    const userMessage = newMessage("user", text.trim());
    const conversationBeforeTurn = conversation;
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
      const contextBundle = await loadStudyContextBundle({ course, topic });
      const turnResult = await runStudyTurn({
        course,
        topic,
        contextBundle,
        depth: "intermediate",
        history: historyBeforeTurn,
        studentText: userMessage.content,
        sessionId,
      });
      const { reply } = turnResult;

      const nextPendingActions = Array.isArray(turnResult?.pendingActions) ? turnResult.pendingActions : [];
      const messagesWithAssistant = [
        ...messagesWithUser,
        newMessage("assistant", reply, nextPendingActions.length ? { pendingActions: nextPendingActions } : {}),
      ];
      setMessages(messagesWithAssistant);
      setPendingActions(nextPendingActions);

      const saved = await saveAIConversation({
        conversation: conversationBeforeTurn,
        messages: messagesWithAssistant,
        course,
        topic,
        source: "study_session",
        sessionId,
        title: `${topic.title} study chat`,
      });
      setConversation(saved);
    } catch (error) {
      console.error("Study chat request failed", error);
      setMessages((prev) => [...prev, newMessage("assistant", error.message || "The local AI request failed. Check the desktop model runtime and try again.")]);
    } finally {
      setLoading(false);
    }
  };

  const approvePendingActions = async () => {
    await applyPendingActions();
  };

  const aiUnavailable = isDesktopAiUnavailable(runtime);
  const aiNotice = getDesktopAiNotice(runtime, t);

  const saveAnswer = async (msg, idx) => {
    const question = messages[idx - 1]?.content || "";
    await saveAIAnswer({
      course,
      topic,
      question,
      answer: msg.content,
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        {aiUnavailable && (
          <AiAccessNotice
            title="AI is not ready on this desktop"
            message={aiNotice}
          />
        )}

        {messages.length === 0 && (
          <div className="max-w-lg mx-auto py-8">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-muted-foreground">Suggested questions</span>
            </div>
            <div className="space-y-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="w-full text-left p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors text-sm"
                  disabled={aiUnavailable}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={`${msg.created_at || i}-${i}`} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5" : "bg-card text-card-foreground rounded-2xl rounded-bl-md px-4 py-3 border shadow-sm"}`}>
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

        {pendingActions.length > 0 && (
          <PendingActionsCard
            courseTitle={course?.title}
            actions={pendingActions}
            onApprove={approvePendingActions}
            onCancel={() => cancelPendingActions()}
            busy={loading}
          />
        )}

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Thinking with your course context...</span>
          </div>
        )}
      </div>

      <div className="border-t p-4">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2 max-w-3xl mx-auto">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask about ${topic?.title || "this topic"}...`}
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
