import MarkdownContent from "@/components/ui/markdown-content";

function getSourceLabel(sourceCatalog = [], sourceId) {
  return sourceCatalog.find((source) => source.id === sourceId)?.label || sourceId;
}

export default function StudySummary({ content, topic, course, sources = [], sourceIds = [] }) {
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
      {(sourceIds.length > 0 || sources.length > 0) && (
        <div className="mt-6 rounded-2xl border bg-muted/20 p-4">
          <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Source links</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(sourceIds.length > 0 ? sourceIds : sources.map((source) => source.id)).slice(0, 8).map((sourceId) => (
              <span key={sourceId} className="inline-flex items-center rounded-full border bg-background/80 px-3 py-1 text-xs text-muted-foreground">
                {getSourceLabel(sources, sourceId)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
