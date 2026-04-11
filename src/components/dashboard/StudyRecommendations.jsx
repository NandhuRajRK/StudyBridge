import { Link } from "react-router-dom";
import { Lightbulb, ArrowRight } from "lucide-react";

export default function StudyRecommendations({ courses, topics }) {
  // Generate recommendations based on weak topics and upcoming exams
  const recommendations = [];

  // Find weak topics (low mastery, has been studied before)
  const weakTopics = topics
    .filter(t => t.mastery_level < 50 && t.status !== 'not_started')
    .sort((a, b) => a.mastery_level - b.mastery_level)
    .slice(0, 3);

  weakTopics.forEach(topic => {
    const course = courses.find(c => c.id === topic.course_id);
    recommendations.push({
      id: `weak-${topic.id}`,
      type: 'weak_topic',
      title: `Review: ${topic.title}`,
      detail: course?.title || '',
      reason: `Mastery at ${topic.mastery_level}%`,
      link: `/study?course=${topic.course_id}&topic=${topic.id}`
    });
  });

  // Find courses with not-started topics  
  const notStartedTopics = topics
    .filter(t => t.status === 'not_started')
    .slice(0, 2);

  notStartedTopics.forEach(topic => {
    const course = courses.find(c => c.id === topic.course_id);
    recommendations.push({
      id: `new-${topic.id}`,
      type: 'new_topic',
      title: `Start: ${topic.title}`,
      detail: course?.title || '',
      reason: 'Not yet studied',
      link: `/study?course=${topic.course_id}&topic=${topic.id}`
    });
  });

  return (
    <section className="bg-card border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recommended</h2>
      </div>

      {recommendations.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Add courses and study materials to get AI-powered recommendations.
        </p>
      ) : (
        <div className="space-y-2">
          {recommendations.slice(0, 5).map(rec => (
            <Link
              key={rec.id}
              to={rec.link}
              className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{rec.title}</p>
                <p className="text-xs text-muted-foreground">{rec.reason}</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}