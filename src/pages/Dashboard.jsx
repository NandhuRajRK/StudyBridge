import { useState, useEffect } from "react";
import { studybridge } from "@/api/studybridgeClient";
import { useNavigate } from "react-router-dom";
import { Brain, ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import UpcomingTasks from "@/components/dashboard/UpcomingTasks";
import RecentSessions from "@/components/dashboard/RecentSessions";
import StudyRecommendations from "@/components/dashboard/StudyRecommendations";
import WeakTopics from "@/components/dashboard/WeakTopics";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend } from "recharts";
import { eachDayOfInterval, format, startOfDay, subDays } from "date-fns";
import { useLocale } from "@/lib/locale";

function normalizeTopicConfidence(topic) {
  const raw = Number(topic?.confidence);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(5, Math.max(1, raw));
  }
  const mastery = Number(topic?.mastery_level || 0);
  if (!Number.isFinite(mastery)) return 1;
  return Math.min(5, Math.max(1, Number((mastery / 20).toFixed(1))));
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [courses, setCourses] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("all");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { t } = useLocale();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedCourseId !== "all" && courses.some((course) => course.id === selectedCourseId)) return;
    if (courses.length > 0) {
      setSelectedCourseId(courses[0].id);
    } else {
      setSelectedCourseId("all");
    }
  }, [courses, selectedCourseId]);

  const loadData = async () => {
    const [u, c, t, s, tp] = await Promise.all([
      studybridge.auth.me(),
      studybridge.entities.Course.filter({ status: "active" }, "-created_date", 100),
      studybridge.entities.Task.filter({ status: "todo" }, "due_date", 50),
      studybridge.entities.StudySession.list("-created_date", 500),
      studybridge.entities.Topic.list("-mastery_level", 500),
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
  const dailyGoalHours = Number(((Number(user?.daily_goal_minutes || 60)) / 60).toFixed(2));

  const sessionsByCourseData = courses
    .map((course) => {
      const count = sessions.filter((session) => session.course_id === course.id).length;
      return {
        course: course.code || course.title,
        courseTitle: course.title,
        sessions: count,
      };
    })
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 10);

  const topicConfidenceData = topics
    .filter((topic) => selectedCourseId === "all" || topic.course_id === selectedCourseId)
    .map((topic) => ({
      topic: topic.title,
      confidence: normalizeTopicConfidence(topic),
      mastery: Number(topic.mastery_level || 0),
    }))
    .sort((a, b) => b.confidence - a.confidence || b.mastery - a.mastery)
    .slice(0, 20);

  const dailyStudyHoursData = eachDayOfInterval({
    start: subDays(startOfDay(new Date()), 13),
    end: startOfDay(new Date()),
  }).map((day) => {
    const key = format(day, "yyyy-MM-dd");
    const minutes = sessions
      .filter((session) => session.created_date && format(new Date(session.created_date), "yyyy-MM-dd") === key)
      .reduce((total, session) => total + Number(session.duration_minutes || 0), 0);
    const hours = Number((minutes / 60).toFixed(2));
    return {
      day: format(day, "MMM d"),
      hours,
      goal: dailyGoalHours,
    };
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  if (!hasData) {
    return (
      <div className="h-full overflow-hidden bg-background">
        <div className="flex h-full min-h-0 w-full flex-col items-center justify-center p-8 text-center">
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
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden bg-background">
      <div className="flex h-full min-h-0 w-full flex-col gap-6 p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              {getGreeting() === "Good morning" ? t("dashboard.goodMorning") : getGreeting() === "Good afternoon" ? t("dashboard.goodAfternoon") : t("dashboard.goodEvening")}, {user?.full_name?.split(' ')[0] || 'there'}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Track sessions, topic confidence, and daily study time against your goal.
            </p>
          </div>
          <Button onClick={() => navigate("/study")} className="gap-2">
            <Brain className="w-4 h-4" /> {t("dashboard.startStudying")}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-6">
          <section className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                Sessions per course
              </h2>
              {sessionsByCourseData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">No sessions yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={sessionsByCourseData} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="course" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) => [`${value} sessions`, "Sessions"]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.courseTitle || ""}
                    />
                    <Bar dataKey="sessions" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Topic confidence by course
                </h2>
                <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Select course" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All courses</SelectItem>
                    {courses.map((course) => (
                      <SelectItem key={course.id} value={course.id}>
                        {course.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {topicConfidenceData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">No topic confidence data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={topicConfidenceData} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="topic" tick={{ fontSize: 12 }} interval={0} angle={-28} textAnchor="end" height={68} />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => [`${value}/5`, "Confidence"]} />
                    <Bar dataKey="confidence" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Daily study hours vs goal
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyStudyHoursData} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => [`${value}h`, ""]} />
                <Legend />
                <Line type="monotone" dataKey="hours" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} name="Study hours" />
                <Line type="monotone" dataKey="goal" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} strokeDasharray="6 4" name="Goal line" />
              </LineChart>
            </ResponsiveContainer>
          </section>

          {/* Main grid */}
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <RecentSessions sessions={sessions} />
              <WeakTopics topics={topics} courses={courses} />
            </div>
            <div className="space-y-6">
              <UpcomingTasks tasks={tasks} />
              <StudyRecommendations courses={courses} topics={topics} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
