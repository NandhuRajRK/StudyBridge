import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SessionCompletionModal({
  open,
  onOpenChange,
  completionReason,
  completionConfidenceDraft,
  onCompletionConfidenceDraftChange,
  completionRestartRequested,
  onCompletionRestartRequestedChange,
  completionRestartMinutes,
  onCompletionRestartMinutesChange,
  onSubmit,
  loading,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="session-confidence-after">Confidence now (1-5)</Label>
            <Input
              id="session-confidence-after"
              type="number"
              min="1"
              max="5"
              value={completionConfidenceDraft}
              onChange={(event) => onCompletionConfidenceDraftChange(event.target.value)}
            />
          </div>

          <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={completionRestartRequested}
                onChange={(event) => onCompletionRestartRequestedChange(event.target.checked)}
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
                  onChange={(event) => onCompletionRestartMinutesChange(event.target.value)}
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
  );
}

