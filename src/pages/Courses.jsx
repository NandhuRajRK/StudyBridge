import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ArrowDown, ArrowUp, ArrowUpDown, BookOpen, Plus } from "lucide-react";
import { studybridge } from "@/api/studybridgeClient";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import CreateCourseDialog from "@/components/courses/CreateCourseDialog";
import { DataTablePagination, DataTableToolbar } from "@/components/ui/data-table-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DeleteActionButton from "@/components/common/DeleteActionButton";
import { useTableState } from "@/hooks/useTableState";

const SORTABLE_COLUMNS = {
  code: true,
  course: true,
  progress: true,
  topics: true,
  last_studied: true,
  next_task: true,
};

function sortIcon(active, direction) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5" />;
  return direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
}

export default function Courses() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [sortBy, setSortBy] = useState("course");
  const [sortDirection, setSortDirection] = useState("asc");
  const table = useTableState({
    initialFilters: { status: "all" },
    initialPageSize: 10,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [courseRows, topicRows, sessionRows, taskRows] = await Promise.all([
      studybridge.entities.Course.list("-created_date", 50),
      studybridge.entities.Topic.list("-created_date", 300),
      studybridge.entities.StudySession.list("-created_date", 400),
      studybridge.entities.Task.list("due_date", 400),
    ]);
    setCourses(courseRows);
    setTopics(topicRows);
    setSessions(sessionRows);
    setTasks(taskRows);
    setLoading(false);
  };

  const handleCourseCreated = (newCourse) => {
    setCourses((prev) => [newCourse, ...prev]);
    setShowCreate(false);
  };

  const rows = useMemo(() => {
    const topicCountByCourse = new Map();
    topics.forEach((topic) => {
      topicCountByCourse.set(topic.course_id, (topicCountByCourse.get(topic.course_id) || 0) + 1);
    });

    const lastSessionByCourse = new Map();
    sessions.forEach((session) => {
      if (!session.course_id || !session.created_date) return;
      const current = lastSessionByCourse.get(session.course_id);
      const nextTime = new Date(session.created_date).getTime();
      const currentTime = current ? new Date(current.created_date).getTime() : Number.NEGATIVE_INFINITY;
      if (nextTime > currentTime) {
        lastSessionByCourse.set(session.course_id, session);
      }
    });

    const nextTaskByCourse = new Map();
    tasks
      .filter((task) => task.status !== "completed")
      .forEach((task) => {
        if (!task.course_id) return;
        const current = nextTaskByCourse.get(task.course_id);
        const taskDue = task.due_date ? new Date(task.due_date).getTime() : Number.POSITIVE_INFINITY;
        const currentDue = current?.due_date ? new Date(current.due_date).getTime() : Number.POSITIVE_INFINITY;
        if (!current || taskDue < currentDue) {
          nextTaskByCourse.set(task.course_id, task);
        }
      });

    const mapped = courses.map((course) => {
      const lastSession = lastSessionByCourse.get(course.id) || null;
      const nextTask = nextTaskByCourse.get(course.id) || null;
      return {
        course,
        topicCount: topicCountByCourse.get(course.id) || 0,
        progress: Number(course.overall_progress || 0),
        lastSession,
        nextTask,
      };
    });

    const multiplier = sortDirection === "asc" ? 1 : -1;
    mapped.sort((a, b) => {
      if (sortBy === "code") {
        return multiplier * String(a.course.code || "").localeCompare(String(b.course.code || ""));
      }
      if (sortBy === "progress") {
        return multiplier * (a.progress - b.progress);
      }
      if (sortBy === "topics") {
        return multiplier * (a.topicCount - b.topicCount);
      }
      if (sortBy === "last_studied") {
        const left = a.lastSession?.created_date ? new Date(a.lastSession.created_date).getTime() : Number.NEGATIVE_INFINITY;
        const right = b.lastSession?.created_date ? new Date(b.lastSession.created_date).getTime() : Number.NEGATIVE_INFINITY;
        return multiplier * (left - right);
      }
      if (sortBy === "next_task") {
        const left = a.nextTask?.due_date ? new Date(a.nextTask.due_date).getTime() : Number.POSITIVE_INFINITY;
        const right = b.nextTask?.due_date ? new Date(b.nextTask.due_date).getTime() : Number.POSITIVE_INFINITY;
        return multiplier * (left - right);
      }
      return multiplier * String(a.course.title || "").localeCompare(String(b.course.title || ""));
    });

    return mapped;
  }, [courses, sessions, sortBy, sortDirection, tasks, topics]);

  const filteredRows = useMemo(() => {
    const q = table.search.trim().toLowerCase();
    return rows.filter(({ course, nextTask }) => {
      if (table.filters.status !== "all" && String(course.status || "active") !== table.filters.status) return false;
      if (!q) return true;
      return [
        course.title || "",
        course.code || "",
        course.term || "",
        nextTask?.title || "",
      ].join(" ").toLowerCase().includes(q);
    });
  }, [rows, table.search, table.filters.status]);
  const pagination = table.paginate(filteredRows);

  const handleSort = (column) => {
    if (!SORTABLE_COLUMNS[column]) return;
    setSortBy((current) => {
      if (current === column) {
        setSortDirection((dir) => (dir === "asc" ? "desc" : "asc"));
        return current;
      }
      setSortDirection("asc");
      return column;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden bg-background">
      <div className="flex h-full min-h-0 w-full flex-col gap-6 p-6 lg:p-8">
        <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Courses</h1>
        </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add Course
          </Button>
        </div>

        <div className="min-h-0 flex-1">
          {courses.length === 0 ? (
            <div className="bg-card border rounded-lg h-full p-12 text-center flex flex-col items-center justify-center">
              <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h2 className="text-lg font-medium mb-2">No courses yet</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                Add your university courses to start organizing study materials and tracking progress.
              </p>
              <Button onClick={() => setShowCreate(true)} className="gap-2">
                <Plus className="w-4 h-4" /> Add Your First Course
              </Button>
            </div>
          ) : (
            <div className="bg-card border rounded-lg h-full overflow-hidden flex flex-col">
              <div className="p-4 border-b">
                <DataTableToolbar
                  searchValue={table.search}
                  onSearchChange={table.setSearch}
                  searchPlaceholder="Search by code, course, term, or task..."
                >
                  <Select value={table.filters.status} onValueChange={(value) => table.setFilter("status", value)}>
                    <SelectTrigger className="w-full md:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </DataTableToolbar>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button type="button" onClick={() => handleSort("code")} className="inline-flex items-center gap-1.5">
                        Code {sortIcon(sortBy === "code", sortDirection)}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" onClick={() => handleSort("course")} className="inline-flex items-center gap-1.5">
                        Course {sortIcon(sortBy === "course", sortDirection)}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" onClick={() => handleSort("progress")} className="inline-flex items-center gap-1.5">
                        Progress {sortIcon(sortBy === "progress", sortDirection)}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" onClick={() => handleSort("topics")} className="inline-flex items-center gap-1.5">
                        Topics {sortIcon(sortBy === "topics", sortDirection)}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" onClick={() => handleSort("last_studied")} className="inline-flex items-center gap-1.5">
                        Last studied {sortIcon(sortBy === "last_studied", sortDirection)}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" onClick={() => handleSort("next_task")} className="inline-flex items-center gap-1.5">
                        Next task {sortIcon(sortBy === "next_task", sortDirection)}
                      </button>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.rows.map(({ course, progress, topicCount, lastSession, nextTask }) => (
                    <TableRow
                      key={course.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/courses/${course.id}`)}
                    >
                      <TableCell>{course.code || "—"}</TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{course.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {course.term || "No term"} · {course.status === "completed" ? "Completed" : "Active"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-[150px] space-y-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{progress}%</span>
                          </div>
                          <Progress value={progress} className="h-1.5" />
                        </div>
                      </TableCell>
                      <TableCell>{topicCount}</TableCell>
                      <TableCell>
                        {lastSession?.created_date
                          ? formatDistanceToNow(new Date(lastSession.created_date), { addSuffix: true })
                          : "Never"}
                      </TableCell>
                      <TableCell>
                        {nextTask ? (
                          <div className="min-w-0">
                            <p className="truncate text-sm">{nextTask.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {nextTask.due_date ? `Due ${new Date(nextTask.due_date).toLocaleDateString()}` : "No due date"}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No open task</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                          <Button size="sm" variant="outline" onClick={() => navigate(`/courses/${course.id}`)}>
                            Open
                          </Button>
                          <DeleteActionButton
                            entityName="Course"
                            item={course}
                            label={`${course.title} and all related content`}
                            onDeleted={loadData}
                            ariaLabel="Delete course"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              <DataTablePagination
                page={pagination.safePage}
                pageSize={table.pageSize}
                total={filteredRows.length}
                onPageChange={table.setPage}
                onPageSizeChange={table.setPageSize}
              />
            </div>
          )}
        </div>

        <CreateCourseDialog open={showCreate} onClose={() => setShowCreate(false)} onCreated={handleCourseCreated} />
      </div>
    </div>
  );
}
