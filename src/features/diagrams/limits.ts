/**
 * Limites de segurança e normalização dos diagramas.
 *
 * Todo diagrama vindo do usuário, de um template ou de um provedor de IA passa
 * por `normalizeDiagram` antes de ser persistido ou renderizado. O objetivo é
 * garantir estrutura previsível, tamanho limitado e ausência de conteúdo de
 * controle, sem depender de sanitização de HTML.
 */

import {
  diagramTypes,
  type DiagramDocument,
  type DiagramEdge,
  type DiagramNode,
  type DiagramNodeShape,
  type DiagramSource,
  type DiagramType,
} from "./types";

export const DIAGRAM_LIMITS = {
  maxNodes: 40,
  maxEdges: 80,
  maxLabelLength: 120,
  maxDescriptionLength: 240,
  maxTitleLength: 120,
  maxCaptionLength: 240,
  maxEdgeLabelLength: 48,
  maxMermaidSource: 12_000,
  maxAiTopicLength: 400,
  maxSvgBytes: 600_000,
  maxPngDimension: 4_096,
  maxPngBytes: 8_000_000,
  maxPngScale: 3,
} as const;

const SHAPES: DiagramNodeShape[] = ["box", "rounded", "diamond", "ellipse", "pill"];

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Remove caracteres de controle e normaliza espaços em um texto curto. */
export function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(CONTROL_CHARACTERS, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

export function createDiagramId(prefix = "diagram"): string {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(16).slice(2, 10);
  return `${prefix}-${random}`;
}

function normalizeShape(value: unknown, type: DiagramType): DiagramNodeShape {
  if (typeof value === "string" && SHAPES.includes(value as DiagramNodeShape)) {
    return value as DiagramNodeShape;
  }
  if (type === "mindmap" || type === "concept-map") return "rounded";
  if (type === "cycle") return "pill";
  return "box";
}

function normalizeType(value: unknown): DiagramType {
  return diagramTypes.includes(value as DiagramType) ? (value as DiagramType) : "flowchart";
}

function normalizeSource(value: unknown): DiagramSource {
  if (value === "template" || value === "ai" || value === "mermaid" || value === "knowledge") return value;
  return "manual";
}

function normalizeNode(raw: unknown, index: number, type: DiagramType, keepEmptyLabels: boolean): DiagramNode | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<DiagramNode>;
  const label = normalizeText(candidate.label, DIAGRAM_LIMITS.maxLabelLength);
  if (!label && !keepEmptyLabels) return null;
  const id = normalizeText(candidate.id, 64) || `n${index + 1}`;
  const description = normalizeText(candidate.description, DIAGRAM_LIMITS.maxDescriptionLength);
  const node: DiagramNode = {
    id,
    label,
    shape: normalizeShape(candidate.shape, type),
  };
  if (description) node.description = description;
  const group = normalizeText(candidate.group, 48);
  if (group) node.group = group;
  if (candidate.position && typeof candidate.position === "object") {
    const x = Number(candidate.position.x);
    const y = Number(candidate.position.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      node.position = { x: clampNumber(x, 0, 20_000), y: clampNumber(y, 0, 20_000) };
    }
  }
  return node;
}

function normalizeEdge(raw: unknown, index: number, nodeIds: Set<string>): DiagramEdge | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<DiagramEdge>;
  const from = normalizeText(candidate.from, 64);
  const to = normalizeText(candidate.to, 64);
  if (!from || !to || from === to) return null;
  if (!nodeIds.has(from) || !nodeIds.has(to)) return null;
  const label = normalizeText(candidate.label, DIAGRAM_LIMITS.maxEdgeLabelLength);
  const edge: DiagramEdge = {
    id: normalizeText(candidate.id, 64) || `e${index + 1}`,
    from,
    to,
    style: candidate.style === "dashed" ? "dashed" : "solid",
    arrow: candidate.arrow !== false,
  };
  if (label) edge.label = label;
  return edge;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Resultado da validação estrutural de um diagrama. */
export type DiagramValidation = {
  ok: boolean;
  issues: string[];
};

/**
 * Normaliza qualquer entrada em um `DiagramDocument` seguro.
 * Limita nós, conexões e textos; remove conexões órfãs e identificadores
 * duplicados. Nunca lança: entradas inválidas viram um diagrama vazio.
 */
