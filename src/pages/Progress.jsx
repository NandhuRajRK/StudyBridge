import { useState, useEffect } from "react";
import { studybridge } from "@/api/studybridgeClient";
import { Link } from "react-router-dom";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Clock, Brain, Target, AlertTriangle, ArrowRight, HelpCircle, Pencil } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import { formatDistanceToNow } from "date-fns";
import { getAverageMastery, getCourseProgressData, getMasteryDistribution, getStrongTopics, getWeeklyStudyStats, getWeakTopics, sumSessionMinutes } from "@/lib/studyStats";
import { useLocale } from "@/lib/locale";
import { Tooltip as HoverTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const COLORS = ["#3B5BDB", "#1098AD", "#37B24D", "#F59F00", "#E64980", "#7950F2"];

export default function Progress() {
  const [profile, setProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLocale();

  useEffect(() => {
    Promise.all([
      studybridge.auth.me(),
      studybridge.entities.Course.filter({ status: "active" }, "-created_date", 50),
      studybridge.entities.Topic.list("-mastery_level", 200),
      studybridge.entities.StudySession.list("-created_date", 50),
    ]).then(([p, c, t, s]) => {
      setProfile(p);
      setCourses(c);
      setTopics(t);
      setSessions(s);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const totalStudyTime = sumSessionMinutes(sessions);
  const totalSessions = sessions.length;
  const avgMastery = getAverageMastery(topics);
  const weakTopics = getWeakTopics(topics);
  const strongTopics = getStrongTopics(topics);
  const dailyGoal = profile?.daily_goal_minutes || 60;
  const {
    weeklySessions,
    weeklyStudyTime,
    weeklyGoal,
    weeklyGoalPct,
    paceLabel,
  } = getWeeklyStudyStats(sessions, dailyGoal);
  const courseProgressData = getCourseProgressData(courses);
  const masteryDist = getMasteryDistribution(topics);

  return (
    <TooltipProvider delayDuration={120}>
      <div className="h-full overflow-hidden bg-background">
        <div className="flex h-full min-h-0 w-full flex-col gap-6 p-6 lg:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{t("nav.progress")}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {profile?.full_name || "Student"} - {profile?.major || "no major set"} - {dailyGoal} min/day goal
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" className="gap-2">
                <Link to="/planner">{t("study.openPlanner")} <ArrowRight className="w-4 h-4" /></Link>
              </Button>
              <Button asChild className="gap-2">
                <Link to="/study">{t("study.startStudying")} <Brain className="w-4 h-4" /></Link>
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1.3fr_.9fr]">
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("study.weeklyGoal")}</h2>
              <HelpTip>Progress is anchored to your daily goal and last 7 days of study time.</HelpTip>
            </div>
            <span className="text-sm font-medium">{paceLabel}</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-3xl font-semibold">{Math.floor(weeklyStudyTime / 60)}h {weeklyStudyTime % 60}m</p>
                <p className="text-xs text-muted-foreground">Studied this week of {Math.floor(weeklyGoal / 60)}h {weeklyGoal % 60}m target</p>
              </div>
              <span className="text-xs text-muted-foreground">{weeklyGoalPct}%</span>
            </div>
            <ProgressBar value={weeklyGoalPct} className="h-2" />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Courses in view</p>
              <p className="font-medium">{courses.length}</p>
            </div>
            <div className="rounded-md bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Context limit</p>
              <p className="font-medium">{profile?.context_course_limit || 5} courses</p>
            </div>
            <div className="rounded-md bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Planner limit</p>
              <p className="font-medium">{profile?.planner_item_limit || 8} items</p>
            </div>
            <div className="rounded-md bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Recent sessions</p>
              <p className="font-medium">{weeklySessions.length} this week</p>
            </div>
          </div>
        </div>

        <div className="bg-card border rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("study.profileContext")}</h2>
              <HelpTip>The AI and planner use this profile context when they build study plans or summaries.</HelpTip>
            </div>
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link to="/settings#profile">
                <Pencil className="w-3.5 h-3.5" />
                Edit profile
              </Link>
            </Button>
          </div>
          <div className="space-y-2 text-sm">
            <ContextRow label="University" value={profile?.university || "Not set"} />
            <ContextRow label="Major" value={profile?.major || "Not set"} />
            <ContextRow label="Academic year" value={profile?.year || "Not set"} />
            <ContextRow label="Daily goal" value={`${dailyGoal} minutes`} />
            <ContextRow label="AI context" value={`${profile?.context_course_limit || 5} courses, ${profile?.context_topic_limit || 6} topics/course`} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Clock} label={t("dashboard.studyTime")} value={`${Math.floor(totalStudyTime / 60)}h ${totalStudyTime % 60}m`} />
        <StatCard icon={Brain} label="Sessions" value={totalSessions} />
        <StatCard icon={TrendingUp} label={t("dashboard.avgMastery")} value={`${avgMastery}%`} />
        <StatCard icon={Target} label="Strong Topics" value={strongTopics.length} color="text-success" />
        <StatCard icon={AlertTriangle} label="Weak Topics" value={weakTopics.length} color={weakTopics.length > 0 ? "text-destructive" : ""} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card border rounded-lg p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">{t("study.courseProgress")}</h3>
          {courseProgressData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={courseProgressData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="progress" radius={[4, 4, 0, 0]}>
                  {courseProgressData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">{t("study.addCoursePrompt")}</p>
          )}
        </div>

        <div className="bg-card border rounded-lg p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">{t("study.masteryDistribution")}</h3>
          {masteryDist.length > 0 ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={masteryDist} dataKey="value" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {masteryDist.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {masteryDist.map((entry, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-sm">{entry.name}: {entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">{t("study.noTopicsYet")}</p>
          )}
        </div>
      </div>

      <Tabs defaultValue="courses">
        <TabsList>
          <TabsTrigger value="courses">{t("study.byCourse")}</TabsTrigger>
          <TabsTrigger value="sessions">{t("study.recentSessions")}</TabsTrigger>
          <TabsTrigger value="weak">{t("study.weakAreas")}</TabsTrigger>
        </TabsList>

        <TabsContent value="courses" className="space-y-4 mt-4">
          {courses.map(course => {
            const courseTopics = topics.filter(topic => topic.course_id === course.id);
            const courseSessions = sessions.filter(session => session.course_id === course.id);
            const nextTopic = courseTopics.find(topic => topic.status !== "completed" && (topic.mastery_level || 0) < 70) || courseTopics[0];
            const lastSession = courseSessions[0];

            return (
              <div key={course.id} className="bg-card border rounded-lg p-4">
                <div className="flex flex-col gap-3 mb-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: course.color || COLORS[0] }} />
                    <div>
                      <h3 className="font-medium">{course.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {courseTopics.length} topics - {courseSessions.length} sessions
                        {lastSession?.created_date ? ` - last studied ${formatDistanceToNow(new Date(lastSession.created_date), { addSuffix: true })}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{course.overall_progress || 0}%</span>
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/courses/${course.id}`}>Open course</Link>
                    </Button>
                    {nextTopic && (
                      <Button asChild size="sm">
                        <Link to={`/study?course=${course.id}&topic=${nextTopic.id}`}>Continue study</Link>
                      </Button>
                    )}
                  </div>
                </div>
                <ProgressBar value={course.overall_progress || 0} className="h-2 mb-3" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {courseTopics.slice(0, 8).map(topic => (
                    <div key={topic.id} className="flex items-center gap-2 text-xs">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        topic.mastery_level >= 70 ? "bg-success" : topic.mastery_level >= 40 ? "bg-warning" : topic.mastery_level > 0 ? "bg-destructive" : "bg-muted-foreground/30"
                      }`} />
                      <span className="truncate">{topic.title}</span>
                      <span className="text-muted-foreground ml-auto">{topic.mastery_level}%</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="sessions" className="mt-4">
          <div className="bg-card border rounded-lg overflow-hidden">
            {sessions.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No study sessions yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Topic</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Confidence before/after</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">{session.topic_title || "Untitled topic"}</TableCell>
                      <TableCell>{session.course_title || "No course"}</TableCell>
                      <TableCell>{session.duration_minutes || 0}m</TableCell>
                      <TableCell>
                        {session.confidence_before != null || session.confidence_after != null
                          ? `${session.confidence_before ?? "—"} → ${session.confidence_after ?? "—"}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {session.created_date ? (
                          <div className="text-sm">
                            <p>{new Date(session.created_date).toLocaleDateString()}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(session.created_date), { addSuffix: true })}
                            </p>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="weak" className="mt-4">
          {weakTopics.length === 0 ? (
            <div className="bg-card border rounded-lg p-8 text-center">
              <Target className="w-8 h-8 text-success/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No weak areas. Keep going.</p>
            </div>
          ) : (
            <div className="bg-card border rounded-lg divide-y">
              {weakTopics.map(topic => {
                const course = courses.find(item => item.id === topic.course_id);
                return (
                  <div key={topic.id} className="p-3 flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-destructive/60 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{topic.title}</p>
                      <p className="text-xs text-muted-foreground">{course?.title}</p>
                    </div>
                    <ProgressBar value={topic.mastery_level} className="w-24 h-1.5" />
                    <span className="text-xs text-muted-foreground w-8 text-right">{topic.mastery_level}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-3.5 h-3.5 ${color || "text-muted-foreground"}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-xl font-semibold ${color || ""}`}>{value}</p>
    </div>
  );
}

function ContextRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b last:border-b-0 pb-2 last:pb-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

function HelpTip({ children }) {
  return (
    <HoverTooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="More information"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-center leading-relaxed">
        {children}
      </TooltipContent>
    </HoverTooltip>
  );
}
