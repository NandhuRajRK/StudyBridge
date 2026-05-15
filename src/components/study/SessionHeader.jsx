import { Clock, Pause, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SessionHeader({
  timerLabel,
  timerPaused,
  onTogglePause,
  onStop,
  onExit,
  isSessionActive,
  workspaceBusy,
}) {
  return (
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
          onClick={onTogglePause}
          disabled={!isSessionActive || workspaceBusy}
          aria-label={timerPaused ? "Resume session timer" : "Pause session timer"}
        >
          <Pause className="h-4 w-4" />
        </Button>
        <Button
          variant="destructive"
          size="icon"
          onClick={onStop}
          disabled={!isSessionActive || workspaceBusy}
          aria-label="Stop study session"
        >
          <Square className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onExit} disabled={workspaceBusy}>
          Exit
        </Button>
      </div>
    </header>
  );
}

