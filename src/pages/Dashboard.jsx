import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Clock, TrendingUp, Brain, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import DashboardCourseCard from "@/components/dashboard/DashboardCourseCard";
import UpcomingTasks from "@/components/dashboard/UpcomingTasks";
import RecentSessions from "@/components/dashboard/RecentSessions";
import StudyRecommendations from "@/components/dashboard/StudyRecommendations";
import WeakTopics from "@/components/dashboard/WeakTopics";
import { useLocale } from "@/lib/locale";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [courses, setCourses] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { t } = useLocale();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [u, c, t, s, tp] = await Promise.all([
      base44.auth.me(),
      base44.entities.Course.filter({ status: "active" }, "-created_date", 10),
      base44.entities.Task.filter({ status: "todo" }, "due_date", 10),
      base44.entities.StudySession.list("-created_date", 5),
      base44.entities.Topic.list("-mastery_level", 50),
    ]);
    setUser(u);
    setCourses(c);
    setTasks(t);
    setSessions(s);
    setTopics(tp);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const hasData = courses.length > 0;
  const totalStudyTime = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const avgMastery = topics.length > 0 ? Math.round(topics.reduce((sum, t) => sum + (t.mastery_level || 0), 0) / topics.length) : 0;
  const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed');

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  if (!hasData) {
    return (
      <div className="p-8 max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
          <BookOpen className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold mb-2">{t("dashboard.welcomeTitle")}</h1>
        <p className="text-muted-foreground mb-8 max-w-md">
          {t("dashboard.welcomeBody")}
        </p>
        <Button onClick={() => navigate("/courses")} size="lg">
          {t("dashboard.addFirstCourse")} <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {getGreeting() === "Good morning" ? t("dashboard.goodMorning") : getGreeting() === "Good afternoon" ? t("dashboard.goodAfternoon") : t("dashboard.goodEvening")}, {user?.full_name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {courses.length} {t("dashboard.activeCourses")} · {avgMastery}% {t("dashboard.avgMastery")}
          </p>
        </div>
        <Button onClick={() => navigate("/study")} className="gap-2">
          <Brain className="w-4 h-4" /> {t("dashboard.startStudying")}
        </Button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={BookOpen} label={t("dashboard.activeCourses")} value={courses.length} />
        <StatCard icon={Clock} label={t("dashboard.studyTime")} value={`${Math.round(totalStudyTime / 60)}h ${totalStudyTime % 60}m`} />
        <StatCard icon={TrendingUp} label={t("dashboard.avgMastery")} value={`${avgMastery}%`} />
        <StatCard 
          icon={overdueTasks.length > 0 ? AlertTriangle : CheckCircle2} 
          label={overdueTasks.length > 0 ? t("dashboard.overdueTasks") : t("dashboard.tasksDue")} 
          value={overdueTasks.length > 0 ? overdueTasks.length : tasks.length}
          alert={overdueTasks.length > 0}
        />
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column - 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Course cards */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("dashboard.yourCourses")}</h2>
              <Link to="/courses" className="text-xs text-primary hover:underline">{t("dashboard.viewAll")}</Link>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {courses.slice(0, 4).map(course => (
                <DashboardCourseCard key={course.id} course={course} topics={topics.filter(t => t.course_id === course.id)} />
              ))}
            </div>
          </section>

          {/* Recent sessions */}
          <RecentSessions sessions={sessions} />

          {/* Weak topics */}
          <WeakTopics topics={topics} courses={courses} />
        </div>

        {/* Right column - 1/3 */}
        <div className="space-y-6">
          <UpcomingTasks tasks={tasks} />
          <StudyRecommendations courses={courses} topics={topics} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, alert }) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-3.5 h-3.5 ${alert ? 'text-destructive' : 'text-muted-foreground'}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-xl font-semibold ${alert ? 'text-destructive' : ''}`}>{value}</p>
    </div>
  );
}
