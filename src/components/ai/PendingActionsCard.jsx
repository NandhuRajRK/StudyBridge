import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle } from "lucide-react";

export default function PendingActionsCard({ courseTitle, actions = [], onApprove, onCancel, busy = false }) {
  if (!actions.length) return null;

  const formatActionMeta = (action) => {
    const parts = [
      action.topic_title,
      action.due_at || action.due_date || (Number.isFinite(action.days_from_now) ? `in ${action.days_from_now} day${action.days_from_now === 1 ? "" : "s"}` : ""),
      action.estimated_minutes ? `${action.estimated_minutes}m` : "",
      action.priority,
    ].filter(Boolean);
    return parts.join(" - ");
  };

  return (
    <div className="rounded-2xl border bg-muted/20 p-4 space-y-3">
      <div>
        <p className="font-medium">Pending StudyBridge changes</p>
        <p className="text-xs text-muted-foreground">
          Review these write actions for {courseTitle || "the selected course"} before they are applied. You can also type "approve" in chat.
        </p>
      </div>
      <ul className="space-y-2 text-sm">
        {actions.map((action, index) => (
          <li key={`${action.type}-${index}`} className="rounded-lg border bg-background px-3 py-2">
            <p className="font-medium">{action.type}</p>
            <p className="text-xs text-muted-foreground">
              {action.title || action.description || action.content || "No preview available"}
            </p>
            {formatActionMeta(action) && (
              <p className="text-xs text-muted-foreground mt-1">{formatActionMeta(action)}</p>
            )}
            {(action.instructions || action.outcome) && (
              <div className="mt-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs">
                {action.instructions && <p>{action.instructions}</p>}
                {action.outcome && <p className="text-muted-foreground mt-1">Done when: {action.outcome}</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onApprove} disabled={busy} className="gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Approve and apply
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy} className="gap-2">
          <XCircle className="w-4 h-4" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
