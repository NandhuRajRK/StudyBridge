import { Link } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "lucide-react";
import { differenceInDays } from "date-fns";

export default function DashboardCourseCard({ course, topics }) {
  const topicCount = topics.length;
  const masteredCount = topics.filter(t => t.status === 'mastered').length;
  const daysUntilExam = course.exam_date ? differenceInDays(new Date(course.exam_date), new Date()) : null;

  return (
    <Link 
      to={`/courses/${course.id}`} 
      className="bg-card border rounded-lg p-4 hover:shadow-sm transition-shadow group"
    >
      <div className="flex items-start gap-3">
        <div 
          className="w-3 h-3 rounded-full mt-1 shrink-0" 
          style={{ backgroundColor: course.color || '#3B5BDB' }} 
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
            {course.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{course.code}</p>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>{masteredCount}/{topicCount} topics mastered</span>
          <span>{course.overall_progress || 0}%</span>
        </div>
        <Progress value={course.overall_progress || 0} className="h-1.5" />
      </div>

      {daysUntilExam !== null && daysUntilExam >= 0 && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          <Calendar className="w-3 h-3 text-muted-foreground" />
          <span className={daysUntilExam <= 7 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
            {daysUntilExam === 0 ? 'Exam today!' : `${daysUntilExam} days until exam`}
          </span>
        </div>
      )}
    </Link>
  );
}