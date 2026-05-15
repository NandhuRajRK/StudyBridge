import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ArrowLeft, ArrowRight, CalendarDays, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildIcsForEvents, buildTaskCalendarMeta, buildGoogleCalendarUrl, dateKeyToDate, downloadTextFile, getTaskDateKey } from "@/lib/calendar";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarView({ tasks, courses, topics = [], onCreateTaskAtDate }) {
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(new Date());

  const tasksByDate = useMemo(() => {
    const map = new Map();
    tasks.forEach((task) => {
      const dateKey = getTaskDateKey(task);
      if (!dateKey) return;
      const list = map.get(dateKey) || [];
      list.push(task);
      map.set(dateKey, list);
    });
    return map;
  }, [tasks]);

  const monthStart = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
  const monthEnd = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const selectedDateKey = format(selectedDate, "yyyy-MM-dd");
  const selectedTasks = tasksByDate.get(selectedDateKey) || [];
  const monthTasks = tasks.filter((task) => {
    const dateKey = getTaskDateKey(task);
    const date = dateKeyToDate(dateKey);
    return date && isSameMonth(date, currentMonth);
  });
  const calendarExportTasks = monthTasks.length > 0 ? monthTasks : tasks;

  const taskLink = (task) => {
    if (task.course_id && task.topic_id) return `/study?course=${task.course_id}&topic=${task.topic_id}`;
    if (task.course_id) return `/courses/${task.course_id}`;
    return null;
  };

  const exportMonth = () => {
    if (calendarExportTasks.length === 0) return;
    const events = calendarExportTasks.map((task) => {
      const course = courses.find((item) => item.id === task.course_id);
      const topic = topics.find((item) => item.id === task.topic_id);
      return buildTaskCalendarMeta(task, course, topic, selectedDate);
    });
    const ics = buildIcsForEvents(events);
    const slug = format(currentMonth, "yyyy-MM");
    downloadTextFile(`studybridge-${slug}.ics`, ics, "text/calendar;charset=utf-8");
  };

  const openMonthGoogle = () => {
    const firstTask = calendarExportTasks[0];
    if (!firstTask) return;
    const course = courses.find((item) => item.id === firstTask.course_id);
    const topic = topics.find((item) => item.id === firstTask.topic_id);
    const meta = buildTaskCalendarMeta(firstTask, course, topic, selectedDate);
    const url = buildGoogleCalendarUrl(meta);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Month calendar</p>
          <h3 className="text-lg font-semibold">{format(currentMonth, "MMMM yyyy")}</h3>
          <p className="text-sm text-muted-foreground">Tasks are placed by due date. Click any day to inspect work and open a prefilled Add Task form.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth((value) => addMonths(value, -1))} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setCurrentMonth(startOfMonth(new Date())); setSelectedDate(new Date()); }}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth((value) => addMonths(value, 1))} className="gap-2">
            Next <ArrowRight className="w-4 h-4" />
          </Button>
            <Button variant="outline" size="sm" onClick={exportMonth} disabled={calendarExportTasks.length === 0} className="gap-2">
              <Download className="w-4 h-4" /> Export .ics
            </Button>
          <Button variant="outline" size="sm" onClick={openMonthGoogle} disabled={calendarExportTasks.length === 0} className="gap-2">
            <ExternalLink className="w-4 h-4" /> Open first in Google Calendar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-xs font-medium text-muted-foreground">
        {WEEKDAYS.map((day) => (
          <div key={day} className="px-2 py-1">{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {monthDays.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dayTasks = tasksByDate.get(dateKey) || [];
          const inMonth = isSameMonth(day, currentMonth);
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={dateKey}
              role="button"
              tabIndex={0}
              onClick={() => {
                setSelectedDate(day);
                onCreateTaskAtDate?.(dateKey);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedDate(day);
                  onCreateTaskAtDate?.(dateKey);
                }
              }}
              className={`min-h-[150px] rounded-lg border p-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                isSelected ? "border-primary bg-primary/5" : "bg-card hover:border-primary/50"
              } ${inMonth ? "" : "opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className={`block text-xs ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {format(day, "EEE")}
                  </span>
                  <span className={`text-lg font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>
                    {format(day, "d")}
                  </span>
                </div>
                {dayTasks.length > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                    {dayTasks.length}
                  </span>
                )}
              </div>

              <div className="mt-2 space-y-1">
                {dayTasks.slice(0, 3).map((task) => {
                  const course = courses.find((item) => item.id === task.course_id);
                  const link = taskLink(task);
                  return link ? (
                    <Link
                      key={task.id}
                      to={link}
                      onClick={(event) => event.stopPropagation()}
                      className={`block rounded-md border px-2 py-1 text-xs shadow-sm ${
                        task.status === "completed" ? "opacity-50 line-through" : ""
                      }`}
                      style={{
                        backgroundColor: course?.color ? `${course.color}14` : "hsl(var(--muted))",
                        borderLeft: `3px solid ${course?.color || "hsl(var(--border))"}`,
                      }}
                    >
                      <p className="truncate font-medium">{task.title}</p>
                      {task.topic_title && <p className="truncate text-[11px] text-muted-foreground">{task.topic_title}</p>}
                    </Link>
                  ) : (
                    <div
                      key={task.id}
                      className={`rounded-md border px-2 py-1 text-xs ${
                        task.status === "completed" ? "opacity-50 line-through" : ""
                      }`}
                      style={{
                        backgroundColor: course?.color ? `${course.color}14` : "hsl(var(--muted))",
                        borderLeft: `3px solid ${course?.color || "hsl(var(--border))"}`,
                      }}
                    >
                      <p className="truncate font-medium">{task.title}</p>
                    </div>
                  );
                })}
                {dayTasks.length > 3 && (
                  <p className="px-1 text-[11px] text-muted-foreground">+{dayTasks.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Selected day</p>
            <p className="text-sm text-muted-foreground">{format(selectedDate, "EEEE, MMMM d")}</p>
          </div>
          <span className="text-xs rounded-full bg-muted px-2 py-1">{selectedTasks.length} task{selectedTasks.length === 1 ? "" : "s"}</span>
        </div>

        {selectedTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks due on this day.</p>
        ) : (
          <div className="space-y-2">
            {selectedTasks.map((task) => {
              const course = courses.find((item) => item.id === task.course_id);
              const topic = topics.find((item) => item.id === task.topic_id);
              const link = taskLink(task);
              const meta = buildTaskCalendarMeta(task, course, topic, selectedDate);

              return (
                <div key={task.id} className="rounded-lg border bg-background p-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className={`font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {course?.title || task.course_title || "No course"}
                      {meta.details ? ` - ${task.estimated_minutes || 0}m` : ""}
                    </p>
                    {(task.instructions || task.outcome || topic?.title || task.topic_title) && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {task.instructions || task.outcome}
                        {task.topic_title ? ` - Topic: ${task.topic_title}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {link && (
                      <Button asChild size="sm" variant="outline" className="gap-1.5">
                        <Link to={link}>Open {task.course_id && task.topic_id ? "study" : "course"}</Link>
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => {
                        const url = buildGoogleCalendarUrl(meta);
                        if (url) window.open(url, "_blank", "noopener,noreferrer");
                      }}
                      disabled={!meta.dateKey}
                    >
                      <CalendarDays className="w-3.5 h-3.5" /> Google Calendar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      onClick={() => downloadTextFile(`${(meta.title || "study-task").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "study-task"}.ics`, buildIcsForEvents([meta]), "text/calendar;charset=utf-8")}
                      disabled={!meta.dateKey}
                    >
                      <Download className="w-3.5 h-3.5" /> ICS
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
