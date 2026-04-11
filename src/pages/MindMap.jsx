import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AiAccessNotice from "@/components/ai/AiAccessNotice";
import { getDesktopAiNotice, isDesktopAiUnavailable, loadDesktopAiRuntime } from "@/lib/desktopAi";
import { loadStudyContextBundle } from "@/lib/aiContext";
import { Loader2, Save, Sparkles, Plus, Trash2, GitBranch, RefreshCw, Download } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { downloadMindMapMarkdown, downloadOpml } from "@/lib/exporters";

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
  };
  const children = (topics || []).slice(0, 12).map((topic) => ({
    id: makeId(),
    parentId: rootId,
    title: topic.title,
    note: topic.description || `Mastery: ${topic.mastery_level || 0}%`,
    color: topic.mastery_level >= 70 ? "#37B24D" : topic.mastery_level > 0 ? "#F59F00" : DEFAULT_NODE_COLOR,
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

function computeLayout(nodes) {
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

  const centerX = 500;
  const centerY = 360;
  const layout = nodes.map((node) => {
    const depth = depthById.get(node.id) || 0;
    const siblings = grouped.get(depth) || [];
    const index = Math.max(0, siblings.findIndex((item) => item.id === node.id));
    if (depth === 0) {
      return { ...node, depth, x: centerX, y: centerY };
    }

    const radius = 170 + (depth - 1) * 175;
    const angle = (index / Math.max(1, siblings.length)) * Math.PI * 2 - Math.PI / 2 + depth * 0.18;
    return {
      ...node,
      depth,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });

  const positionedById = new Map(layout.map((node) => [node.id, node]));
  const edges = layout
    .filter((node) => node.parentId && positionedById.has(node.parentId))
    .map((node) => ({
      from: positionedById.get(node.parentId),
      to: node,
    }));

  return { layout, edges };
}

export default function MindMap() {
  const { t } = useLocale();
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

  useEffect(() => {
    loadDesktopAiRuntime().then(setRuntime);
  }, []);

  useEffect(() => {
    const loadCourses = async () => {
      const activeCourses = await base44.entities.Course.filter({ status: "active" }, "-created_date", 50);
      setCourses(activeCourses);
      if (!selectedCourseId && activeCourses.length > 0) {
        setSelectedCourseId(activeCourses[0].id);
      }
    };

    loadCourses().catch((error) => console.error("Failed to load courses for mindmap", error));
  }, []);

  useEffect(() => {
    const loadMindMap = async () => {
      if (!selectedCourseId) return;
      const [courseTopics, guides] = await Promise.all([
        base44.entities.Topic.filter({ course_id: selectedCourseId }, "order", 100),
        base44.entities.StudyGuide.filter({ course_id: selectedCourseId, source: "mindmap" }, "-updated_date", 20),
      ]);

      setTopics(courseTopics);
      const course = courses.find((item) => item.id === selectedCourseId);
      const existing = guides[0] || null;
      const existingSections = Array.isArray(existing?.sections) ? existing.sections : [];
      const nextNodes = existingSections.length > 0
        ? normalizeNodes(existingSections, course?.title || "Mind map")
        : buildSeedMap(course, courseTopics);

      setRecord(existing);
      setNodes(nextNodes);
      setSelectedNodeId(nextNodes[0]?.id || "");
      setNewChildTitle("");
      setNewChildNote("");
    };

    loadMindMap().catch((error) => console.error("Failed to load mind map", error));
  }, [selectedCourseId, courses]);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || nodes[0] || null;
  const aiUnavailable = isDesktopAiUnavailable(runtime);
  const aiNotice = getDesktopAiNotice(runtime, t);
  const { layout, edges } = useMemo(() => computeLayout(nodes), [nodes]);

  const addChildNode = (parentId = selectedNode?.id) => {
    if (!parentId || !newChildTitle.trim()) return;
    const nextNode = {
      id: makeId(),
      parentId,
      title: newChildTitle.trim(),
      note: newChildNote.trim(),
      color: DEFAULT_NODE_COLOR,
    };
    setNodes((prev) => [...prev, nextNode]);
    setSelectedNodeId(nextNode.id);
    setNewChildTitle("");
    setNewChildNote("");
  };

  const updateSelectedNode = (patch) => {
    if (!selectedNode) return;
    setNodes((prev) => prev.map((node) => node.id === selectedNode.id ? { ...node, ...patch } : node));
  };

  const deleteSelectedNode = () => {
    if (!selectedNode || selectedNode.parentId === null) return;
    const toDelete = collectDescendants(nodes, selectedNode.id);
    setNodes((prev) => prev.filter((node) => !toDelete.has(node.id)));
    const fallback = nodes.find((node) => node.id === selectedNode.parentId) || nodes[0];
    setSelectedNodeId(fallback?.id || "");
  };

  const resetFromTopics = () => {
    const course = selectedCourse;
    const seeded = buildSeedMap(course, topics);
    setNodes(seeded);
    setSelectedNodeId(seeded[0]?.id || "");
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
        sections: nodes,
        source: "mindmap",
      };

      const saved = record?.id
        ? await base44.entities.StudyGuide.update(record.id, payload)
        : await base44.entities.StudyGuide.create(payload);
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
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are helping a student expand a study mind map for "${selectedCourse?.title || "this course"}".

Current focus node: ${selectedNode.title}
Current note: ${selectedNode.note || "none"}
Existing children: ${nodes.filter((node) => node.parentId === selectedNode.id).map((node) => node.title).join(", ") || "none"}

Use this course context:
${contextBundle.context}

Generate 4 to 6 concise child nodes that are directly useful for studying.
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
        setNodes((prev) => [
          ...prev,
          ...aiNodes
            .filter((node) => node?.title)
            .map((node) => ({
              id: makeId(),
              parentId: selectedNode.id,
              title: node.title,
              note: node.note || "",
              color: node.color || "#F59F00",
            })),
        ]);
      }
    } catch (error) {
      console.error("Failed to expand mind map", error);
      window.alert(error.message || "Failed to expand mind map");
    } finally {
      setBuilding(false);
    }
  };

  if (courses.length === 0) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">{t("nav.mindMap")}</h1>
        <p className="text-sm text-muted-foreground">Add a course first, then you can build a visual mind map around its topics.</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("nav.mindMap")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build a visual map from your course topics, notes, and AI-generated branches.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={resetFromTopics} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Rebuild from topics
          </Button>
          <Button variant="outline" onClick={exportMindMapMarkdown} disabled={nodes.length === 0} className="gap-2">
            <Download className="w-4 h-4" /> Export MD
          </Button>
          <Button variant="outline" onClick={exportMindMapOpml} disabled={nodes.length === 0} className="gap-2">
            <Download className="w-4 h-4" /> Export OPML
          </Button>
          <Button variant="outline" onClick={expandWithAI} disabled={building || aiUnavailable || !selectedNode} className="gap-2">
            {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {building ? "Expanding..." : "Expand with AI"}
          </Button>
          <Button onClick={saveMindMap} disabled={saving || nodes.length === 0} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving..." : "Save map"}
          </Button>
        </div>
      </div>

      {aiUnavailable && (
        <AiAccessNotice title="Mindmap AI is not ready on this desktop" message={aiNotice} />
      )}

      <div className="grid gap-6 xl:grid-cols-[1.7fr_.9fr]">
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Course</p>
              <p className="text-xs text-muted-foreground">Choose a course and shape the map around its structure.</p>
            </div>
            <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="Select a course" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((course) => (
                  <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <div className="relative min-h-[720px] overflow-hidden rounded-lg bg-gradient-to-b from-background to-muted/20">
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 720" preserveAspectRatio="none">
                {edges.map((edge) => (
                  <line
                    key={`${edge.from.id}-${edge.to.id}`}
                    x1={edge.from.x}
                    y1={edge.from.y}
                    x2={edge.to.x}
                    y2={edge.to.y}
                    stroke="hsl(var(--border))"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                ))}
              </svg>

              {layout.map((node) => {
                const active = node.id === selectedNodeId;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-xl border px-4 py-3 text-left shadow-sm transition-all ${
                      active ? "border-primary bg-primary text-primary-foreground shadow-md scale-[1.03]" : "bg-card hover:border-primary/60 hover:shadow-md"
                    }`}
                    style={{
                      left: `${(node.x / 1000) * 100}%`,
                      top: `${(node.y / 720) * 100}%`,
                      maxWidth: node.depth === 0 ? 260 : 210,
                      minWidth: node.depth === 0 ? 220 : 170,
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className="mt-1 h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: active ? "white" : node.color || DEFAULT_NODE_COLOR }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight">{node.title}</p>
                        {node.note && (
                          <p className={`mt-1 text-xs leading-5 ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                            {node.note}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">Selected node</h2>
            </div>
            {selectedNode ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Title</label>
                  <Input value={selectedNode.title} onChange={(e) => updateSelectedNode({ title: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Note</label>
                  <Textarea value={selectedNode.note || ""} onChange={(e) => updateSelectedNode({ note: e.target.value })} rows={5} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Add child branch</label>
                  <Input value={newChildTitle} onChange={(e) => setNewChildTitle(e.target.value)} placeholder="Child topic title" />
                  <Textarea value={newChildNote} onChange={(e) => setNewChildNote(e.target.value)} placeholder="Optional note" rows={3} />
                  <Button type="button" variant="outline" onClick={() => addChildNode()} className="gap-2 w-full">
                    <Plus className="w-4 h-4" /> Add child
                  </Button>
                </div>
                {selectedNode.parentId !== null && (
                  <Button type="button" variant="destructive" onClick={deleteSelectedNode} className="gap-2 w-full">
                    <Trash2 className="w-4 h-4" /> Delete branch
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a node to edit it.</p>
            )}
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h3 className="font-semibold">How to use it</h3>
            <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
              <li>Start from the root course node.</li>
              <li>Add child branches manually to reflect your own understanding.</li>
              <li>Use AI expansion to generate study subtopics from the selected node.</li>
              <li>Save the map to keep it in your StudyBridge library.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
