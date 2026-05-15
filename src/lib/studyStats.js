import { subDays } from "date-fns";

const toArray = (value) => (Array.isArray(value) ? value : []);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function sumSessionMinutes(sessions = []) {
  return toArray(sessions).reduce((sum, session) => sum + toNumber(session?.duration_minutes), 0);
}

export function getAverageMastery(topics = []) {
  const scoredTopics = toArray(topics).filter((topic) => topic && topic.mastery_level !== undefined && topic.mastery_level !== null);
  if (scoredTopics.length === 0) return 0;
  return Math.round(scoredTopics.reduce((sum, topic) => sum + toNumber(topic.mastery_level), 0) / scoredTopics.length);
}

export function getWeakTopics(topics = [], threshold = 40) {
  return toArray(topics).filter((topic) => toNumber(topic?.mastery_level) > 0 && toNumber(topic?.mastery_level) < threshold);
}

export function getStrongTopics(topics = [], threshold = 70) {
  return toArray(topics).filter((topic) => toNumber(topic?.mastery_level) >= threshold);
}

export function getOverdueTasks(tasks = [], now = new Date()) {
  return toArray(tasks).filter((task) => task?.due_date && new Date(task.due_date) < now && task.status !== "completed");
}

export function getCourseProgressData(courses = []) {
  return toArray(courses).map((course) => ({
    name: course.code || course.title?.substring(0, 8) || "Course",
    progress: toNumber(course.overall_progress),
    color: course.color || "#3B5BDB",
  }));
}

export function getMasteryDistribution(topics = []) {
  const list = toArray(topics);
  return [
    { name: "Not Started", value: list.filter((topic) => toNumber(topic?.mastery_level) === 0).length, color: "#94A3B8" },
    { name: "Weak (<40%)", value: list.filter((topic) => toNumber(topic?.mastery_level) > 0 && toNumber(topic?.mastery_level) < 40).length, color: "#EF4444" },
    { name: "Learning (40-69%)", value: list.filter((topic) => toNumber(topic?.mastery_level) >= 40 && toNumber(topic?.mastery_level) < 70).length, color: "#F59F00" },
    { name: "Strong (>=70%)", value: list.filter((topic) => toNumber(topic?.mastery_level) >= 70).length, color: "#37B24D" },
  ].filter((entry) => entry.value > 0);
}

export function getWeeklyStudyStats(sessions = [], dailyGoalMinutes = 60) {
  const now = new Date();
  const weekStart = subDays(now, 6);
  const weeklySessions = toArray(sessions).filter((session) => session?.created_date && new Date(session.created_date) >= weekStart);
  const weeklyStudyTime = sumSessionMinutes(weeklySessions);
  const weeklyGoal = Math.max(0, toNumber(dailyGoalMinutes)) * 7;
  const weeklyGoalPct = weeklyGoal > 0 ? Math.min(100, Math.round((weeklyStudyTime / weeklyGoal) * 100)) : 0;
  const goalMinutesLeft = Math.max(0, weeklyGoal - weeklyStudyTime);
  const paceLabel = weeklyStudyTime >= weeklyGoal
    ? "On track for the week"
    : `${goalMinutesLeft}m left to hit your weekly goal`;

  return {
    weeklySessions,
    weeklyStudyTime,
    weeklyGoal,
    weeklyGoalPct,
    goalMinutesLeft,
    paceLabel,
  };
}
