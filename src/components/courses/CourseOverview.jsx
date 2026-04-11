import { Link } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { Brain, Clock, FileText, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function CourseOverview({ course, topics, sessions, materials }) {
  const totalStudyTime = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const weakTopics = topics.filter(t => t.mastery_level > 0 && t.mastery_level < 40).sort((a, b) => a.mastery_level - b.mastery_level);
  const strongTopics = topics.filter(t => t.mastery_level >= 70).sort((a, b) => b.mastery_level - a.mastery_level);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Topic mastery distribution */}
      <div className="bg-card border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Topic Mastery</h3>
        {topics.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Add topics to track mastery</p>
        ) : (
          <div className="space-y-2">
            {topics.slice(0, 8).map(topic => (
              <div key={topic.id} className="flex items-center gap-3">
                <span className="text-xs w-32 truncate">{topic.title}</span>
                <Progress value={topic.mastery_level || 0} className="flex-1 h-2" />
                <span className="text-xs text-muted-foreground w-8 text-right">{topic.mastery_level || 0}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Study stats */}
      <div className="space-y-4">
        <div className="bg-card border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Study Stats</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{Math.floor(totalStudyTime / 60)}h {totalStudyTime % 60}m</p>
                <p className="text-xs text-muted-foreground">Total study time</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{sessions.length}</p>
                <p className="text-xs text-muted-foreground">Sessions</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{materials.length}</p>
                <p className="text-xs text-muted-foreground">Materials</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{course.overall_progress || 0}%</p>
                <p className="text-xs text-muted-foreground">Progress</p>
              </div>
            </div>
          </div>
        </div>

        {/* Weak topics */}
        {weakTopics.length > 0 && (
          <div className="bg-card border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-destructive/80 uppercase tracking-wider mb-2">Needs Work</h3>
            <div className="space-y-1.5">
              {weakTopics.slice(0, 4).map(t => (
                <Link
                  key={t.id}
                  to={`/study?course=${course.id}&topic=${t.id}`}
                  className="flex items-center justify-between text-sm hover:text-primary transition-colors"
                >
                  <span className="truncate">{t.title}</span>
                  <span className="text-xs text-muted-foreground ml-2">{t.mastery_level}%</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent sessions */}
        {sessions.length > 0 && (
          <div className="bg-card border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Sessions</h3>
            <div className="space-y-1.5">
              {sessions.slice(0, 3).map(s => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{s.topic_title || 'Session'}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.created_date ? formatDistanceToNow(new Date(s.created_date), { addSuffix: true }) : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}