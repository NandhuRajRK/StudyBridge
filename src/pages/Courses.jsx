import { useState, useEffect } from "react";
import { studybridge } from "@/api/studybridgeClient";
import { Link } from "react-router-dom";
import { Plus, BookOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { differenceInDays } from "date-fns";
import CreateCourseDialog from "@/components/courses/CreateCourseDialog";
import { confirmAndDelete } from "@/lib/deleteEntity";

export default function Courses() {
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [c, t] = await Promise.all([
      studybridge.entities.Course.list("-created_date", 50),
      studybridge.entities.Topic.list("-created_date", 200),
    ]);
    setCourses(c);
    setTopics(t);
    setLoading(false);
  };

  const handleCourseCreated = (newCourse) => {
    setCourses(prev => [newCourse, ...prev]);
    setShowCreate(false);
  };

  const handleDeleteCourse = async (course) => {
    try {
      const deleted = await confirmAndDelete("Course", course, `${course.title} and all related content`);
      if (deleted) await loadData();
    } catch (error) {
      console.error("Failed to delete course", error);
      window.alert(error.message || "Failed to delete course");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const activeCourses = courses.filter(c => c.status === "active");
  const completedCourses = courses.filter(c => c.status === "completed");

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Courses</h1>
          <p className="text-sm text-muted-foreground mt-1">{activeCourses.length} active courses</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add Course
        </Button>
      </div>

      {courses.length === 0 ? (
        <div className="bg-card border rounded-lg p-12 text-center">
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
        <>
          <CourseSection title="Active" courses={activeCourses} topics={topics} onDelete={handleDeleteCourse} />
          <CourseSection title="Completed" courses={completedCourses} topics={topics} onDelete={handleDeleteCourse} />
        </>
      )}

      <CreateCourseDialog open={showCreate} onClose={() => setShowCreate(false)} onCreated={handleCourseCreated} />
    </div>
  );
}

function CourseSection({ title, courses, topics, onDelete }) {
  if (courses.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">{title}</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map(course => (
          <CourseCard
            key={course.id}
            course={course}
            topics={topics.filter(t => t.course_id === course.id)}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}

function CourseCard({ course, topics, onDelete }) {
  const topicCount = topics.length;
  const daysUntilExam = course.exam_date ? differenceInDays(new Date(course.exam_date), new Date()) : null;

  return (
    <div className="bg-card border rounded-lg p-5 hover:shadow-md transition-all group">
      <div className="flex items-start gap-3 mb-3">
        <Link
          to={`/courses/${course.id}`}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-semibold shrink-0"
          style={{ backgroundColor: course.color || "#3B5BDB" }}
        >
          {course.code?.substring(0, 2) || course.title.substring(0, 2).toUpperCase()}
        </Link>
        <Link to={`/courses/${course.id}`} className="min-w-0 flex-1">
          <h3 className="font-medium group-hover:text-primary transition-colors truncate">{course.title}</h3>
          <p className="text-sm text-muted-foreground">{course.code} - {course.term}</p>
        </Link>
        <button
          type="button"
          onClick={() => onDelete(course)}
          className="text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Delete course"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {course.instructor && (
        <p className="text-xs text-muted-foreground mb-3">Prof. {course.instructor}</p>
      )}

      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{topicCount} topics</span>
          <span>{course.overall_progress || 0}%</span>
        </div>
        <Progress value={course.overall_progress || 0} className="h-1.5" />
      </div>

      {daysUntilExam !== null && daysUntilExam >= 0 && (
        <p className={`text-xs mt-3 ${daysUntilExam <= 7 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
          {daysUntilExam === 0 ? "Exam today" : `Exam in ${daysUntilExam} days`}
        </p>
      )}
    </div>
  );
}
