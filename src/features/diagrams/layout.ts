/**
 * Motor de layout determinístico dos diagramas.
 *
 * Não usa dependências externas (Dagre/ELK/d3) para manter o bundle leve e o
 * resultado previsível: as mesmas entradas sempre produzem as mesmas
 * coordenadas. O layout é compartilhado pela prévia, pelo SVG, pelo PDF e pelo
 * PPTX, garantindo que o diagrama exportado corresponda ao editado.
 */

import type {
  DiagramDocument,
  DiagramLayout,
  DiagramLayoutMode,
  DiagramNode,
  DiagramNodeShape,
  LaidOutEdge,
  LaidOutNode,
} from "./types";

const FONT_SIZE = 14;
const DESCRIPTION_FONT_SIZE = 11.5;
const LINE_HEIGHT = 18;
const DESCRIPTION_LINE_HEIGHT = 15;
const NODE_PADDING_X = 16;
const NODE_PADDING_Y = 12;
const MIN_NODE_WIDTH = 136;
const MAX_NODE_WIDTH = 272;
const MIN_NODE_HEIGHT = 52;
const H_GAP = 44;
const V_GAP = 70;
const DIAGRAM_PADDING = 28;
const CHAR_WIDTH_RATIO = 0.56;
const LABEL_GAP = 4;

export function measureDiagramText(value: string, fontSize: number): number {
  return value.length * fontSize * CHAR_WIDTH_RATIO;
}

/** Quebra um texto em linhas que caibam na largura disponível. */
export function wrapDiagramText(value: string, maxWidth: number, fontSize: number): string[] {
  const limit = Math.max(fontSize * 2, maxWidth);
  const maxCharacters = Math.max(2, Math.floor(limit / (fontSize * CHAR_WIDTH_RATIO)));
  const words = value.split(/\s+/).filter(Boolean).flatMap((word) => {
    if (word.length <= maxCharacters) return [word];
    // Palavras muito longas são divididas para nunca vazar do nó.
    const chunks: string[] = [];
    for (let index = 0; index < word.length; index += maxCharacters) {
      chunks.push(word.slice(index, index + maxCharacters));
    }
    return chunks;
  });
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || measureDiagramText(candidate, fontSize) <= limit) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.slice(0, 10);
}

type NodeMetrics = {
  id: string;
  node: DiagramNode;
  width: number;
  height: number;
  lines: string[];
  descriptionLines: string[];
};

function measureNode(node: DiagramNode): NodeMetrics {
  const preferred = Math.min(
    MAX_NODE_WIDTH,
    Math.max(MIN_NODE_WIDTH, measureDiagramText(node.label, FONT_SIZE) + NODE_PADDING_X * 2),
  );
  const firstPass = wrapDiagramText(node.label, preferred - NODE_PADDING_X * 2, FONT_SIZE);
  const widest = Math.max(
    MIN_NODE_WIDTH - NODE_PADDING_X * 2,
    ...firstPass.map((line) => measureDiagramText(line, FONT_SIZE)),
  );
  const width = Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, widest + NODE_PADDING_X * 2));
  const lines = wrapDiagramText(node.label, width - NODE_PADDING_X * 2, FONT_SIZE);
  const descriptionLines = node.description
    ? wrapDiagramText(node.description, width - NODE_PADDING_X * 2, DESCRIPTION_FONT_SIZE)
    : [];
  const textHeight = lines.length * LINE_HEIGHT;
  const descriptionHeight = descriptionLines.length
    ? descriptionLines.length * DESCRIPTION_LINE_HEIGHT + LABEL_GAP
    : 0;
  const baseHeight = NODE_PADDING_Y * 2 + textHeight + descriptionHeight;
  const shape = node.shape ?? "box";
  const shapeWidth = shape === "diamond" ? Math.round(width * 1.28) : width;
  const shapeHeight = shape === "diamond"
    ? Math.round(Math.max(MIN_NODE_HEIGHT, baseHeight) * 1.35)
    : Math.max(MIN_NODE_HEIGHT, baseHeight);
  return { id: node.id, node, width: shapeWidth, height: shapeHeight, lines, descriptionLines };
}

