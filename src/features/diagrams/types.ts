/**
 * Modelo canônico de diagramas do StudyAI.
 *
 * Um diagrama é armazenado como estrutura de dados (nós e conexões), nunca
 * como SVG/HTML pronto. Os renderizadores (prévia, PDF, PPTX e exportação)
 * consomem sempre este modelo, o que preserva a fonte editável e impede a
 * execução de marcação arbitrária.
 */

export const diagramTypes = [
  "flowchart",
  "process",
  "mindmap",
  "concept-map",
  "timeline",
  "comparison",
  "org-chart",
  "cycle",
] as const;

export type DiagramType = (typeof diagramTypes)[number];

export const diagramTypeLabels: Record<DiagramType, string> = {
  flowchart: "Fluxograma",
  process: "Processo",
  mindmap: "Mapa mental",
  "concept-map": "Mapa conceitual",
  timeline: "Linha do tempo",
  comparison: "Comparação",
  "org-chart": "Organograma",
  cycle: "Ciclo",
};

export const diagramTypeDescriptions: Record<DiagramType, string> = {
  flowchart: "Decisões e caminhos com setas direcionais.",
  process: "Etapas sequenciais numeradas.",
  mindmap: "Ideias irradiando de um tema central.",
  "concept-map": "Conceitos conectados por relações nomeadas.",
  timeline: "Eventos em ordem cronológica.",
  comparison: "Dois conjuntos de itens lado a lado.",
  "org-chart": "Hierarquia de cima para baixo.",
  cycle: "Etapas que se repetem em círculo.",
};

export type DiagramNodeShape = "box" | "rounded" | "diamond" | "ellipse" | "pill";

export type DiagramNode = {
  id: string;
  label: string;
  description?: string;
  shape?: DiagramNodeShape;
  /** Agrupamento usado por diagramas de comparação. */
  group?: string;
  /** Posição manual em unidades do diagrama (quando o layout é manual). */
  position?: { x: number; y: number };
};

export type DiagramEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  style?: "solid" | "dashed";
  arrow?: boolean;
};

export type DiagramSource = "manual" | "template" | "ai" | "mermaid" | "knowledge";

export type DiagramDocument = {
  id: string;
  title: string;
  type: DiagramType;
  direction: "TB" | "LR";
  layout: "auto" | "manual";
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  caption?: string;
  source: DiagramSource;
  createdAt: string;
  updatedAt: string;
};

export type DiagramTheme = {
  accent: string;
  accentSoft: string;
  ink: string;
  muted: string;
  surface: string;
  border: string;
  onAccent: string;
};

export const defaultDiagramTheme: DiagramTheme = {
  accent: "#2e5cb0",
  accentSoft: "#edf3fc",
  ink: "#142947",
  muted: "#5b6b85",
  surface: "#ffffff",
  border: "#d6e0f2",
  onAccent: "#ffffff",
};

export type DiagramLayoutMode = "orthogonal" | "curve" | "straight";

export type LaidOutNode = {
  id: string;
  label: string;
  description?: string;
  shape: DiagramNodeShape;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  descriptionLines: string[];
  fontSize: number;
  descriptionFontSize: number;
};

export type LaidOutEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  dashed: boolean;
  arrow: boolean;
  mode: DiagramLayoutMode;
  /** Pontos absolutos. Em curvas: início, controle e fim. */
  points: Array<{ x: number; y: number }>;
};

export type DiagramLayout = {
  width: number;
  height: number;
  padding: number;
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  title: string;
};
