import { Handle, Position } from "@xyflow/react";
import { Pencil } from "lucide-react";

export default function MindMapNode({ id, data, selected }) {
  const color = data?.color || "#1098AD";
  const title = data?.title || "Untitled";
  const note = data?.note || "";
  const onEdit = data?.onEdit;

  return (
    <div className={`relative rounded-xl border bg-card px-3 py-2 shadow-sm ${selected ? "ring-2 ring-primary" : ""}`}>
      <Handle type="target" position={Position.Left} id="in" className="!h-2.5 !w-2.5 !border-2 !border-background" />
      <Handle type="source" position={Position.Right} id="out" className="!h-2.5 !w-2.5 !border-2 !border-background" />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium leading-tight">{title}</p>
              {note ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{note}</p> : null}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="nodrag nopan inline-flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors hover:bg-muted"
          onClick={(event) => {
            event.stopPropagation();
            onEdit?.(id);
          }}
          aria-label={`Edit ${title}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

