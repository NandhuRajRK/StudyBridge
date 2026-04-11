import { Link } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { ChevronRight, Trash2 } from "lucide-react";

export default function TopicList({ topics, course, onDelete }) {
  if (topics.length === 0) {
    return (
      <div className="bg-card border rounded-lg p-8 text-center">
        <p className="text-sm text-muted-foreground">No topics added yet. Add topics manually or upload materials to auto-generate them.</p>
      </div>
    );
  }

  const getStatusColor = (status) => {
    if (status === "mastered") return "bg-success";
    if (status === "in_progress") return "bg-primary";
    return "bg-muted-foreground/30";
  };

  return (
    <div className="bg-card border rounded-lg divide-y">
      {topics.map(topic => (
        <div key={topic.id} className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors group">
          <Link to={`/study?course=${course.id}&topic=${topic.id}`} className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(topic.status)}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium group-hover:text-primary transition-colors">{topic.title}</p>
              <p className="text-xs text-muted-foreground capitalize mt-0.5">
                {topic.status?.replace("_", " ")} - Confidence {topic.confidence || 0}/5
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <Progress value={topic.mastery_level || 0} className="w-20 h-1.5" />
                <span className="text-xs text-muted-foreground w-8 text-right">{topic.mastery_level || 0}%</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
            </div>
          </Link>
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(topic)}
              className="text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Delete topic"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
