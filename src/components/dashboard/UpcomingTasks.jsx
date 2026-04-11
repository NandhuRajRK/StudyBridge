import { Link } from "react-router-dom";
import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { format, isPast, isToday, isTomorrow } from "date-fns";

export default function UpcomingTasks({ tasks }) {
  const formatDueDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isPast(date)) return 'Overdue';
    return format(date, 'MMM d');
  };

  const isOverdue = (dateStr) => dateStr && isPast(new Date(dateStr)) && !isToday(new Date(dateStr));

  return (
    <section className="bg-card border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Upcoming Tasks</h2>
        <Link to="/planner" className="text-xs text-primary hover:underline">View all</Link>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No upcoming tasks</p>
      ) : (
        <div className="space-y-2">
          {tasks.slice(0, 6).map(task => (
            <div key={task.id} className="flex items-start gap-2.5 py-1.5">
              {task.status === 'completed' ? (
                <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{task.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs ${isOverdue(task.due_date) ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                    {isOverdue(task.due_date) && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                    {formatDueDate(task.due_date)}
                  </span>
                  {task.type && (
                    <span className="text-xs text-muted-foreground/60 capitalize">{task.type}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}