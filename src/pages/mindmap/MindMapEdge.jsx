import { EdgeLabelRenderer, getSmoothStepPath } from "@xyflow/react";
import { X } from "lucide-react";

export default function MindMapEdge(props) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    data,
    style,
  } = props;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const label = data?.label || "";
  const onDelete = data?.onDelete;

  return (
    <>
      <path id={id} className="react-flow__edge-path" d={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan flex items-center gap-1 rounded-full border bg-background/95 px-2 py-1 text-xs shadow-sm"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            position: "absolute",
            pointerEvents: "all",
          }}
        >
          {label ? <span className="max-w-[140px] truncate">{label}</span> : null}
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-muted"
            onClick={() => onDelete?.(id)}
            aria-label="Delete connection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

