import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Trash2, Clock, ArrowRight, BookOpen, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { downloadTaskIcs, openGoogleCalendarTask, formatDateKey, getTaskDateKey } from "@/lib/calendar";

export default function TaskList({ title, tasks, courses, topics = [], onToggle, onDelete, variant }) {
  if (tasks.length === 0) return null;

  const getPriorityColor = (p) => {
    if (p === "urgent") return "text-destructive";
    if (p === "high") return "text-warning";
    return "text-muted-foreground";
  };

  const getTaskLink = (task) => {
    if (task.course_id && task.topic_id) return `/study?course=${task.course_id}&topic=${task.topic_id}`;
    if (task.course_id) return `/courses/${task.course_id}`;
    return null;
  };

  const getActionLabel = (task) => {
    if (task.course_id && task.topic_id) return "Start study";
    if (task.course_id) return "Open course";
    return "No link";
  };

  return (
    <section>
      <h3 className={`text-sm font-semibold uppercase tracking-wider mb-2 ${variant === "destructive" ? "text-destructive" : "text-muted-foreground"}`}>
        {title} ({tasks.length})
      </h3>
      <div className="bg-card border rounded-lg divide-y">
        {tasks.map(task => {
          const course = courses.find(c => c.id === task.course_id);
          const topic = topics.find(t => t.id === task.topic_id);
          const link = getTaskLink(task);
          return (
            <div key={task.id} className={`p-4 group ${variant === "muted" ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-3">
                <button onClick={() => onToggle(task)} className="shrink-0 mt-0.5" aria-label="Toggle task">
                  {task.status === "completed" ? (
                    <CheckCircle2 className="w-4.5 h-4.5 text-success" />
                  ) : (
                    <Circle className="w-4.5 h-4.5 text-muted-foreground/40 hover:text-primary transition-colors" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                    {task.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {course && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: course.color }} />
                        {course.title}
                      </span>
                    )}
                    {(topic || task.topic_title) && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <BookOpen className="w-3 h-3" />
                        {topic?.title || task.topic_title}
                      </span>
                    )}
                    {task.type && <span className="text-xs text-muted-foreground capitalize">{task.type}</span>}
                    <span className={`text-xs capitalize ${getPriorityColor(task.priority)}`}>{task.priority}</span>
                    {task.estimated_minutes && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" /> {task.estimated_minutes}m
                      </span>
                    )}
                    {task.due_date && (
                      <span className="text-xs text-muted-foreground">{formatDateKey(getTaskDateKey(task), "MMM d")}</span>
                    )}
                  </div>

                  {(task.instructions || task.outcome) && (
                    <div className="mt-2 rounded-md bg-muted/50 px-3 py-2">
                      {task.instructions && <p className="text-sm text-foreground">{task.instructions}</p>}
                      {task.outcome && <p className="text-xs text-muted-foreground mt-1">Done when: {task.outcome}</p>}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {link ? (
                    <Button asChild size="sm" variant={task.course_id && task.topic_id ? "default" : "outline"} className="gap-1.5">
                      <Link to={link}>{getActionLabel(task)} <ArrowRight className="w-3.5 h-3.5" /></Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>No link</Button>
                  )}
                  {task.due_date && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5" /> Calendar
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openGoogleCalendarTask(task, course, topic, task.created_date || task.updated_date || new Date())}>
                          Open in Google Calendar
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => downloadTaskIcs(task, course, topic, task.created_date || task.updated_date || new Date())}>
                          Download .ics
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <button
                    onClick={() => onDelete(task.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Delete task"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
