import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle } from "lucide-react";

export default function PendingActionsCard({ courseTitle, actions = [], onApprove, onCancel, busy = false }) {
  if (!actions.length) return null;

  return (
    <div className="rounded-2xl border bg-muted/20 p-4 space-y-3">
      <div>
        <p className="font-medium">Pending StudyBridge changes</p>
        <p className="text-xs text-muted-foreground">
          Review these write actions for {courseTitle || "the selected course"} before they are applied.
        </p>
      </div>
      <ul className="space-y-2 text-sm">
        {actions.map((action, index) => (
          <li key={`${action.type}-${index}`} className="rounded-lg border bg-background px-3 py-2">
            <p className="font-medium">{action.type}</p>
            <p className="text-xs text-muted-foreground">
              {action.title || action.description || action.content || "No preview available"}
            </p>
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

