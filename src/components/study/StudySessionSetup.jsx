import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Brain } from "lucide-react";

export default function StudySessionSetup({ onStart, preselectedCourse, preselectedTopic }) {
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(preselectedCourse || '');
  const [selectedTopicId, setSelectedTopicId] = useState(preselectedTopic || '');
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Course.filter({ status: "active" }, "-created_date", 50).then(c => {
      setCourses(c);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (selectedCourseId) {
      base44.entities.Topic.filter({ course_id: selectedCourseId }, "order", 100).then(setTopics);
    } else {
      setTopics([]);
    }
  }, [selectedCourseId]);

  // Auto-start if preselected
  useEffect(() => {
    if (preselectedCourse && preselectedTopic && courses.length > 0) {
      const course = courses.find(c => c.id === preselectedCourse);
      if (course && topics.length > 0) {
        const topic = topics.find(t => t.id === preselectedTopic);
        if (topic) {
          onStart(course, topic, durationMinutes);
        }
      }
    }
  }, [courses, topics, preselectedCourse, preselectedTopic]);

  const handleStart = () => {
    const course = courses.find(c => c.id === selectedCourseId);
    const topic = topics.find(t => t.id === selectedTopicId);
    if (course && topic) onStart(course, topic, durationMinutes);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-lg mx-auto flex flex-col items-center justify-center min-h-[70vh]">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Brain className="w-8 h-8 text-primary" />
      </div>
      <h1 className="text-2xl font-semibold mb-2 text-center">Start a Study Session</h1>
      <p className="text-muted-foreground text-sm mb-8 text-center max-w-sm">
        Choose a course and topic to begin. We'll generate summaries, flashcards, and quizzes tailored to your material.
      </p>

      <div className="w-full space-y-4">
        <div>
          <label className="text-sm font-medium mb-1.5 block">Course</label>
          <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a course..." />
            </SelectTrigger>
            <SelectContent>
              {courses.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.title}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedCourseId && (
          <div>
            <label className="text-sm font-medium mb-1.5 block">Topic</label>
            {topics.length === 0 ? (
              <p className="text-sm text-muted-foreground bg-muted rounded-md p-3">
                No topics in this course yet. Add topics from the course page first.
              </p>
            ) : (
              <Select value={selectedTopicId} onValueChange={setSelectedTopicId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a topic..." />
                </SelectTrigger>
                <SelectContent>
                  {topics.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        <div>
          <label className="text-sm font-medium mb-1.5 block">Focus timer</label>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {[25, 45, 60].map(minutes => (
              <Button
                key={minutes}
                type="button"
                variant={durationMinutes === minutes ? "default" : "outline"}
                onClick={() => setDurationMinutes(minutes)}
              >
                {minutes}m
              </Button>
            ))}
            <Input
              type="number"
              min="1"
              max="180"
              value={durationMinutes}
              onChange={e => setDurationMinutes(Math.max(1, parseInt(e.target.value) || 1))}
              className="text-center"
            />
          </div>
          <p className="text-xs text-muted-foreground">Countdown timer. You can edit remaining minutes during the session.</p>
        </div>

        <Button 
          className="w-full mt-4 gap-2" 
          size="lg" 
          disabled={!selectedCourseId || !selectedTopicId}
          onClick={handleStart}
        >
          <Brain className="w-4 h-4" /> Begin Session
        </Button>
      </div>
    </div>
  );
}
