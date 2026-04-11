import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function WeakTopics({ topics, courses }) {
  const weakTopics = topics
    .filter(t => t.mastery_level < 40 && t.mastery_level > 0)
    .sort((a, b) => a.mastery_level - b.mastery_level)
    .slice(0, 5);

  if (weakTopics.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-warning" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Needs Attention</h2>
      </div>
      <div className="bg-card border rounded-lg divide-y">
        {weakTopics.map(topic => {
          const course = courses.find(c => c.id === topic.course_id);
          return (
            <Link
              key={topic.id}
              to={`/study?course=${topic.course_id}&topic=${topic.id}`}
              className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors"
            >
              <div 
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: course?.color || '#3B5BDB' }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{topic.title}</p>
                <p className="text-xs text-muted-foreground">{course?.title}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Progress value={topic.mastery_level} className="w-16 h-1.5" />
                <span className="text-xs text-muted-foreground w-8 text-right">{topic.mastery_level}%</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}