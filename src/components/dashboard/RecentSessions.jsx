import { Link } from "react-router-dom";
import { Clock, Brain } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function RecentSessions({ sessions }) {
  if (sessions.length === 0) {
    return (
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Recent Study Sessions</h2>
        <div className="bg-card border rounded-lg p-6 text-center">
          <Brain className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No study sessions yet. Start your first session!</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent Sessions</h2>
        <Link to="/progress" className="text-xs text-primary hover:underline">View all</Link>
      </div>
      <div className="bg-card border rounded-lg divide-y">
        {sessions.map(session => (
          <div key={session.id} className="p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Brain className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session.topic_title || 'Study Session'}</p>
              <p className="text-xs text-muted-foreground">{session.course_title}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>{session.duration_minutes || 0}m</span>
              </div>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                {session.created_date ? formatDistanceToNow(new Date(session.created_date), { addSuffix: true }) : ''}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}