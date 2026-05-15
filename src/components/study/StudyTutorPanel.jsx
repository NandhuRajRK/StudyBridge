import { Brain, History, Loader2, PanelRightClose, PanelRightOpen, Paperclip, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MarkdownContent from "@/components/ui/markdown-content";
import PendingActionsCard from "@/components/ai/PendingActionsCard";
import ReviewModePanel from "@/components/study/ReviewModePanel";

export default function StudyTutorPanel({
  chatSidebarOpen,
  onToggleSidebar,
  reviewModeActive,
  reviewTask,
  selectedTopic,
  activeConversation,
  conversationLocked,
  conversations,
  loadConversation,
  scrollRef,
  dueReviewQueue,
  generatedContent,
  reviewConfidence,
  reviewAnswerRevealed,
  loading,
  generatingContent,
  onReviewConfidenceChange,
  onReviewRevealToggle,
  onMarkReviewCorrect,
  onMarkReviewIncorrect,
  onStartWorkedExample,
  onExitReviewMode,
  pendingActions,
  selectedCourse,
  onApprovePendingActions,
  onCancelPendingActions,
  messages,
  quickPrompts,
  sendMessage,
  session,
  aiUnavailable,
  workspaceReady,
  saveAnswer,
  input,
  setInput,
  onAttachMaterial,
}) {
  return (
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
          onClick={onToggleSidebar}
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
                    onConfidenceChange={onReviewConfidenceChange}
                    onRevealToggle={onReviewRevealToggle}
                    onMarkCorrect={onMarkReviewCorrect}
                    onMarkIncorrect={onMarkReviewIncorrect}
                    onStartWorkedExample={onStartWorkedExample}
                    onExit={onExitReviewMode}
                  />

                  {pendingActions.length > 0 && (
                    <PendingActionsCard
                      courseTitle={selectedCourse?.title}
                      actions={pendingActions}
                      onApprove={onApprovePendingActions}
                      onCancel={onCancelPendingActions}
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
                            {quickPrompts.map((action) => {
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
                      onApprove={onApprovePendingActions}
                      onCancel={onCancelPendingActions}
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
                onClick={onAttachMaterial}
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
  );
}

