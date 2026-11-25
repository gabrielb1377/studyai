"use client";

import type {
  DiagramDocument,
  DiagramNode,
  DiagramEdge,
  DiagramNodeShape,
  DiagramTheme,
} from "../types";
import type { Node, Edge } from "@xyflow/react";
import { createDiagramId } from "../limits";

/**
 * Adapter entre DiagramDocument (modelo canônico) e React Flow.
 * 
 * Fluxo:
 * DiagramDocument → ReactFlowNode/Edge → Interação → ReactFlowNode/Edge → DiagramDocument
 */

// Mapeamento de formas do modelo para React Flow
const SHAPE_MAP: Record<DiagramNodeShape, string> = {
  box: "default",
  rounded: "default",
  pill: "default",
  ellipse: "default",
  diamond: "diamond",
};

/**
 * Converte DiagramNode para React Flow Node.
 * Preserva todos os metadados necessários para conversão reversa.
 */
export function diagramNodeToReactFlow(node: DiagramNode, theme: DiagramTheme): Node {
  const shapeType = SHAPE_MAP[node.shape ?? "box"];
  
  // Estilo baseado no tema - valores padrão para largura/altura
  const nodeStyle = {
    backgroundColor: theme.accentSoft,
    border: `1.5px solid ${theme.accent}`,
    borderRadius: node.shape === "pill" ? "9999px" : 
                  node.shape === "rounded" ? "12px" : 
                  node.shape === "ellipse" ? "50%" : 
                  node.shape === "diamond" ? "0" : "5px",
    width: 160,
    height: 48,
    minWidth: 120,
    minHeight: 48,
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center" as const,
    color: theme.ink,
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.2,
    boxSizing: "border-box" as const,
    // Para diamond, usamos clip-path
    clipPath: node.shape === "diamond" ? "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" : undefined,
  };

  return {
    id: node.id,
    position: { x: node.position?.x ?? 0, y: node.position?.y ?? 0 },
    type: shapeType,
    style: nodeStyle,
    data: {
      label: node.label,
      description: node.description ?? "",
      shape: node.shape,
      group: node.group,
    },
    // Permite arrastar
    draggable: true,
    selectable: true,
    connectable: true,
  };
}

/**
 * Converte DiagramEdge para React Flow Edge.
 */
export function diagramEdgeToReactFlow(edge: DiagramEdge): Edge {
  const isCurve = edge.style === "curve";
  
  return {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: isCurve ? "bezier" : "step",
    label: edge.label,
    labelStyle: {
      fontSize: 11,
      fontWeight: 500,
      background: "white",
      padding: "2px 6px",
      borderRadius: 4,
      border: "1px solid #d6e0f2",
      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
    },
    labelBgStyle: {
      fill: "white",
      stroke: "#d6e0f2",
      strokeWidth: 1,
    },
    style: {
      stroke: "#5b6b85",
      strokeWidth: 1.6,
      strokeDasharray: edge.style === "dashed" ? "6 5" : undefined,
    },
    markerEnd: edge.arrow !== false ? {
      type: "arrowclosed",
      color: "#5b6b85",
      width: 20,
      height: 20,
    } : undefined,
    data: {
      originalStyle: edge.style,
      originalArrow: edge.arrow,
    },
    animated: false,
  };
}

/**
 * Converte React Flow Node para DiagramNode.
 * Preserva todos os dados do modelo canônico.
 */
export function reactFlowNodeToDiagram(node: Node<Record<string, unknown>>): DiagramNode {
  const data = node.data as Record<string, unknown>;
  
  return {
    id: node.id,
    label: (data.label as string) ?? "Novo nó",
    description: (data.description as string) ?? "",
    shape: (data.shape as DiagramNodeShape) ?? "box",
    group: data.group as string | undefined,
    position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
  };
}

/**
 * Converte React Flow Edge para DiagramEdge.
 */
export function reactFlowEdgeToDiagram(edge: Edge<Record<string, unknown>>): DiagramEdge {
  const data = edge.data as Record<string, unknown>;
  
  // Converte label para string de forma segura
  const toLabelString = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (value === null || value === undefined) return "";
    return String(value);
  };
  
  return {
    id: edge.id,
    from: edge.source,
    to: edge.target,
    label: toLabelString(edge.label ?? data.label ?? ""),
    style: (data.originalStyle as "solid" | "dashed" | "curve") ?? (edge.type === "bezier" ? "curve" : "solid"),
    arrow: (data.originalArrow as boolean) ?? true,
  };
}

/**
 * Converte DiagramDocument completo para estado React Flow.
 */
export function diagramDocumentToReactFlow(
  document: DiagramDocument,
  theme: DiagramTheme
): { nodes: Node[]; edges: Edge[] } {
  const nodes = document.nodes.map((node) => diagramNodeToReactFlow(node, theme));
  const edges = document.edges.map((edge) => diagramEdgeToReactFlow(edge));
  return { nodes, edges };
}

/**
 * Converte estado React Flow para DiagramDocument.
 * Preserva metadados do documento original.
 */
export function reactFlowToDiagramDocument(
  document: DiagramDocument,
  nodes: Node<Record<string, unknown>>[],
  edges: Edge<Record<string, unknown>>[]
): DiagramDocument {
  const newNodes = nodes.map(reactFlowNodeToDiagram);
  const newEdges = edges.map(reactFlowEdgeToDiagram);
  
  return {
    ...document,
    nodes: newNodes,
    edges: newEdges,
    layout: "manual",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Cria um novo nó com ID único.
 */
export function createDiagramNode(
  type: DiagramNodeShape = "box",
  label: string = "Novo nó",
  position: { x: number; y: number } = { x: 100, y: 100 }
): DiagramNode {
  return {
    id: createDiagramId("n"),
    label,
    shape: type,
    position,
  };
}

/**
 * Cria uma nova conexão entre dois nós.
 */
export function createDiagramEdge(
  from: string,
  to: string,
  label?: string
): DiagramEdge {
  return {
    id: createDiagramId("e"),
    from,
    to,
    label,
    style: "solid",
    arrow: true,
  };
}