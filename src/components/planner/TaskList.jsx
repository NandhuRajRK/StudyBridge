import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Trash2, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateKey, getTaskDateKey } from "@/lib/calendar";

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
      <div className="bg-card border rounded-lg max-h-[42vh] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Est. minutes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map(task => {
          const course = courses.find(c => c.id === task.course_id);
          const topic = topics.find(t => t.id === task.topic_id);
          const link = getTaskLink(task);
          return (
            <TableRow key={task.id} className={variant === "muted" ? "opacity-60" : ""}>
              <TableCell>
                <div className="min-w-0">
                  <p className={`text-sm font-medium truncate ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                    {task.title}
                  </p>
                  {task.instructions && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{task.instructions}</p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {course ? (
                  <span className="flex items-center gap-1.5 text-sm">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: course.color }} />
                    {course.title}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No course</span>
                )}
              </TableCell>
              <TableCell>{topic?.title || task.topic_title || "—"}</TableCell>
              <TableCell>{task.due_date ? formatDateKey(getTaskDateKey(task), "MMM d, yyyy") : "Unscheduled"}</TableCell>
              <TableCell>
                <span className={`text-xs font-medium uppercase ${getPriorityColor(task.priority)}`}>
                  {task.priority || "medium"}
                </span>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2" onClick={() => onToggle(task)}>
                  {task.status === "completed" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  {task.status === "completed" ? "Done" : "Open"}
                </Button>
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  {task.estimated_minutes || 0}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  {link ? (
                    <Button asChild size="sm" variant="outline" className="gap-1.5">
                      <Link to={link}>{getActionLabel(task)} <ArrowRight className="w-3.5 h-3.5" /></Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>No link</Button>
                  )}
                  <button
                    onClick={() => onDelete(task.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Delete task"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
