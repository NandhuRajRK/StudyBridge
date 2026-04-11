import { useState, useEffect } from "react";
import { studybridge } from "@/api/studybridgeClient";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, Clock, ArrowLeft, CheckCircle2, Loader2, MessageSquare, BookOpen, Zap, FileText } from "lucide-react";
import StudySessionSetup from "@/components/study/StudySessionSetup";
import StudySummary from "@/components/study/StudySummary";
import StudyFlashcards from "@/components/study/StudyFlashcards";
import StudyQuiz from "@/components/study/StudyQuiz";
import StudyNotes from "@/components/study/StudyNotes";
import StudyAIChat from "@/components/study/StudyAIChat";
import SessionRecap from "@/components/study/SessionRecap";
import ConfidenceRating from "@/components/study/ConfidenceRating";
import { loadStudyContextBundle } from "@/lib/aiContext";
import AiAccessNotice from "@/components/ai/AiAccessNotice";
import { getDesktopAiNotice, isDesktopAiUnavailable, loadDesktopAiRuntime } from "@/lib/desktopAi";
import { useLocale } from "@/lib/locale";

export default function StudySession() {
  const navigate = useNavigate();
  const { courseId, topicId } = useParams();
  const urlParams = new URLSearchParams(window.location.search);
  const preselectedCourse = courseId || urlParams.get('course');
  const preselectedTopic = topicId || urlParams.get('topic');

  const [phase, setPhase] = useState('setup'); // setup, confidence_before, studying, confidence_after, recap
  const [session, setSession] = useState(null);
  const [course, setCourse] = useState(null);
  const [topic, setTopic] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
  const [remainingMinutesInput, setRemainingMinutesInput] = useState(25);
  const [timerPaused, setTimerPaused] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [generatedContent, setGeneratedContent] = useState({ summary: null, flashcards: [], quiz: [] });
  const [generating, setGenerating] = useState(false);
  const [runtime, setRuntime] = useState(null);
  const { t } = useLocale();

  useEffect(() => {
    loadDesktopAiRuntime().then(setRuntime);
  }, []);

  useEffect(() => {
    let interval;
    if (phase === 'studying' && !timerPaused) {
      interval = setInterval(() => {
        setElapsedSeconds(t => t + 1);
        setRemainingSeconds(t => {
          if (t <= 1) {
            clearInterval(interval);
            setPhase('confidence_after');
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [phase, timerPaused]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const setRemainingMinutes = (minutes) => {
    const safeMinutes = Math.max(1, Math.min(180, parseInt(minutes) || 1));
    setRemainingMinutesInput(safeMinutes);
    setRemainingSeconds(safeMinutes * 60);
  };

  const handleStartSession = async (selectedCourse, selectedTopic, durationMinutes = 25) => {
    setCourse(selectedCourse);
    setTopic(selectedTopic);
    setElapsedSeconds(0);
    setRemainingMinutes(durationMinutes);
    setTimerPaused(false);
    setPhase('confidence_before');
  };

  const handleConfidenceBefore = async (confidence) => {
    const s = await studybridge.entities.StudySession.create({
      course_id: course.id,
      topic_id: topic.id,
      course_title: course.title,
      topic_title: topic.title,
      mode: 'mixed',
      status: 'active',
      started_at: new Date().toISOString(),
      confidence_before: confidence,
      planned_duration_minutes: remainingMinutesInput,
    });
    setSession(s);
    setPhase('studying');
    generateContent();
  };

  const generateContent = async () => {
    setGenerating(true);
    try {
      const contextBundle = await loadStudyContextBundle({ course, topic });
      const result = await studybridge.integrations.Core.InvokeLLM({
        prompt: `You are an expert university tutor inside StudyBridge. Generate study content for the topic "${topic.title}" in the course "${course.title}".

Use this live StudyBridge context as the source of truth:
${contextBundle.context}

Generate:
1. A clear, well-structured summary (use markdown with headers, bullet points)
2. 6 flashcards (question/answer pairs) covering key concepts
3. 5 multiple-choice quiz questions with 4 options each

Return as JSON with this structure:
{
  "summary": "markdown formatted summary...",
  "flashcards": [{"front": "question", "back": "answer"}],
  "quiz": [{"question": "...", "options": ["A", "B", "C", "D"], "correct": "A", "explanation": "..."}]
}`,
        response_json_schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            flashcards: { type: "array", items: { type: "object", properties: { front: { type: "string" }, back: { type: "string" } } } },
            quiz: { type: "array", items: { type: "object", properties: { question: { type: "string" }, options: { type: "array", items: { type: "string" } }, correct: { type: "string" }, explanation: { type: "string" } } } }
          }
        }
      });
      setGeneratedContent({
        summary: result.summary || "No summary returned.",
        flashcards: result.flashcards || [],
        quiz: result.quiz || [],
      });
    } catch (error) {
      console.error("Failed to generate study content", error);
      const isAiUnavailable = error?.code === "AI_UNAVAILABLE" || /AI is disabled/i.test(error?.message || "");
      setGeneratedContent({
        summary: isAiUnavailable
          ? "AI is not configured on this desktop yet. Open Settings to download the local Gemma model or add a cloud API key, then restart the study content generator."
          : `Study content generation failed: ${error.message || "Unknown local model error."}`,
        flashcards: [],
        quiz: [],
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleEndSession = () => {
    setPhase('confidence_after');
  };

  const handleConfidenceAfter = async (confidence) => {
    const duration = Math.max(1, Math.round(elapsedSeconds / 60));
    await studybridge.entities.StudySession.update(session.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      duration_minutes: duration,
      confidence_after: confidence,
    });

    // Update topic mastery
    const newMastery = Math.min(100, (topic.mastery_level || 0) + Math.round(duration * 1.5));
    await studybridge.entities.Topic.update(topic.id, {
      mastery_level: newMastery,
      confidence: confidence,
      status: newMastery >= 80 ? 'mastered' : newMastery > 0 ? 'in_progress' : 'not_started',
      total_study_time: (topic.total_study_time || 0) + duration,
      last_studied: new Date().toISOString(),
    });

    setSession(prev => ({ ...prev, confidence_after: confidence, duration_minutes: duration }));
    setPhase('recap');
  };

  // Setup phase
  if (phase === 'setup') {
    return <StudySessionSetup onStart={handleStartSession} preselectedCourse={preselectedCourse} preselectedTopic={preselectedTopic} />;
  }

  // Confidence before phase
  if (phase === 'confidence_before') {
    return (
      <div className="p-6 lg:p-8 max-w-xl mx-auto flex flex-col items-center justify-center min-h-[60vh]">
        <ConfidenceRating 
          title={`How confident are you with "${topic.title}"?`}
          subtitle="Rate before studying"
          onSubmit={handleConfidenceBefore}
        />
      </div>
    );
  }

  // Confidence after phase
  if (phase === 'confidence_after') {
    return (
      <div className="p-6 lg:p-8 max-w-xl mx-auto flex flex-col items-center justify-center min-h-[60vh]">
        <ConfidenceRating 
          title={`How do you feel about "${topic.title}" now?`}
          subtitle="Rate after studying"
          onSubmit={handleConfidenceAfter}
        />
      </div>
    );
  }

  // Recap phase
  if (phase === 'recap') {
    return (
      <SessionRecap 
        session={session} 
        course={course} 
        topic={topic} 
        timer={elapsedSeconds}
        onDone={() => navigate('/')}
        onStudyMore={() => {
          setPhase('studying');
          setElapsedSeconds(0);
          setRemainingMinutes(remainingMinutesInput || 25);
          setTimerPaused(false);
        }}
      />
    );
  }

  // Studying phase
  const aiUnavailable = isDesktopAiUnavailable(runtime);
  const aiNotice = getDesktopAiNotice(runtime, t);
  return (
    <div className="flex flex-col h-screen">
      {/* Header bar */}
      <div className="h-14 border-b bg-card flex items-center px-4 gap-4 shrink-0">
        <button onClick={() => { if (confirm('End this study session?')) handleEndSession(); }} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: course?.color || '#3B5BDB' }} />
            <span className="text-sm font-medium truncate">{topic?.title}</span>
            <span className="text-xs text-muted-foreground">· {course?.title}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-sm font-mono ${remainingSeconds <= 60 ? "text-destructive" : "text-muted-foreground"}`}>
            <Clock className="w-3.5 h-3.5" />
            {formatTime(remainingSeconds)}
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min="1"
              max="180"
              value={remainingMinutesInput}
              onChange={e => setRemainingMinutes(e.target.value)}
              className="h-8 w-16 text-center"
              aria-label="Remaining minutes"
            />
            <span className="text-xs text-muted-foreground">min left</span>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setTimerPaused(p => !p)}>
            {timerPaused ? 'Resume' : 'Pause'}
          </Button>
          <Button size="sm" variant="outline" onClick={handleEndSession} className="gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> End Session
          </Button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {generating ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Generating study content...</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            {aiUnavailable && (
              <div className="px-4 pt-4">
                <AiAccessNotice
                  title="Study AI is not ready on this desktop"
                  message={aiNotice}
                />
              </div>
            )}
            <div className="border-b px-4">
              <TabsList className="bg-transparent h-auto p-0">
                <TabsTrigger value="summary" className="gap-1.5 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                  <BookOpen className="w-3.5 h-3.5" /> Summary
                </TabsTrigger>
                <TabsTrigger value="flashcards" className="gap-1.5 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                  <Zap className="w-3.5 h-3.5" /> Flashcards
                </TabsTrigger>
                <TabsTrigger value="quiz" className="gap-1.5 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                  <Brain className="w-3.5 h-3.5" /> Quiz
                </TabsTrigger>
                <TabsTrigger value="notes" className="gap-1.5 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                  <FileText className="w-3.5 h-3.5" /> Notes
                </TabsTrigger>
                <TabsTrigger value="ai" className="gap-1.5 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                  <MessageSquare className="w-3.5 h-3.5" /> Ask AI
                </TabsTrigger>
              </TabsList>
            </div>
            <div className="flex-1 overflow-y-auto">
              <TabsContent value="summary" className="m-0 h-full">
                <StudySummary content={generatedContent.summary} topic={topic} course={course} />
              </TabsContent>
              <TabsContent value="flashcards" className="m-0 h-full">
                <StudyFlashcards cards={generatedContent.flashcards} courseId={course?.id} topicId={topic?.id} />
              </TabsContent>
              <TabsContent value="quiz" className="m-0 h-full">
                <StudyQuiz questions={generatedContent.quiz} courseId={course?.id} topicId={topic?.id} />
              </TabsContent>
              <TabsContent value="notes" className="m-0 h-full">
                <StudyNotes courseId={course?.id} topicId={topic?.id} sessionId={session?.id} />
              </TabsContent>
              <TabsContent value="ai" className="m-0 h-full">
                <StudyAIChat course={course} topic={topic} sessionId={session?.id} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </div>
    </div>
  );
}
