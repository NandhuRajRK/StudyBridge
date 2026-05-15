import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import MarkdownContent from "@/components/ui/markdown-content";
import RichTextEditor from "@/components/ui/rich-text-editor";
import {
  looksLikeHtml,
  normalizeRichTextInput,
  sanitizeHtml,
} from "@/lib/richText";

function getSourceLabel(sourceCatalog = [], sourceId) {
  return (
    sourceCatalog.find((source) => source.id === sourceId)?.label || sourceId
  );
}

export default function StudySummary({
  content,
  topic,
  course,
  sources = [],
  sourceIds = [],
  onContentChange,
  forceEditToken = 0,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(normalizeRichTextInput(content || ""));

  useEffect(() => {
    if (!forceEditToken) return;
    setDraft(normalizeRichTextInput(content || ""));
    setEditing(true);
  }, [forceEditToken, content]);

  if (!content) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>Generating summary...</p>
      </div>
    );
  }

  return (
    <div className="h-full p-4 lg:p-6">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold font-serif">
                {topic?.title}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {course?.title}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (editing) {
                  const next = normalizeRichTextInput(draft.trim());
                  if (next) onContentChange?.(next);
                } else {
                  setDraft(normalizeRichTextInput(content || ""));
                }
                setEditing((value) => !value);
              }}
            >
              {editing ? "Save summary" : "Edit summary"}
            </Button>
          </div>
        </div>
        {editing ? (
          <RichTextEditor
            value={draft}
            onChange={setDraft}
            placeholder="Write your summary..."
          />
        ) : looksLikeHtml(content) ? (
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
          />
        ) : (
          <MarkdownContent>{content}</MarkdownContent>
        )}
        {(sourceIds.length > 0 || sources.length > 0) && (
          <div className="mt-6 rounded-2xl border bg-muted/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
              Source links
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(sourceIds.length > 0
                ? sourceIds
                : sources.map((source) => source.id)
              )
                .slice(0, 8)
                .map((sourceId) => (
                  <span
                    key={sourceId}
                    className="inline-flex items-center rounded-full border bg-background/80 px-3 py-1 text-xs text-muted-foreground"
                  >
                    {getSourceLabel(sources, sourceId)}
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
