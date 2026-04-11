import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

const fencedMarkdownPattern = /^```(?:markdown|md|text)?\s*\n([\s\S]*?)\n```$/i;

function normalizeMarkdownContent(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  const fencedMatch = trimmed.match(fencedMarkdownPattern);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }
  return value;
}

const markdownComponents = {
  h1: ({ children }) => <h1 className="mt-6 mb-3 text-2xl font-semibold tracking-tight font-serif text-foreground first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-5 mb-2 text-xl font-semibold tracking-tight font-serif text-foreground first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 mb-2 text-lg font-semibold text-foreground first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-4 mb-2 text-base font-semibold text-foreground first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-0 leading-7 text-foreground/90">{children}</p>,
  ul: ({ children }) => <ul className="my-3 ml-5 list-disc space-y-1 text-foreground/90">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 ml-5 list-decimal space-y-1 text-foreground/90">{children}</ol>,
  li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 rounded-r-lg border-l-4 border-primary/30 bg-primary/5 px-4 py-3 italic text-foreground/85">
      {children}
    </blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-primary underline underline-offset-4 hover:text-primary/80 break-words"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic text-foreground/90">{children}</em>,
  hr: () => <hr className="my-6 border-border" />,
  img: ({ src, alt }) => (
    <img
      src={src}
      alt={alt || ""}
      className="my-4 max-w-full rounded-xl border border-border shadow-sm"
      loading="lazy"
    />
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-border last:border-0">{children}</tr>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-semibold text-foreground">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 align-top text-foreground/90">{children}</td>,
  code: ({ inline, className, children, ...props }) => {
    if (inline) {
      return (
        <code
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.92em] text-foreground"
          {...props}
        >
          {children}
        </code>
      );
    }

    return (
      <code
        className={cn("font-mono text-[0.92em] text-slate-50", className)}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-50 shadow-sm">
      {children}
    </pre>
  ),
};

export default function MarkdownContent({ children, className = "", compact = false }) {
  const content = normalizeMarkdownContent(children);

  return (
    <div
      className={cn(
        "markdown-content break-words",
        compact ? "space-y-2 text-sm leading-6" : "space-y-3 text-[0.96rem] leading-7",
        className,
      )}
    >
      <ReactMarkdown components={markdownComponents} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
}
