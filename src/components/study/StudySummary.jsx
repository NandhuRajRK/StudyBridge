import MarkdownContent from "@/components/ui/markdown-content";

export default function StudySummary({ content, topic, course }) {
  if (!content) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>Generating summary...</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold font-serif">{topic?.title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{course?.title}</p>
      </div>
      <MarkdownContent>{content}</MarkdownContent>
    </div>
  );
}
