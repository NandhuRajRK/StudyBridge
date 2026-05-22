import ELK from "elkjs/lib/elk.bundled.js";

const DEFAULT_ELK_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.layered.spacing.nodeNodeBetweenLayers": "140",
  "elk.spacing.nodeNode": "80",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.edgeRouting": "ORTHOGONAL",
};

function toElkNode(flowNode) {
  const width = Number(flowNode?.measured?.width || flowNode?.width || 220);
  const height = Number(flowNode?.measured?.height || flowNode?.height || 80);
  return {
    id: flowNode.id,
    width,
    height,
  };
}

export async function layoutWithElk({ nodes, edges, direction = "RIGHT" }) {
  const elk = new ELK();
  const graph = {
    id: "root",
    layoutOptions: { ...DEFAULT_ELK_OPTIONS, "elk.direction": direction },
    children: nodes.map(toElkNode),
    edges: edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  };

  const result = await elk.layout(graph);
  const positions = new Map((result.children || []).map((child) => [child.id, { x: child.x || 0, y: child.y || 0 }]));

  return nodes.map((node) => {
    const position = positions.get(node.id);
    return position ? { ...node, position } : node;
  });
}

