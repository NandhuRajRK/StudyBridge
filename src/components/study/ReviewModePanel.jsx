import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MarkdownContent from "@/components/ui/markdown-content";
import { CheckCircle2, Eye, EyeOff, Layers3, SkipForward, XCircle } from "lucide-react";

function getSourceIds(task = {}) {
  return Array.isArray(task.review_source_ids)
    ? task.review_source_ids
    : task.review_source_id
      ? [task.review_source_id]
      : [];
}

function getSourceLabel(sourceCatalog = [], sourceId) {
  return sourceCatalog.find((source) => source.id === sourceId)?.label || sourceId;
}

export default function ReviewModePanel({
  task,
  queueCount = 0,
  sourceCatalog = [],
  confidence = 3,
  revealed = false,
  busy = false,
  onConfidenceChange,
  onRevealToggle,
  onMarkCorrect,
  onMarkIncorrect,
  onStartWorkedExample,
  onExit,
}) {
  if (!task) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-dashed bg-muted/20 p-8 text-center">
        <p className="text-lg font-semibold">No review item is active</p>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Start the next review item from the queue to switch this workspace into review mode.
        </p>
        <Button className="mt-4 gap-2" onClick={onExit} variant="outline">
          <SkipForward className="h-4 w-4" />
          Back to tutor
        </Button>
      </div>
    );
  }

  const sourceIds = getSourceIds(task);

  return (
    <div className="flex h-full flex-col gap-4 rounded-3xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Review mode</p>
          <h3 className="mt-1 text-xl font-semibold">{task.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {queueCount} follow-up{queueCount === 1 ? "" : "s"} due now
            {task.review_kind ? ` · ${task.review_kind.replace(/_/g, " ")}` : ""}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onExit} className="gap-2" disabled={busy}>
          <SkipForward className="h-4 w-4" />
          Back to tutor
        </Button>
      </div>

      <div className="rounded-3xl border bg-card p-4 shadow-sm">
        <p className="text-xs text-muted-foreground">Prompt</p>
        <div className="mt-3 space-y-3">
          <MarkdownContent>{task.review_prompt || task.instructions || task.outcome || "Review this item from memory."}</MarkdownContent>
          {task.review_source_label && (
            <p className="text-xs text-muted-foreground">
              Source focus: <span className="font-medium text-foreground">{task.review_source_label}</span>
            </p>
          )}
          {sourceIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sourceIds.map((sourceId) => (
                <span key={sourceId} className="inline-flex items-center rounded-full border bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">
                  {getSourceLabel(sourceCatalog, sourceId)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="rounded-3xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Answer</p>
            <Button variant="outline" size="sm" onClick={onRevealToggle} disabled={busy} className="gap-2">
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {revealed ? "Hide answer" : "Reveal answer"}
            </Button>
          </div>

          {revealed ? (
            <div className="mt-3 space-y-3">
              {task.review_answer && (
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <p className="text-xs font-medium text-muted-foreground">Correct answer</p>
                  <div className="mt-2 text-sm">
                    <MarkdownContent compact>{task.review_answer}</MarkdownContent>
                  </div>
                </div>
              )}
              {task.review_explanation && (
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <p className="text-xs font-medium text-muted-foreground">Why it matters</p>
                  <div className="mt-2 text-sm">
                    <MarkdownContent compact>{task.review_explanation}</MarkdownContent>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              Think through the prompt first, then reveal the answer and grade yourself. The confidence rating should reflect how sure you were before checking.
            </div>
          )}
        </div>

        <div className="rounded-3xl border bg-card/80 p-4 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Self grade</p>
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Confidence</label>
              <Select value={String(confidence)} onValueChange={onConfidenceChange} disabled={busy}>
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

            <div className="grid gap-2">
              <Button variant="outline" onClick={onMarkIncorrect} disabled={busy} className="justify-start gap-2 border-destructive/20 text-destructive hover:bg-destructive/5">
                <XCircle className="h-4 w-4" />
                Missed it
              </Button>
              <Button onClick={onMarkCorrect} disabled={busy} className="justify-start gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Got it
              </Button>
            </div>

            <div className="grid gap-2">
              <Button variant="outline" onClick={onStartWorkedExample} disabled={busy} className="justify-start gap-2">
                <Layers3 className="h-4 w-4" />
                Retry with worked example
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
