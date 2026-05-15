import { useState, useEffect } from "react";
import { studybridge } from "@/api/studybridgeClient";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Calendar, List, Loader2, Lightbulb, ArrowRight } from "lucide-react";
import TaskList from "@/components/planner/TaskList";
import AddTaskDialog from "@/components/planner/AddTaskDialog";
import CalendarView from "@/components/planner/CalendarView";
import { isAfter, isBefore, startOfDay, addDays } from "date-fns";
import { confirmAndDelete } from "@/lib/deleteEntity";
import { loadPlannerContext } from "@/lib/aiContext";
import { isDesktopAiUnavailable, loadDesktopAiRuntime } from "@/lib/desktopAi";
import { useLocale } from "@/lib/locale";
import { dateKeyToDate, getTaskDateKey } from "@/lib/calendar";

const normalize = (value) => (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function findCourseByTitle(courses, title) {
  const target = normalize(title);
  return courses.find(c => normalize(c.title) === target || normalize(c.code) === target) ||
    courses.find(c => target && normalize(c.title).includes(target));
}

function findTopicByTitle(topics, courseId, title) {
  const target = normalize(title);
  const courseTopics = topics.filter(t => !courseId || t.course_id === courseId);
  return courseTopics.find(t => normalize(t.title) === target) ||
    courseTopics.find(t => target && (normalize(t.title).includes(target) || target.includes(normalize(t.title))));
}

export default function Planner() {
  const [tasks, setTasks] = useState([]);
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [profile, setProfile] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskInitialValues, setAddTaskInitialValues] = useState({});
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const { t } = useLocale();

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    loadDesktopAiRuntime().then(setRuntime);
  }, []);

  const loadData = async () => {
    const [t, c, tp, p] = await Promise.all([
      studybridge.entities.Task.list("due_date", 200),
      studybridge.entities.Course.filter({ status: "active" }, "-created_date", 50),
      studybridge.entities.Topic.list("order", 300),
      studybridge.auth.me(),
    ]);
    setTasks(t);
    setCourses(c);
    setTopics(tp);
    setProfile(p);
    setLoading(false);
  };

  const generateStudyPlan = async () => {
    if (courses.length === 0) {
      window.alert("Add a course first, then I can build a useful study plan.");
      return;
    }

    setGeneratingPlan(true);
    try {
      const context = await loadPlannerContext();
      const itemLimit = profile?.planner_item_limit || 8;

      const result = await studybridge.integrations.Core.InvokeLLM({
        prompt: `You are StudyBridge's planner. Build an actionable 7-day plan from the user's actual study context.

Rules:
- Keep each task concrete and doable in one session.
- Every task should have an instruction and an outcome.
- Use existing topic titles when possible.
- Avoid duplicating open tasks.
- Do not produce generic filler like "review chapter" without saying what the student should do.
- Prefer 1-2 tasks per course if the student has many courses.
- If the profile says the daily goal is low, keep the workload realistic.
- Return at most ${itemLimit} tasks.

StudyBridge context:
${context}`,
        response_json_schema: {
          type: "object",
          properties: {
            tasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  instructions: { type: "string" },
                  outcome: { type: "string" },
                  type: { type: "string" },
                  priority: { type: "string" },
                  days_from_now: { type: "number" },
                  estimated_minutes: { type: "number" },
                  course_title: { type: "string" },
                  topic_title: { type: "string" }
                }
              }
            }
          }
        }
      });

      for (const task of (result.tasks || []).slice(0, itemLimit)) {
        const course = findCourseByTitle(courses, task.course_title) || courses[0];
        const topic = findTopicByTitle(topics, course?.id, task.topic_title);
        await studybridge.entities.Task.create({
          title: task.title || (topic ? `Study ${topic.title}` : `Study ${course?.title || "course"}`),
          instructions: task.instructions || "Open the linked study session and work through the topic.",
          outcome: task.outcome || "You can explain the key idea without notes.",
          type: task.type || "study",
          priority: task.priority || "medium",
          due_date: addDays(new Date(), Math.max(0, task.days_from_now || 0)).toISOString(),
          estimated_minutes: task.estimated_minutes || 30,
          course_id: course?.id,
          topic_id: topic?.id,
          course_title: course?.title,
          topic_title: topic?.title || task.topic_title,
          source: "ai_plan",
          status: "todo",
        });
      }

      await loadData();
    } catch (error) {
      console.error("Failed to generate study plan", error);
      window.alert(error.message || "Failed to generate study plan");
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handleToggleTask = async (task) => {
    const newStatus = task.status === "completed" ? "todo" : "completed";
    await studybridge.entities.Task.update(task.id, {
      status: newStatus,
      completed_at: newStatus === "completed" ? new Date().toISOString() : null
    });
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
  };

  const handleDeleteTask = async (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const deleted = await confirmAndDelete("Task", task, task.title || "task");
    if (deleted) setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const openAddTaskDialog = (initialValues = {}) => {
    setAddTaskInitialValues(initialValues);
    setShowAddTask(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const today = startOfDay(new Date());
  const todayKey = getTaskDateKey({ due_date: today });
  const activeTasks = tasks.filter(t => t.status !== "completed");
  const overdue = activeTasks.filter((task) => {
    const dueKey = getTaskDateKey(task);
    const dueDate = dateKeyToDate(dueKey);
    return dueDate && isBefore(startOfDay(dueDate), today) && dueKey !== todayKey;
  });
  const todayTasks = tasks.filter((task) => getTaskDateKey(task) === todayKey);
  const upcoming = activeTasks.filter((task) => {
    const dueKey = getTaskDateKey(task);
    const dueDate = dateKeyToDate(dueKey);
    return dueDate && isAfter(startOfDay(dueDate), today);
  });
  const unscheduled = activeTasks.filter(t => !getTaskDateKey(t));
  const completed = tasks.filter(t => t.status === "completed");
  const nextTask = overdue[0] || todayTasks.find(t => t.status !== "completed") || upcoming[0] || unscheduled[0];
  const aiUnavailable = isDesktopAiUnavailable(runtime);

  return (
    <div className="h-full overflow-hidden bg-background">
      <div className="flex h-full min-h-0 w-full flex-col gap-6 p-6 lg:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("nav.planner")}</h1>
        </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={generateStudyPlan} disabled={generatingPlan || aiUnavailable} className="gap-2">
              {generatingPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
              {generatingPlan ? "Generating..." : "Build actionable plan"}
            </Button>
            <Button onClick={() => openAddTaskDialog()} className="gap-2">
              <Plus className="w-4 h-4" /> Add Task
            </Button>
          </div>
        </div>

        <NextTaskCard task={nextTask} courses={courses} topics={topics} onToggle={handleToggleTask} />

        <Tabs defaultValue="list" className="min-h-0 flex-1 flex flex-col">
          <TabsList className="w-fit">
            <TabsTrigger value="list" className="gap-1.5"><List className="w-3.5 h-3.5" /> List</TabsTrigger>
            <TabsTrigger value="calendar" className="gap-1.5"><Calendar className="w-3.5 h-3.5" /> Calendar</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-6 mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
            {activeTasks.length === 0 && <EmptyPlan onGenerate={generateStudyPlan} generating={generatingPlan} />}
            {overdue.length > 0 && (
              <TaskList title="Overdue" tasks={overdue} courses={courses} topics={topics} onToggle={handleToggleTask} onDelete={handleDeleteTask} variant="destructive" />
            )}
            <TaskList title="Today" tasks={todayTasks} courses={courses} topics={topics} onToggle={handleToggleTask} onDelete={handleDeleteTask} />
            <TaskList title="Upcoming" tasks={upcoming} courses={courses} topics={topics} onToggle={handleToggleTask} onDelete={handleDeleteTask} />
            <TaskList title="Unscheduled" tasks={unscheduled} courses={courses} topics={topics} onToggle={handleToggleTask} onDelete={handleDeleteTask} />
            {completed.length > 0 && (
              <TaskList title="Completed" tasks={completed.slice(0, 10)} courses={courses} topics={topics} onToggle={handleToggleTask} onDelete={handleDeleteTask} variant="muted" />
            )}
          </TabsContent>

          <TabsContent value="calendar" className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
            <CalendarView
              tasks={tasks}
              courses={courses}
              topics={topics}
              onCreateTaskAtDate={(dateValue) => openAddTaskDialog({ due_date: dateValue })}
            />
          </TabsContent>
        </Tabs>

        <AddTaskDialog
          open={showAddTask}
          onClose={() => {
            setShowAddTask(false);
            setAddTaskInitialValues({});
          }}
          courses={courses}
          topics={topics}
          onCreated={loadData}
          initialValues={addTaskInitialValues}
        />
      </div>
    </div>
  );
}

function getTaskLinks(task, topics) {
  const topic = topics.find(t => t.id === task?.topic_id);
  if (task?.course_id && task?.topic_id) return { study: `/study?course=${task.course_id}&topic=${task.topic_id}`, topic };
  if (task?.course_id) return { course: `/courses/${task.course_id}`, topic };
  return {};
}

function NextTaskCard({ task, courses, topics, onToggle }) {
  if (!task) {
    return (
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-5">
        <h2 className="font-semibold">No active tasks yet</h2>
        <p className="text-sm text-muted-foreground mt-1">Build a plan or add a task. The planner becomes useful when every task has a next action.</p>
      </div>
    );
  }

  const course = courses.find(c => c.id === task.course_id);
  const links = getTaskLinks(task, topics);

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Do this next</p>
        <h2 className="text-lg font-semibold mt-1">{task.title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{task.instructions || "Open the linked study item and complete the block."}</p>
        <p className="text-xs text-muted-foreground mt-2">
          {course?.title || task.course_title || "No course"} {task.topic_title ? `- ${task.topic_title}` : ""} {task.estimated_minutes ? `- ${task.estimated_minutes}m` : ""}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        {links.study ? (
          <Button asChild className="gap-2">
            <a href={links.study}>Start study <ArrowRight className="w-4 h-4" /></a>
          </Button>
        ) : links.course ? (
          <Button asChild variant="outline" className="gap-2">
            <a href={links.course}>Open course <ArrowRight className="w-4 h-4" /></a>
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => onToggle(task)}>Mark done</Button>
      </div>
    </div>
  );
}

function EmptyPlan({ onGenerate, generating }) {
  return (
    <div className="bg-card border rounded-lg p-8 text-center">
      <Lightbulb className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
      <h2 className="font-medium">No plan yet</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-4">Generate an actionable plan that links back into study sessions and course pages.</p>
      <Button onClick={onGenerate} disabled={generating} className="gap-2">
        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
        Build actionable plan
      </Button>
    </div>
  );
}