/** Níveis hierárquicos seguros contra ciclos (BFS a partir das raízes). */
function assignLevels(nodes: DiagramNode[], edges: DiagramDocument["edges"]): Map<string, number> {
  const adjacency = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  nodes.forEach((node) => {
    adjacency.set(node.id, []);
    incoming.set(node.id, 0);
  });
  edges.forEach((edge) => {
    adjacency.get(edge.from)?.push(edge.to);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  });

  const levels = new Map<string, number>();
  const queue: string[] = [];
  nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0).forEach((node) => {
    levels.set(node.id, 0);
    queue.push(node.id);
  });
  if (!queue.length && nodes.length) {
    levels.set(nodes[0].id, 0);
    queue.push(nodes[0].id);
  }

  const drain = (startLevel: number) => {
    let guard = 0;
    while (queue.length && guard < nodes.length * 8) {
      guard += 1;
      const id = queue.shift() as string;
      const base = Math.max(startLevel, levels.get(id) ?? startLevel);
      for (const target of adjacency.get(id) ?? []) {
        if (!levels.has(target)) {
          levels.set(target, base + 1);
          queue.push(target);
        }
      }
    }
  };
  drain(0);

  let maxLevel = 0;
  levels.forEach((value) => { if (value > maxLevel) maxLevel = value; });
  nodes.forEach((node) => {
    if (!levels.has(node.id)) {
      maxLevel += 1;
      levels.set(node.id, maxLevel);
      queue.push(node.id);
      drain(maxLevel);
    }
  });
  return levels;
}

function groupByLevel(nodes: DiagramNode[], levels: Map<string, number>): DiagramNode[][] {
  const index = new Map(nodes.map((node, position) => [node.id, position]));
  const layers = new Map<number, DiagramNode[]>();
  nodes.forEach((node) => {
    const level = levels.get(node.id) ?? 0;
    const bucket = layers.get(level) ?? [];
    bucket.push(node);
    layers.set(level, bucket);
  });
  return [...layers.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, bucket]) => bucket.sort((left, right) => (index.get(left.id) ?? 0) - (index.get(right.id) ?? 0)));
}

function placeHierarchical(
  metrics: Map<string, NodeMetrics>,
  layers: DiagramNode[][],
  direction: "TB" | "LR",
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (!layers.length) return positions;

  if (direction === "LR") {
    const columnWidths = layers.map((layer) => Math.max(...layer.map((node) => metrics.get(node.id)?.width ?? MIN_NODE_WIDTH)));
    const columnHeights = layers.map((layer) =>
      layer.reduce((total, node) => total + (metrics.get(node.id)?.height ?? MIN_NODE_HEIGHT), 0)
      + H_GAP * Math.max(0, layer.length - 1),
    );
    const maxHeight = Math.max(...columnHeights);
    let x = DIAGRAM_PADDING;
    layers.forEach((layer, layerIndex) => {
      let y = DIAGRAM_PADDING + (maxHeight - columnHeights[layerIndex]) / 2;
      layer.forEach((node) => {
        const metric = metrics.get(node.id);
        const width = metric?.width ?? MIN_NODE_WIDTH;
        const height = metric?.height ?? MIN_NODE_HEIGHT;
        positions.set(node.id, { x: x + (columnWidths[layerIndex] - width) / 2, y });
        y += height + H_GAP;
      });
      x += columnWidths[layerIndex] + V_GAP;
    });
    return positions;
  }

  const rowHeights = layers.map((layer) => Math.max(...layer.map((node) => metrics.get(node.id)?.height ?? MIN_NODE_HEIGHT)));
  const rowWidths = layers.map((layer) =>
    layer.reduce((total, node) => total + (metrics.get(node.id)?.width ?? MIN_NODE_WIDTH), 0)
    + H_GAP * Math.max(0, layer.length - 1),
  );
  const maxWidth = Math.max(...rowWidths);
  let y = DIAGRAM_PADDING;
  layers.forEach((layer, layerIndex) => {
    let x = DIAGRAM_PADDING + (maxWidth - rowWidths[layerIndex]) / 2;
    layer.forEach((node) => {
      const metric = metrics.get(node.id);
      const width = metric?.width ?? MIN_NODE_WIDTH;
      const height = metric?.height ?? MIN_NODE_HEIGHT;
      positions.set(node.id, { x, y: y + (rowHeights[layerIndex] - height) / 2 });
      x += width + H_GAP;
    });
    y += rowHeights[layerIndex] + V_GAP;
  });
  return positions;
}