export function normalizeDiagram(raw: unknown, options: { keepEmptyLabels?: boolean } = {}): DiagramDocument {
  const candidate = (raw && typeof raw === "object" ? raw : {}) as Partial<DiagramDocument>;
  const type = normalizeType(candidate.type);

  const seen = new Set<string>();
  const nodes: DiagramNode[] = [];
  const rawNodes = Array.isArray(candidate.nodes) ? candidate.nodes : [];
  for (const item of rawNodes) {
    if (nodes.length >= DIAGRAM_LIMITS.maxNodes) break;
    const node = normalizeNode(item, nodes.length, type, options.keepEmptyLabels === true);
    if (!node) continue;
    let id = node.id;
    let suffix = 2;
    while (seen.has(id)) {
      id = `${node.id}-${suffix++}`;
    }
    seen.add(id);
    nodes.push({ ...node, id });
  }

  const rawEdges = Array.isArray(candidate.edges) ? candidate.edges : [];
  const edgeIds = new Set<string>();
  const edges: DiagramEdge[] = [];
  for (const item of rawEdges) {
    if (edges.length >= DIAGRAM_LIMITS.maxEdges) break;
    const edge = normalizeEdge(item, edges.length, seen);
    if (!edge || edgeIds.has(edge.id)) continue;
    edgeIds.add(edge.id);
    edges.push(edge);
  }

  const now = new Date().toISOString();
  return {
    id: normalizeText(candidate.id, 80) || createDiagramId(),
    title: normalizeText(candidate.title, DIAGRAM_LIMITS.maxTitleLength) || "Diagrama sem título",
    type,
    direction: candidate.direction === "LR" ? "LR" : "TB",
    layout: candidate.layout === "manual" ? "manual" : "auto",
    nodes,
    edges,
    caption: normalizeText(candidate.caption, DIAGRAM_LIMITS.maxCaptionLength) || undefined,
    source: normalizeSource(candidate.source),
    createdAt: normalizeText(candidate.createdAt, 40) || now,
    updatedAt: now,
  };
}

/** Validação usada pelos testes e pela interface antes de exportar. */
export function validateDiagram(diagram: DiagramDocument): DiagramValidation {
  const issues: string[] = [];
  if (!diagram.nodes.length) issues.push("O diagrama precisa de pelo menos um nó.");
  if (diagram.nodes.length > DIAGRAM_LIMITS.maxNodes) {
    issues.push(`O diagrama excede ${DIAGRAM_LIMITS.maxNodes} nós.`);
  }
  if (diagram.edges.length > DIAGRAM_LIMITS.maxEdges) {
    issues.push(`O diagrama excede ${DIAGRAM_LIMITS.maxEdges} conexões.`);
  }
  const ids = new Set(diagram.nodes.map((node) => node.id));
  if (ids.size !== diagram.nodes.length) issues.push("Existem identificadores de nó duplicados.");
  for (const node of diagram.nodes) {
    if (!node.label.trim()) issues.push(`O nó ${node.id} está sem rótulo.`);
    if (node.label.length > DIAGRAM_LIMITS.maxLabelLength) {
      issues.push(`O nó ${node.id} excede ${DIAGRAM_LIMITS.maxLabelLength} caracteres.`);
    }
  }
  for (const edge of diagram.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      issues.push(`A conexão ${edge.id} aponta para um nó inexistente.`);
    }
  }
  return { ok: issues.length === 0, issues };
}

/** Cria um diagrama vazio válido para um tipo. */
export function createEmptyDiagram(type: DiagramType = "flowchart", title = "Novo diagrama"): DiagramDocument {
  return normalizeDiagram({
    id: createDiagramId(),
    title,
    type,
    direction: type === "mindmap" || type === "timeline" ? "LR" : "TB",
    layout: "auto",
    source: "manual",
    nodes: [],
    edges: [],
  });
}

/** Clona um diagrama atribuindo novos identificadores a nós e conexões. */
export function cloneDiagram(diagram: DiagramDocument): DiagramDocument {
  const idMap = new Map<string, string>();
  const nodes = diagram.nodes.map((node) => {
    const id = createDiagramId("n");
    idMap.set(node.id, id);
    return { ...node, id };
  });
  const edges = diagram.edges
    .map((edge) => ({
      ...edge,
      id: createDiagramId("e"),
      from: idMap.get(edge.from) ?? "",
      to: idMap.get(edge.to) ?? "",
    }))
    .filter((edge) => edge.from && edge.to);
  return normalizeDiagram({ ...diagram, id: createDiagramId(), nodes, edges, updatedAt: new Date().toISOString() });
}
