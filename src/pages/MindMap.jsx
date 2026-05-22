import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { studybridge } from "@/api/studybridgeClient";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { isDesktopAiUnavailable, loadDesktopAiRuntime } from "@/lib/desktopAi";
import { loadStudyContextBundle } from "@/lib/aiContext";
import { Download, GitBranch, HelpCircle, Loader2, Move, Pencil, Plus, RefreshCw, Save, Sparkles, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { downloadMindMapMarkdown, downloadOpml } from "@/lib/exporters";
import { Background, Controls, MiniMap, Panel, ReactFlow, ViewportPortal, MarkerType, ConnectionMode } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import MindMapNode from "@/pages/mindmap/MindMapNode";
import MindMapEdge from "@/pages/mindmap/MindMapEdge";
import { layoutWithElk } from "@/pages/mindmap/elkLayout";

const ROOT_NODE_COLOR = "#3B5BDB";
const DEFAULT_NODE_COLOR = "#1098AD";

function makeId() {
  return window.crypto?.randomUUID?.() || `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeNodes(nodes = [], rootTitle = "Mind map") {
  const sourceNodes = Array.isArray(nodes) ? nodes.filter((node) => node && node.title) : [];
  if (sourceNodes.length === 0) {
    return [{
      id: makeId(),
      parentId: null,
      title: rootTitle,
      note: "Start here and branch out into the core ideas.",
      color: ROOT_NODE_COLOR,
    }];
  }

  const root = sourceNodes.find((node) => !node.parentId) || sourceNodes[0];
  const rootId = root.id || makeId();
  const seen = new Map();

  const ensureNode = (node, isRoot = false) => {
    const id = node.id || makeId();
    const next = {
      id,
      parentId: isRoot ? null : (node.parentId || rootId),
      title: String(node.title || "").trim(),
      note: String(node.note || "").trim(),
      color: node.color || (isRoot ? ROOT_NODE_COLOR : DEFAULT_NODE_COLOR),
      x: Number.isFinite(node.x) ? node.x : undefined,
      y: Number.isFinite(node.y) ? node.y : undefined,
    };
    seen.set(id, next);
    return next;
  };

  const rootNode = ensureNode({ ...root, id: rootId, parentId: null, color: root.color || ROOT_NODE_COLOR }, true);
  sourceNodes
    .filter((node) => (node.id || node.title) !== rootId)
    .forEach((node) => ensureNode(node));

  return [rootNode, ...Array.from(seen.values()).filter((node) => node.id !== rootNode.id)];
}

function buildSeedMap(course, topics) {
  const rootId = makeId();
  const root = {
    id: rootId,
    parentId: null,
    title: course?.title || "Mind map",
    note: course?.code ? `Course code: ${course.code}` : "Course overview",
    color: ROOT_NODE_COLOR,
    x: 0,
    y: 0,
  };
  const children = (topics || []).slice(0, 12).map((topic, index) => ({
    id: makeId(),
    parentId: rootId,
    title: topic.title,
    note: topic.description || `Mastery: ${topic.mastery_level || 0}%`,
    color: topic.mastery_level >= 70 ? "#37B24D" : topic.mastery_level > 0 ? "#F59F00" : DEFAULT_NODE_COLOR,
    x: Math.cos((index / Math.max(1, Math.min(12, topics.length))) * Math.PI * 2) * 260,
    y: Math.sin((index / Math.max(1, Math.min(12, topics.length))) * Math.PI * 2) * 220,
  }));

  return [root, ...children];
}

function collectDescendants(nodes, nodeId) {
  const childrenByParent = new Map();
  nodes.forEach((node) => {
    const parentKey = node.parentId || null;
    if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
    childrenByParent.get(parentKey).push(node);
  });

  const toDelete = new Set([nodeId]);
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift();
    const children = childrenByParent.get(current) || [];
    children.forEach((child) => {
      if (!toDelete.has(child.id)) {
        toDelete.add(child.id);
        queue.push(child.id);
      }
    });
  }

  return toDelete;
}

function ensureNodePositions(nodes) {
  const root = nodes.find((node) => !node.parentId) || nodes[0];
  if (!root) return [];

  const childrenByParent = new Map();
  nodes.forEach((node) => {
    const parentKey = node.parentId || null;
    if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
    childrenByParent.get(parentKey).push(node);
  });

  const depthById = new Map([[root.id, 0]]);
  const queue = [root.id];
  while (queue.length > 0) {
    const current = queue.shift();
    const depth = depthById.get(current) || 0;
    const children = childrenByParent.get(current) || [];
    children.forEach((child) => {
      if (!depthById.has(child.id)) {
        depthById.set(child.id, depth + 1);
        queue.push(child.id);
      }
    });
  }

  const grouped = new Map();
  nodes.forEach((node) => {
    const depth = depthById.get(node.id) || 0;
    if (!grouped.has(depth)) grouped.set(depth, []);
    grouped.get(depth).push(node);
  });

  return nodes.map((node) => {
    if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
      return node;
    }

    const depth = depthById.get(node.id) || 0;
    if (depth === 0) {
      return { ...node, x: 0, y: 0 };
    }

    const siblings = grouped.get(depth) || [];
    const index = Math.max(0, siblings.findIndex((item) => item.id === node.id));
    const radiusX = 260 + (depth - 1) * 220;
    const radiusY = 220 + (depth - 1) * 180;
    const angle = (index / Math.max(1, siblings.length)) * Math.PI * 2 - Math.PI / 2 + depth * 0.16;

    return {
      ...node,
      x: Math.cos(angle) * radiusX,
      y: Math.sin(angle) * radiusY,
    };
  });
}

function iconButton(tooltip, icon, onClick, disabled = false) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" size="icon" variant="outline" onClick={onClick} disabled={disabled} aria-label={tooltip}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function buildsCycle(nodes, parentId, childId) {
  if (!parentId || !childId || parentId === childId) return true;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let cursor = parentId;
  while (cursor) {
    if (cursor === childId) return true;
    const next = byId.get(cursor);
    cursor = next?.parentId || null;
  }
  return false;
}

export default function MindMap({ forcedCourseId = "" }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [record, setRecord] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [newChildTitle, setNewChildTitle] = useState("");
  const [newChildNote, setNewChildNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [building, setBuilding] = useState(false);
  const [runtime, setRuntime] = useState(null);
  const [rfInstance, setRfInstance] = useState(null);
  const [editingNodeId, setEditingNodeId] = useState("");
  const [layouting, setLayouting] = useState(false);
  const [layoutDirection, setLayoutDirection] = useState("RIGHT");
  const [focusRootId, setFocusRootId] = useState("");
  const connectStartRef = useRef({ nodeId: "", handleId: "" });

  useEffect(() => {
    loadDesktopAiRuntime().then(setRuntime);
  }, []);

  useEffect(() => {
    const loadCourses = async () => {
      const activeCourses = await studybridge.entities.Course.filter({ status: "active" }, "-created_date", 50);
      setCourses(activeCourses);
      if (forcedCourseId && activeCourses.some((course) => course.id === forcedCourseId)) {
        setSelectedCourseId(forcedCourseId);
        return;
      }
      const courseFromQuery = searchParams.get("course");
      if (courseFromQuery && activeCourses.some((course) => course.id === courseFromQuery)) {
        setSelectedCourseId(courseFromQuery);
        return;
      }
      if (!selectedCourseId && activeCourses.length > 0) {
        setSelectedCourseId(activeCourses[0].id);
      }
    };

    loadCourses().catch((error) => console.error("Failed to load courses for mindmap", error));
  }, [searchParams, selectedCourseId, forcedCourseId]);

  useEffect(() => {
    const loadMindMap = async () => {
      if (!selectedCourseId) return;
      const [courseTopics, guides] = await Promise.all([
        studybridge.entities.Topic.filter({ course_id: selectedCourseId }, "order", 100),
        studybridge.entities.StudyGuide.filter({ course_id: selectedCourseId, source: "mindmap" }, "-updated_date", 20),
      ]);

      setTopics(courseTopics);
      const course = courses.find((item) => item.id === selectedCourseId);
      const existing = guides[0] || null;
      const existingSections = Array.isArray(existing?.sections) ? existing.sections : [];
      const nextNodes = existingSections.length > 0
        ? normalizeNodes(existingSections, course?.title || "Mind map")
        : buildSeedMap(course, courseTopics);

      const positioned = ensureNodePositions(nextNodes);
      setRecord(existing);
      setNodes(positioned);
      setSelectedNodeId(positioned[0]?.id || "");
      setEditingNodeId("");
      setNewChildTitle("");
      setNewChildNote("");
    };

    loadMindMap().catch((error) => console.error("Failed to load mind map", error));
  }, [selectedCourseId, courses]);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
  const editingNode = nodes.find((node) => node.id === editingNodeId) || null;
  const aiUnavailable = isDesktopAiUnavailable(runtime);
  const colorMode = typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light";

  const openNodeEditor = useCallback((nodeId) => {
    setSelectedNodeId(nodeId);
    setEditingNodeId(nodeId);
  }, []);

  const visibleNodeIds = useMemo(() => {
    if (!focusRootId) return new Set(nodes.map((node) => node.id));
    const focused = nodes.find((node) => node.id === focusRootId);
    if (!focused) return new Set(nodes.map((node) => node.id));
    return collectDescendants(nodes, focusRootId);
  }, [nodes, focusRootId]);

  const flowNodes = useMemo(() => {
    const filtered = nodes.filter((node) => visibleNodeIds.has(node.id));
    return filtered.map((node) => ({
      id: node.id,
      type: "mindmapNode",
      position: { x: Number(node.x || 0), y: Number(node.y || 0) },
      selectable: true,
      draggable: true,
      data: {
        title: node.title,
        note: node.note,
        color: node.color || DEFAULT_NODE_COLOR,
        onEdit: openNodeEditor,
      },
    }));
  }, [nodes, openNodeEditor, visibleNodeIds]);

  const flowEdges = useMemo(
    () => nodes
      .filter((node) => node.parentId && visibleNodeIds.has(node.id) && visibleNodeIds.has(node.parentId))
      .map((node) => {
        const edgeId = `e-${node.parentId}-${node.id}`;
        return {
          id: edgeId,
          source: node.parentId,
          target: node.id,
          type: "mindmapEdge",
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: "hsl(var(--border))", strokeWidth: 1.6 },
          data: {
            label: "",
            onDelete: () => {
              setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, parentId: null } : item)));
            },
          },
        };
      }),
    [nodes, visibleNodeIds],
  );

  const onFlowNodesChange = useCallback((changes) => {
    const selected = changes.find((change) => change.type === "select" && change.selected);
    if (selected?.id) {
      setSelectedNodeId(selected.id);
    }
  }, []);

  const onNodeDragStop = useCallback((_, node) => {
    setNodes((prev) => prev.map((item) => (
      item.id === node.id
        ? { ...item, x: Number(node.position?.x || 0), y: Number(node.position?.y || 0) }
        : item
    )));
  }, []);

  const onConnect = useCallback((params) => {
    const sourceId = params?.source;
    const targetId = params?.target;
    if (!sourceId || !targetId) return;
    if (buildsCycle(nodes, sourceId, targetId)) return;
    setNodes((prev) => prev.map((node) => (node.id === targetId ? { ...node, parentId: sourceId } : node)));
  }, [nodes]);

  const onConnectStart = useCallback((_, { nodeId, handleId }) => {
    connectStartRef.current = { nodeId: nodeId || "", handleId: handleId || "" };
  }, []);

  const onConnectEnd = useCallback((event) => {
    const { nodeId } = connectStartRef.current;
    if (!nodeId) return;
    const targetIsPane = event?.target?.classList?.contains("react-flow__pane");
    if (!targetIsPane) return;

    const parentNode = nodes.find((node) => node.id === nodeId);
    if (!parentNode) return;
    const nextNode = {
      id: makeId(),
      parentId: parentNode.id,
      title: "New branch",
      note: "",
      color: DEFAULT_NODE_COLOR,
      x: Number(parentNode.x || 0) + 240,
      y: Number(parentNode.y || 0) + ((Math.random() - 0.5) * 120),
    };
    setNodes((prev) => [...prev, nextNode]);
    setSelectedNodeId(nextNode.id);
    setEditingNodeId(nextNode.id);
  }, [nodes]);

  const addChildNode = () => {
    const parentNode = editingNode || selectedNode;
    if (!parentNode?.id || !newChildTitle.trim()) return;
    const nextNode = {
      id: makeId(),
      parentId: parentNode.id,
      title: newChildTitle.trim(),
      note: newChildNote.trim(),
      color: DEFAULT_NODE_COLOR,
      x: Number(parentNode.x || 0) + 240,
      y: Number(parentNode.y || 0) + ((Math.random() - 0.5) * 120),
    };
    setNodes((prev) => [...prev, nextNode]);
    setSelectedNodeId(nextNode.id);
    setEditingNodeId(nextNode.id);
    setNewChildTitle("");
    setNewChildNote("");
  };

  const updateSelectedNode = (patch) => {
    if (!editingNode) return;
    setNodes((prev) => prev.map((node) => (node.id === editingNode.id ? { ...node, ...patch } : node)));
  };

  const deleteEditingNode = () => {
    if (!editingNode || editingNode.parentId === null) return;
    const toDelete = collectDescendants(nodes, editingNode.id);
    setNodes((prev) => prev.filter((node) => !toDelete.has(node.id)));
    const fallback = nodes.find((node) => node.id === editingNode.parentId) || nodes[0];
    setSelectedNodeId(fallback?.id || "");
    setEditingNodeId("");
  };

  const resetFromTopics = () => {
    const seeded = ensureNodePositions(buildSeedMap(selectedCourse, topics));
    setNodes(seeded);
    setSelectedNodeId(seeded[0]?.id || "");
    setEditingNodeId("");
    setFocusRootId("");
    requestAnimationFrame(() => {
      rfInstance?.fitView({ padding: 0.2, duration: 350 });
    });
  };

  const applyAutoLayout = async () => {
    if (!rfInstance || nodes.length === 0) return;
    setLayouting(true);
    try {
      const laidOut = await layoutWithElk({ nodes: flowNodes, edges: flowEdges, direction: layoutDirection });
      const byId = new Map(laidOut.map((node) => [node.id, node.position]));
      setNodes((prev) => prev.map((node) => {
        const position = byId.get(node.id);
        return position ? { ...node, x: position.x, y: position.y } : node;
      }));
      requestAnimationFrame(() => rfInstance.fitView({ padding: 0.2, duration: 350 }));
    } catch (error) {
      console.error("Failed to auto-layout mind map", error);
      window.alert(error.message || "Failed to auto-layout mind map");
    } finally {
      setLayouting(false);
    }
  };

  const exportMindMapMarkdown = () => {
    if (!selectedCourse || nodes.length === 0) return;
    downloadMindMapMarkdown(`${selectedCourse.title || "mind-map"}.md`, selectedCourse.title || "Mind map", nodes);
  };

  const exportMindMapOpml = () => {
    if (!selectedCourse || nodes.length === 0) return;
    downloadOpml(`${selectedCourse.title || "mind-map"}.opml`, selectedCourse.title || "Mind map", nodes);
  };

  const saveMindMap = async () => {
    if (!selectedCourseId || nodes.length === 0) return;
    setSaving(true);
    try {
      const payload = {
        course_id: selectedCourseId,
        title: `${selectedCourse?.title || "Course"} mind map`,
        difficulty: "custom",
        key_concepts: nodes.filter((node) => node.parentId === nodes[0]?.id).map((node) => node.title).slice(0, 12),
        sections: nodes.map(({ x, y, ...rest }) => ({
          ...rest,
          x: Number.isFinite(x) ? x : null,
          y: Number.isFinite(y) ? y : null,
        })),
        source: "mindmap",
      };

      const saved = record?.id
        ? await studybridge.entities.StudyGuide.update(record.id, payload)
        : await studybridge.entities.StudyGuide.create(payload);
      setRecord(saved);
    } finally {
      setSaving(false);
    }
  };

  const expandWithAI = async () => {
    if (!selectedNode || aiUnavailable) return;
    setBuilding(true);
    try {
      const contextBundle = await loadStudyContextBundle({ course: selectedCourse });
      const result = await studybridge.integrations.Core.InvokeLLM({
        prompt: `You are helping a student expand a study mind map for "${selectedCourse?.title || "this course"}".

Current focus node: ${selectedNode.title}
Current note: ${selectedNode.note || "none"}
Existing children: ${nodes.filter((node) => node.parentId === selectedNode.id).map((node) => node.title).join(", ") || "none"}
Existing map nodes: ${nodes.map((node) => `${node.title}${node.parentId ? ` -> parent ${nodes.find((candidate) => candidate.id === node.parentId)?.title || "unknown"}` : " -> root"}`).join("; ")}

Use this course context:
${contextBundle.context}

Generate 4 to 6 concise child nodes that are directly useful for studying this focus node.
Rules:
- Do not repeat existing child nodes or duplicate sibling ideas.
- Prefer branches that reveal relationships: prerequisite, core concept, example/application, common mistake, practice route, or review checkpoint.
- Make each title short enough for a node label.
- Make each note actionable: explain what the student should remember, compare, practice, or check.
- Use course context when available; do not invent unsupported syllabus details.
- Use colors consistently: prerequisites #7950F2, concepts #1098AD, examples #37B24D, mistakes #E8590C, practice/review #F59F00.
- If the focus node is too broad, create structured sub-branches rather than a generic list.
Return JSON with:
{
  "nodes": [
    { "title": "string", "note": "string", "color": "string" }
  ]
}`,
        response_json_schema: {
          type: "object",
          properties: {
            nodes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  note: { type: "string" },
                  color: { type: "string" },
                },
              },
            },
          },
        },
      });

      const aiNodes = Array.isArray(result?.nodes) ? result.nodes : [];
      if (aiNodes.length > 0) {
        const next = aiNodes
          .filter((node) => node?.title)
          .map((node, index) => ({
            id: makeId(),
            parentId: selectedNode.id,
            title: node.title,
            note: node.note || "",
            color: node.color || "#F59F00",
            x: Number(selectedNode.x || 0) + 240 + ((index % 2) * 70),
            y: Number(selectedNode.y || 0) + ((index - Math.floor(aiNodes.length / 2)) * 95),
          }));
        setNodes((prev) => [...prev, ...next]);
      }
    } catch (error) {
      console.error("Failed to expand mind map", error);
      window.alert(error.message || "Failed to expand mind map");
    } finally {
      setBuilding(false);
    }
  };

  const fitView = () => rfInstance?.fitView({ padding: 0.2, duration: 300 });
  const zoomIn = () => rfInstance?.zoomIn({ duration: 180 });
  const zoomOut = () => rfInstance?.zoomOut({ duration: 180 });

  if (courses.length === 0) {
    return (
      <div className="h-full overflow-hidden bg-background">
        <div className="flex h-full min-h-0 w-full flex-col justify-center p-6 lg:p-8">
          <h1 className="text-2xl font-semibold mb-2">{t("nav.mindMap")}</h1>
          <p className="text-sm text-muted-foreground">Add a course first, then you can build a visual mind map around its topics.</p>
        </div>
      </div>
    );
  }

  if (!selectedCourseId || !selectedCourse) {
    return (
      <div className="h-full overflow-hidden bg-background">
        <div className="flex h-full min-h-0 w-full flex-col justify-center p-6 lg:p-8">
          <h1 className="text-2xl font-semibold mb-2">{t("nav.mindMap")}</h1>
          <p className="text-sm text-muted-foreground">Select a course to open its mind map.</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={120}>
      <div className="h-full overflow-hidden bg-background">
        <div className="flex h-full min-h-0 w-full flex-col gap-4 p-6 lg:p-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{t("nav.mindMap")}</h1>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="How to use mind map"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm leading-relaxed">
                  Drag nodes to rearrange. Click a node to select it, then click the pencil icon on that node to open editing.
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {iconButton("Zoom out", <ZoomOut className="h-4 w-4" />, zoomOut)}
              {iconButton("Zoom in", <ZoomIn className="h-4 w-4" />, zoomIn)}
              {iconButton("Fit map", <Move className="h-4 w-4" />, fitView)}
              {iconButton("Rebuild from topics", <RefreshCw className="h-4 w-4" />, resetFromTopics)}
              {iconButton("Export markdown", <Download className="h-4 w-4" />, exportMindMapMarkdown, nodes.length === 0)}
              {iconButton("Export OPML", <GitBranch className="h-4 w-4" />, exportMindMapOpml, nodes.length === 0)}
              {iconButton(
                building ? "Expanding..." : "Expand with AI",
                building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />,
                expandWithAI,
                building || aiUnavailable || !selectedNode,
              )}
              {iconButton(
                saving ? "Saving..." : "Save map",
                saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />,
                saveMindMap,
                saving || nodes.length === 0,
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                <SelectTrigger className="w-full sm:w-80">
                  <SelectValue placeholder="Select a course" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => navigate(`/courses/${selectedCourseId}`)}
                    aria-label="Open course"
                  >
                    <Move className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open course</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card h-[72vh]">
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              onNodesChange={onFlowNodesChange}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              onNodeDragStop={onNodeDragStop}
              onConnect={onConnect}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              onPaneClick={() => {
                setSelectedNodeId("");
                setEditingNodeId("");
              }}
              onInit={setRfInstance}
              fitView
              minZoom={0.2}
              maxZoom={2.4}
              nodesConnectable
              connectionMode={ConnectionMode.Loose}
              elementsSelectable
              deleteKeyCode={null}
              className="bg-gradient-to-b from-background to-muted/20"
              nodeTypes={{ mindmapNode: MindMapNode }}
              edgeTypes={{ mindmapEdge: MindMapEdge }}
              colorMode={colorMode}
            >
              <Background gap={24} size={1.2} color="hsl(var(--border))" />
              <Controls position="bottom-right" />
              <MiniMap
                pannable
                zoomable
                className="!bg-background !border !border-border"
                nodeColor={(node) => node?.data?.color || DEFAULT_NODE_COLOR}
              />
              <Panel position="top-right" className="flex items-center gap-2 rounded-xl border bg-background/90 px-2 py-2 shadow-sm backdrop-blur">
                <Button type="button" size="sm" variant="outline" onClick={applyAutoLayout} disabled={layouting || flowNodes.length === 0}>
                  {layouting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Auto-layout
                </Button>
                <Select value={layoutDirection} onValueChange={setLayoutDirection}>
                  <SelectTrigger className="h-9 w-[150px]">
                    <SelectValue placeholder="Direction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RIGHT">Left → Right</SelectItem>
                    <SelectItem value="LEFT">Right → Left</SelectItem>
                    <SelectItem value="DOWN">Top → Bottom</SelectItem>
                    <SelectItem value="UP">Bottom → Top</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setFocusRootId((prev) => (prev ? "" : selectedNodeId))}
                  disabled={!selectedNodeId}
                >
                  {focusRootId ? "Exit focus" : "Focus sub-flow"}
                </Button>
              </Panel>

              {editingNode && (
                <ViewportPortal>
                  <div
                    className="absolute z-30 w-[320px] rounded-xl border bg-card p-3 shadow-xl"
                    style={{ transform: `translate(${Number(editingNode.x || 0) + 170}px, ${Number(editingNode.y || 0) - 40}px)` }}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Selected node</p>
                      <div className="flex items-center gap-1">
                        {editingNode.parentId !== null ? (
                          <Button type="button" variant="destructive" size="icon" onClick={deleteEditingNode} aria-label="Delete branch">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button type="button" variant="outline" size="icon" onClick={() => setEditingNodeId("")} aria-label="Close editor">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Input
                        value={editingNode.title}
                        onChange={(event) => updateSelectedNode({ title: event.target.value })}
                        placeholder="Node title"
                      />
                      <Textarea
                        value={editingNode.note || ""}
                        onChange={(event) => updateSelectedNode({ note: event.target.value })}
                        placeholder="Node note"
                        rows={3}
                      />
                      <Input
                        value={newChildTitle}
                        onChange={(event) => setNewChildTitle(event.target.value)}
                        placeholder="Child branch title"
                      />
                      <Textarea
                        value={newChildNote}
                        onChange={(event) => setNewChildNote(event.target.value)}
                        placeholder="Child branch note (optional)"
                        rows={2}
                      />
                      <Button type="button" variant="outline" className="w-full gap-2" onClick={addChildNode}>
                        <Plus className="h-4 w-4" /> Add child branch
                      </Button>
                    </div>
                  </div>
                </ViewportPortal>
              )}
            </ReactFlow>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
