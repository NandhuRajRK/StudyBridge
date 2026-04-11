import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, TrendingUp, ArrowRight, RotateCcw, Star } from "lucide-react";

export default function SessionRecap({ session, course, topic, timer, onDone, onStudyMore }) {
  const duration = Math.max(1, Math.round(timer / 60));
  const confidenceChange = (session.confidence_after || 0) - (session.confidence_before || 0);

  return (
    <div className="p-6 lg:p-8 max-w-lg mx-auto flex flex-col items-center justify-center min-h-[70vh]">
      <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mb-6">
        <CheckCircle2 className="w-8 h-8 text-success" />
      </div>

      <h1 className="text-2xl font-semibold mb-1">Session Complete</h1>
      <p className="text-muted-foreground text-sm mb-8">{topic?.title} - {course?.title}</p>

      <div className="grid grid-cols-3 gap-6 mb-8 w-full">
        <div className="text-center">
          <Clock className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
          <p className="text-lg font-semibold">{duration}m</p>
          <p className="text-xs text-muted-foreground">Duration</p>
        </div>
        <div className="text-center">
          <TrendingUp className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
          <p className="text-lg font-semibold">
            {confidenceChange > 0 ? "+" : ""}{confidenceChange}
          </p>
          <p className="text-xs text-muted-foreground">Confidence</p>
        </div>
        <div className="text-center">
          <Star className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
          <p className="text-lg font-semibold">{session.confidence_after || 0}/5</p>
          <p className="text-xs text-muted-foreground">Final Rating</p>
        </div>
      </div>

      <div className="flex gap-3 w-full">
        <Button variant="outline" onClick={onStudyMore} className="flex-1 gap-2">
          <RotateCcw className="w-4 h-4" /> Study More
        </Button>
        <Button onClick={onDone} className="flex-1 gap-2">
          Done <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
