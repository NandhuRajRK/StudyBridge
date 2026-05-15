import { useCallback, useEffect, useMemo, useState } from "react";
import { studybridge } from "@/api/studybridgeClient";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { isDesktopAiUnavailable, loadDesktopAiRuntime } from "@/lib/desktopAi";
import { loadStudyContextBundle } from "@/lib/aiContext";
import { Download, Expand, GitBranch, HelpCircle, Loader2, Minimize2, Move, Plus, RefreshCw, Save, Sparkles, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { downloadMindMapMarkdown, downloadOpml } from "@/lib/exporters";
import { Background, ReactFlow, ViewportPortal, MarkerType, applyNodeChanges } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

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

function toFlowNode(node, selectedNodeId) {
  const isRoot = node.parentId === null;
  const active = node.id === selectedNodeId;
  return {
    id: node.id,
    position: { x: Number(node.x || 0), y: Number(node.y || 0) },
    selectable: true,
    draggable: true,
    data: {
      label: (
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <span
              className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: active ? "white" : (node.color || DEFAULT_NODE_COLOR) }}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium leading-tight">{node.title}</p>
              {node.note ? (
                <p className={`mt-1 line-clamp-2 text-xs leading-5 ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                  {node.note}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ),
    },
    style: {
      width: isRoot ? 260 : 220,
      borderRadius: 14,
      border: active ? "1px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
      background: active ? "hsl(var(--primary))" : "hsl(var(--card))",
      color: active ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))",
      boxShadow: active ? "0 10px 24px rgba(37, 99, 235, 0.22)" : "0 8px 18px rgba(15, 23, 42, 0.08)",
      padding: 0,
    },
  };
}

export default function MindMap() {
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
  const [canvasExpanded, setCanvasExpanded] = useState(false);
  const [rfInstance, setRfInstance] = useState(null);

  useEffect(() => {
    loadDesktopAiRuntime().then(setRuntime);
  }, []);

  useEffect(() => {
    const loadCourses = async () => {
      const activeCourses = await studybridge.entities.Course.filter({ status: "active" }, "-created_date", 50);
      setCourses(activeCourses);
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
  }, [searchParams, selectedCourseId]);

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
      setNewChildTitle("");
      setNewChildNote("");
    };

    loadMindMap().catch((error) => console.error("Failed to load mind map", error));
  }, [selectedCourseId, courses]);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
  const aiUnavailable = isDesktopAiUnavailable(runtime);

  const flowNodes = useMemo(
    () => nodes.map((node) => toFlowNode(node, selectedNodeId)),
    [nodes, selectedNodeId],
  );

  const flowEdges = useMemo(
    () => nodes
      .filter((node) => node.parentId)
      .map((node) => ({
        id: `e-${node.parentId}-${node.id}`,
        source: node.parentId,
        target: node.id,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "hsl(var(--border))", strokeWidth: 1.6 },
      })),
    [nodes],
  );

  const onFlowNodesChange = useCallback((changes) => {
    setNodes((prev) => {
      const base = prev.map((node) => ({
        id: node.id,
        position: { x: Number(node.x || 0), y: Number(node.y || 0) },
        data: {},
      }));
      const changed = applyNodeChanges(changes, base);
      const byId = new Map(prev.map((node) => [node.id, node]));
      return changed
        .map((flowNode) => {
          const current = byId.get(flowNode.id);
          if (!current) return null;
          return {
            ...current,
            x: Number(flowNode.position?.x || 0),
            y: Number(flowNode.position?.y || 0),
          };
        })
        .filter(Boolean);
    });

    const selected = changes.find((change) => change.type === "select" && change.selected);
    if (selected?.id) {
      setSelectedNodeId(selected.id);
    }
  }, []);

  const addChildNode = () => {
    if (!selectedNode?.id || !newChildTitle.trim()) return;
    const nextNode = {
      id: makeId(),
      parentId: selectedNode.id,
      title: newChildTitle.trim(),
      note: newChildNote.trim(),
      color: DEFAULT_NODE_COLOR,
      x: Number(selectedNode.x || 0) + 240,
      y: Number(selectedNode.y || 0) + ((Math.random() - 0.5) * 120),
    };
    setNodes((prev) => [...prev, nextNode]);
    setSelectedNodeId(nextNode.id);
    setNewChildTitle("");
    setNewChildNote("");
  };

  const updateSelectedNode = (patch) => {
    if (!selectedNode) return;
    setNodes((prev) => prev.map((node) => (node.id === selectedNode.id ? { ...node, ...patch } : node)));
  };

  const deleteSelectedNode = () => {
    if (!selectedNode || selectedNode.parentId === null) return;
    const toDelete = collectDescendants(nodes, selectedNode.id);
    setNodes((prev) => prev.filter((node) => !toDelete.has(node.id)));
    const fallback = nodes.find((node) => node.id === selectedNode.parentId) || nodes[0];
    setSelectedNodeId(fallback?.id || "");
  };

  const resetFromTopics = () => {
    const seeded = ensureNodePositions(buildSeedMap(selectedCourse, topics));
    setNodes(seeded);
    setSelectedNodeId(seeded[0]?.id || "");
    requestAnimationFrame(() => {
      rfInstance?.fitView({ padding: 0.2, duration: 350 });
    });
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
                  Drag nodes to rearrange. Click a node to edit it in-place. Double click empty canvas to create a child branch.
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
              {iconButton(
                canvasExpanded ? "Collapse canvas" : "Expand canvas",
                canvasExpanded ? <Minimize2 className="h-4 w-4" /> : <Expand className="h-4 w-4" />,
                () => setCanvasExpanded((value) => !value),
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

          <div className={`min-h-0 flex-1 overflow-hidden rounded-xl border bg-card ${canvasExpanded ? "h-[calc(100vh-220px)]" : "h-[72vh]"}`}>
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              onNodesChange={onFlowNodesChange}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              onPaneClick={() => setSelectedNodeId("")}
              onInit={setRfInstance}
              fitView
              minZoom={0.2}
              maxZoom={2.4}
              nodesConnectable={false}
              elementsSelectable
              deleteKeyCode={null}
              className="bg-gradient-to-b from-background to-muted/20"
            >
              <Background gap={24} size={1.2} color="hsl(var(--border))" />

              {selectedNode && (
                <ViewportPortal>
                  <div
                    className="absolute z-30 w-[320px] rounded-xl border bg-card p-3 shadow-xl"
                    style={{ transform: `translate(${Number(selectedNode.x || 0) + 170}px, ${Number(selectedNode.y || 0) - 40}px)` }}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Selected node</p>
                      {selectedNode.parentId !== null ? (
                        <Button type="button" variant="destructive" size="icon" onClick={deleteSelectedNode} aria-label="Delete branch">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Input
                        value={selectedNode.title}
                        onChange={(event) => updateSelectedNode({ title: event.target.value })}
                        placeholder="Node title"
                      />
                      <Textarea
                        value={selectedNode.note || ""}
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
