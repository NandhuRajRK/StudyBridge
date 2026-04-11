import { Link } from "react-router-dom";
import { ArrowRight, BookOpenText, GraduationCap, Link2, PanelLeft, Settings2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OFFICIAL_RUNTIME_DOCS } from "@/lib/providerDocs";

const sections = [
  {
    title: "1. Get started",
    body: "Create a course first, then add a few topics and upload any notes, slides, or reading material. StudyBridge works best when each course has its own context instead of mixing everything together.",
  },
  {
    title: "2. Study flow",
    body: "Use Study Session to generate a summary, flashcards, a quiz, and notes from the same course bundle. Save useful outputs to the Library so you can revisit them later.",
  },
  {
    title: "3. Planner and progress",
    body: "Planner turns learning into concrete next steps. Progress shows how much you have studied, where you are weak, and which course needs attention next.",
  },
  {
    title: "4. AI modes",
    body: "Desktop users can run local Gemma through llama.cpp, bring a Google API key, or install a CLI orchestrator such as Gemini CLI, OpenCode, Claude Code, or Codex CLI on demand.",
  },
  {
    title: "5. Exports",
    body: "StudyBridge can export notes, flashcards, study guides, calendar tasks, and mind maps so you can move data between tools instead of locking it in one place.",
  },
  {
    title: "6. Storage and privacy",
    body: "Desktop uses local SQLite and local files. The web version can still use Supabase, but the desktop path is designed to stay local-first and offline-friendly.",
  },
];

export default function Docs() {
  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
            <BookOpenText className="w-3.5 h-3.5" />
            User documentation
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">How to use StudyBridge</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              This guide is written for students first, with enough detail for teachers, mentors, and demo reviewers to understand the workflow quickly.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link to="/settings">
              <Settings2 className="w-4 h-4" />
              Open Settings
            </Link>
          </Button>
          <Button asChild className="gap-2">
            <Link to="/courses">
              Go to Courses
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title} className="border-border/60">
            <CardContent className="p-5 space-y-2">
              <h2 className="font-semibold text-base">{section.title}</h2>
              <p className="text-sm text-muted-foreground leading-6">{section.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="border-border/60">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-base">What the AI sees</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-6">
              StudyBridge does not send a flat blob of text. It builds a course bundle with course details, topics, materials, notes, sessions, tasks, and the current language and study limits. That is what makes answers feel grounded instead of generic.
            </p>
            <p className="text-sm text-muted-foreground leading-6">
              If you upload a DOCX, PPTX, PDF, or text file, the app extracts the content, chunks it, and sends the most relevant passages into the AI context.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <PanelLeft className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-base">Where to go next</h2>
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">1. Add a course.</p>
              <p className="text-muted-foreground">2. Upload materials or write notes.</p>
              <p className="text-muted-foreground">3. Use AI Tutor or Study Session.</p>
              <p className="text-muted-foreground">4. Review Planner and Progress weekly.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-base">Official runtime docs</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {OFFICIAL_RUNTIME_DOCS.map((doc) => (
            <Card key={doc.href} className="border-border/60">
              <CardContent className="p-5 space-y-3">
                <div className="space-y-1">
                  <h3 className="font-medium">{doc.label}</h3>
                  <p className="text-sm text-muted-foreground leading-6">{doc.note}</p>
                </div>
                <Button asChild variant="outline" size="sm" className="w-fit gap-2">
                  <a href={doc.href} target="_blank" rel="noreferrer">
                    Open docs
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Separator />

      <div className="rounded-xl border bg-muted/20 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-base">Notes for reviewers</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-6">
          StudyBridge is built as a local-first student platform. The desktop version uses SQLite, local files, and optional AI providers. The web version can still be hosted if you need a cloud demo.
        </p>
        <p className="text-sm text-muted-foreground leading-6">
          If you are evaluating it for a hackathon or portfolio review, the most important flow to test is: create a course, upload material, generate study outputs, approve any writes, and inspect progress over time.
        </p>
      </div>
    </div>
  );
}