function undirectedLevels(nodes: DiagramNode[], edges: DiagramDocument["edges"]): { levels: Map<string, number>; rootId?: string } {
  const levels = new Map<string, number>();
  if (!nodes.length) return { levels };
  const adjacency = new Map<string, string[]>();
  nodes.forEach((node) => adjacency.set(node.id, []));
  edges.forEach((edge) => {
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  });
  const root = nodes[0];
  levels.set(root.id, 0);
  const queue = [root.id];
  let guard = 0;
  while (queue.length && guard < nodes.length * 8) {
    guard += 1;
    const id = queue.shift() as string;
    const base = levels.get(id) ?? 0;
    for (const target of adjacency.get(id) ?? []) {
      if (!levels.has(target)) {
        levels.set(target, base + 1);
        queue.push(target);
      }
    }
  }
  nodes.forEach((node) => { if (!levels.has(node.id)) levels.set(node.id, 1); });
  return { levels, rootId: root.id };
}

function placeRadial(
  metrics: Map<string, NodeMetrics>,
  nodes: DiagramNode[],
  edges: DiagramDocument["edges"],
  centerId?: string,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const { levels, rootId } = undirectedLevels(nodes, edges);
  const root = nodes.find((node) => node.id === (centerId ?? rootId)) ?? nodes[0];
  const byLevel = new Map<number, DiagramNode[]>();
  nodes.forEach((node) => {
    if (node.id === root.id) return;
    const level = levels.get(node.id) ?? 1;
    const bucket = byLevel.get(level) ?? [];
    bucket.push(node);
    byLevel.set(level, bucket);
  });

  positions.set(root.id, { x: 0, y: 0 });
  let ring = 0;
  const rootWidth = metrics.get(root.id)?.width ?? MIN_NODE_WIDTH;
  let previousRadius = Math.max(rootWidth / 2, 70);
  for (const [level, bucket] of [...byLevel.entries()].sort((left, right) => left[0] - right[0])) {
    const totalWidth = bucket.reduce((total, node) => total + (metrics.get(node.id)?.width ?? MIN_NODE_WIDTH), 0);
    const minimum = bucket.length > 1 ? (totalWidth / (2 * Math.PI)) * 1.5 : 0;
    const radius = Math.max(previousRadius + 130 + ring * 12, minimum);
    bucket.forEach((node, index) => {
      const angle = (index / bucket.length) * Math.PI * 2 - Math.PI / 2 + (level % 2 ? Math.PI / Math.max(4, bucket.length) : 0);
      positions.set(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
    previousRadius = radius;
    ring += 1;
  }

  // Converte centro em canto superior esquerdo.
  const result = new Map<string, { x: number; y: number }>();
  positions.forEach((center, id) => {
    const metric = metrics.get(id);
    const width = metric?.width ?? MIN_NODE_WIDTH;
    const height = metric?.height ?? MIN_NODE_HEIGHT;
    result.set(id, { x: center.x - width / 2, y: center.y - height / 2 });
  });
  return result;
}

function placeCycle(metrics: Map<string, NodeMetrics>, nodes: DiagramNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const totalWidth = nodes.reduce((total, node) => total + (metrics.get(node.id)?.width ?? MIN_NODE_WIDTH), 0);
  const radius = Math.max(170, (totalWidth / (2 * Math.PI)) * 1.45);
  nodes.forEach((node, index) => {
    const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
    const metric = metrics.get(node.id);
    const width = metric?.width ?? MIN_NODE_WIDTH;
    const height = metric?.height ?? MIN_NODE_HEIGHT;
    positions.set(node.id, {
      x: Math.cos(angle) * radius - width / 2,
      y: Math.sin(angle) * radius - height / 2,
    });
  });
  return positions;
}

function placeTimeline(metrics: Map<string, NodeMetrics>, nodes: DiagramNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  let x = DIAGRAM_PADDING;
  nodes.forEach((node, index) => {
    const metric = metrics.get(node.id);
    const width = metric?.width ?? MIN_NODE_WIDTH;
    const height = metric?.height ?? MIN_NODE_HEIGHT;
    const offset = index % 2 === 0 ? 0 : 46;
    positions.set(node.id, { x, y: DIAGRAM_PADDING + offset + (72 - height) / 2 });
    x += width + H_GAP * 1.4;
  });
  return positions;
}

function placeComparison(metrics: Map<string, NodeMetrics>, nodes: DiagramNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const half = Math.ceil(nodes.length / 2);
  const groups = new Map<string, DiagramNode[]>();
  nodes.forEach((node, index) => {
    const key = node.group ?? (index < half ? "a" : "b");
    const bucket = groups.get(key) ?? [];
    bucket.push(node);
    groups.set(key, bucket);
  });
  const keys = [...groups.keys()].sort();
  const columnWidth = Math.max(
    MIN_NODE_WIDTH,
    ...nodes.map((node) => metrics.get(node.id)?.width ?? MIN_NODE_WIDTH),
  );
  keys.forEach((key, columnIndex) => {
    let y = DIAGRAM_PADDING;
    (groups.get(key) ?? []).forEach((node) => {
      const metric = metrics.get(node.id);
      const width = metric?.width ?? MIN_NODE_WIDTH;
      const height = metric?.height ?? MIN_NODE_HEIGHT;
      positions.set(node.id, {
        x: DIAGRAM_PADDING + columnIndex * (columnWidth + V_GAP * 2) + (columnWidth - width) / 2,
        y,
      });
      y += height + V_GAP * 0.7;
    });
  });
  return positions;
}

function anchorPoint(metric: LaidOutNode, towards: { x: number; y: number }): { x: number; y: number } {
  const centerX = metric.x + metric.width / 2;
  const centerY = metric.y + metric.height / 2;
  const deltaX = towards.x - centerX;
  const deltaY = towards.y - centerY;
  if (!deltaX && !deltaY) return { x: centerX, y: centerY };
  const scaleX = deltaX !== 0 ? metric.width / 2 / Math.abs(deltaX) : Number.POSITIVE_INFINITY;
  const scaleY = deltaY !== 0 ? metric.height / 2 / Math.abs(deltaY) : Number.POSITIVE_INFINITY;
  const scale = Math.min(scaleX, scaleY);
  return { x: centerX + deltaX * scale, y: centerY + deltaY * scale };
}

function layoutMode(diagram: DiagramDocument): DiagramLayoutMode {
  if (diagram.type === "mindmap" || diagram.type === "concept-map") return "curve";
  if (diagram.type === "cycle") return "curve";
  if (diagram.type === "timeline" || diagram.type === "comparison") return "straight";
  return "orthogonal";
}

function buildEdges(
  diagram: DiagramDocument,
  laidOutNodes: Map<string, LaidOutNode>,
): LaidOutEdge[] {
  const mode = layoutMode(diagram);
  const vertical = diagram.direction !== "LR";
  return diagram.edges.flatMap((edge) => {
    const source = laidOutNodes.get(edge.from);
    const target = laidOutNodes.get(edge.to);
    if (!source || !target) return [];
    const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    const start = anchorPoint(source, targetCenter);
    const end = anchorPoint(target, sourceCenter);

    let points: Array<{ x: number; y: number }>;
    if (mode === "curve") {
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      const deltaX = end.x - start.x;
      const deltaY = end.y - start.y;
      const length = Math.hypot(deltaX, deltaY) || 1;
      const bend = Math.min(70, length * 0.18);
      points = [
        start,
        { x: midX - (deltaY / length) * bend, y: midY + (deltaX / length) * bend },
        end,
      ];
    } else if (mode === "orthogonal") {
      if (vertical) {
        if (Math.abs(end.y - start.y) < 24) {
          const detour = 26;
          points = [start, { x: start.x, y: start.y - detour }, { x: end.x, y: start.y - detour }, end];
        } else {
          const midY = (start.y + end.y) / 2;
          points = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
        }
      } else if (Math.abs(end.x - start.x) < 24) {
        const detour = 26;
        points = [start, { x: start.x - detour, y: start.y }, { x: start.x - detour, y: end.y }, end];
      } else {
        const midX = (start.x + end.x) / 2;
        points = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
      }
    } else {
      points = [start, end];
    }

    return [{
      id: edge.id,
      from: edge.from,
      to: edge.to,
      label: edge.label,
      dashed: edge.style === "dashed",
      arrow: edge.arrow !== false,
      mode,
      points,
    }];
  });
}

/** Ponto médio do traçado, usado para posicionar o rótulo da conexão. */
export function edgeLabelPoint(edge: LaidOutEdge): { x: number; y: number } {
  const points = edge.points;
  if (points.length <= 2) {
    const [start, end = start] = points;
    return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  }
  if (edge.mode === "curve" && points.length === 3) {
    // Ponto médio aproximado de uma curva quadrática.
    const [start, control, end] = points;
    return {
      x: (start.x + 2 * control.x + end.x) / 4,
      y: (start.y + 2 * control.y + end.y) / 4,
    };
  }
  const middle = Math.floor(points.length / 2);
  const before = points[middle - 1];
  const after = points[middle];
  return { x: (before.x + after.x) / 2, y: (before.y + after.y) / 2 };
}

/** Calcula o layout completo de um diagrama. */
export function layoutDiagram(diagram: DiagramDocument): DiagramLayout {
  const metrics = new Map<string, NodeMetrics>();
  diagram.nodes.forEach((node) => metrics.set(node.id, measureNode(node)));

  const levels = assignLevels(diagram.nodes, diagram.edges);
  let positions: Map<string, { x: number; y: number }>;

  switch (diagram.type) {
    case "mindmap":
    case "concept-map":
      positions = placeRadial(metrics, diagram.nodes, diagram.edges);
      break;
    case "cycle":
      positions = placeCycle(metrics, diagram.nodes);
      break;
    case "timeline":
      positions = placeTimeline(metrics, diagram.nodes);
      break;
    case "comparison":
      positions = placeComparison(metrics, diagram.nodes);
      break;
    default:
      positions = placeHierarchical(metrics, groupByLevel(diagram.nodes, levels), diagram.direction);
  }

  if (diagram.layout === "manual") {
    diagram.nodes.forEach((node) => {
      if (node.position) positions.set(node.id, { ...node.position });
    });
  }

  const nodes: LaidOutNode[] = diagram.nodes.map((node) => {
    const metric = metrics.get(node.id) as NodeMetrics;
    const position = positions.get(node.id) ?? { x: DIAGRAM_PADDING, y: DIAGRAM_PADDING };
    return {
      id: node.id,
      label: node.label,
      description: node.description,
      shape: (node.shape ?? "box") as DiagramNodeShape,
      x: position.x,
      y: position.y,
      width: metric.width,
      height: metric.height,
      lines: metric.lines,
      descriptionLines: metric.descriptionLines,
      fontSize: FONT_SIZE,
      descriptionFontSize: DESCRIPTION_FONT_SIZE,
    };
  });

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const edges = buildEdges(diagram, nodeMap);

  // Normaliza as coordenadas para começar no padding do quadro.
  const minX = nodes.length ? Math.min(...nodes.map((node) => node.x)) : 0;
  const minY = nodes.length ? Math.min(...nodes.map((node) => node.y)) : 0;
  const shifted = nodes.map((node) => ({ ...node, x: node.x - minX + DIAGRAM_PADDING, y: node.y - minY + DIAGRAM_PADDING }));
  const shiftX = DIAGRAM_PADDING - minX;
  const shiftY = DIAGRAM_PADDING - minY;
  const shiftedEdges = edges.map((edge) => ({
    ...edge,
    points: edge.points.map((point) => ({ x: point.x + shiftX, y: point.y + shiftY })),
  }));

  const maxX = shifted.length ? Math.max(...shifted.map((node) => node.x + node.width)) : DIAGRAM_PADDING;
  const maxY = shifted.length ? Math.max(...shifted.map((node) => node.y + node.height)) : DIAGRAM_PADDING;
  const width = Math.round(maxX + DIAGRAM_PADDING);
  const height = Math.round(maxY + DIAGRAM_PADDING);

  return {
    width: Math.max(width, DIAGRAM_PADDING * 2 + MIN_NODE_WIDTH),
    height: Math.max(height, DIAGRAM_PADDING * 2 + MIN_NODE_HEIGHT),
    padding: DIAGRAM_PADDING,
    nodes: shifted,
    edges: shiftedEdges,
    title: diagram.title,
  };
}
