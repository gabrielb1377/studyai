/**
 * Templates iniciais dos oito tipos de diagrama.
 *
 * Cada template é apenas um ponto de partida editável: ao criar um diagrama a
 * partir dele, os identificadores são regenerados para não colidir com os de
 * outros diagramas do mesmo documento.
 */

import { cloneDiagram, normalizeDiagram } from "./limits";
import { diagramTypeLabels, type DiagramDocument, type DiagramType } from "./types";

type TemplateDefinition = {
  title: string;
  direction: DiagramDocument["direction"];
  nodes: Array<{ id: string; label: string; description?: string; shape?: DiagramDocument["nodes"][number]["shape"]; group?: string }>;
  edges: Array<{ id: string; from: string; to: string; label?: string; style?: "solid" | "dashed"; arrow?: boolean }>;
};

const definitions: Record<DiagramType, TemplateDefinition> = {
  flowchart: {
    title: "Fluxo de resolução de problema",
    direction: "TB",
    nodes: [
      { id: "start", label: "Início", shape: "pill" },
      { id: "read", label: "Ler o enunciado", shape: "box" },
      { id: "check", label: "Entendi o problema?", shape: "diamond" },
      { id: "ask", label: "Revisar conceitos", shape: "box" },
      { id: "solve", label: "Resolver e conferir", shape: "box" },
      { id: "end", label: "Fim", shape: "pill" },
    ],
    edges: [
      { id: "e1", from: "start", to: "read" },
      { id: "e2", from: "read", to: "check" },
      { id: "e3", from: "check", to: "ask", label: "Não" },
      { id: "e4", from: "ask", to: "read", label: "Retomar", style: "dashed" },
      { id: "e5", from: "check", to: "solve", label: "Sim" },
      { id: "e6", from: "solve", to: "end" },
    ],
  },
  process: {
    title: "Etapas do estudo",
    direction: "LR",
    nodes: [
      { id: "p1", label: "1. Preparar", shape: "pill" },
      { id: "p2", label: "2. Ler", shape: "pill" },
      { id: "p3", label: "3. Resumir", shape: "pill" },
      { id: "p4", label: "4. Praticar", shape: "pill" },
      { id: "p5", label: "5. Revisar", shape: "pill" },
    ],
    edges: [
      { id: "e1", from: "p1", to: "p2" },
      { id: "e2", from: "p2", to: "p3" },
      { id: "e3", from: "p3", to: "p4" },
      { id: "e4", from: "p4", to: "p5" },
    ],
  },
  mindmap: {
    title: "Mapa mental do tema",
    direction: "LR",
    nodes: [
      { id: "center", label: "Tema central", shape: "rounded" },
      { id: "b1", label: "Conceitos", shape: "rounded" },
      { id: "b2", label: "Exemplos", shape: "rounded" },
      { id: "b3", label: "Aplicações", shape: "rounded" },
      { id: "b4", label: "Dúvidas", shape: "rounded" },
      { id: "s1", label: "Definições", shape: "rounded" },
      { id: "s2", label: "Casos reais", shape: "rounded" },
    ],
    edges: [
      { id: "e1", from: "center", to: "b1" },
      { id: "e2", from: "center", to: "b2" },
      { id: "e3", from: "center", to: "b3" },
      { id: "e4", from: "center", to: "b4" },
      { id: "e5", from: "b1", to: "s1" },
      { id: "e6", from: "b2", to: "s2" },
    ],
  },
  "concept-map": {
    title: "Mapa conceitual",
    direction: "LR",
    nodes: [
      { id: "core", label: "Conceito central", shape: "rounded" },
      { id: "c1", label: "Fundamento", shape: "rounded" },
      { id: "c2", label: "Processo", shape: "rounded" },
      { id: "c3", label: "Resultado", shape: "rounded" },
      { id: "c4", label: "Limitação", shape: "rounded" },
    ],
    edges: [
      { id: "e1", from: "core", to: "c1", label: "depende de" },
      { id: "e2", from: "core", to: "c2", label: "aplica" },
      { id: "e3", from: "c2", to: "c3", label: "produz" },
      { id: "e4", from: "core", to: "c4", label: "apresenta" },
    ],
  },
  timeline: {
    title: "Linha do tempo",
    direction: "LR",
    nodes: [
      { id: "t1", label: "Início do período", shape: "pill" },
      { id: "t2", label: "Primeiro marco", shape: "rounded" },
      { id: "t3", label: "Segundo marco", shape: "rounded" },
      { id: "t4", label: "Situação atual", shape: "pill" },
    ],
    edges: [
      { id: "e1", from: "t1", to: "t2" },
      { id: "e2", from: "t2", to: "t3" },
      { id: "e3", from: "t3", to: "t4" },
    ],
  },
  comparison: {
    title: "Comparação",
    direction: "TB",
    nodes: [
      { id: "a1", label: "Critério A", group: "a" },
      { id: "a2", label: "Vantagem", group: "a" },
      { id: "a3", label: "Desvantagem", group: "a" },
      { id: "b1", label: "Critério B", group: "b" },
      { id: "b2", label: "Vantagem", group: "b" },
      { id: "b3", label: "Desvantagem", group: "b" },
    ],
    edges: [],
  },
  "org-chart": {
    title: "Organograma",
    direction: "TB",
    nodes: [
      { id: "root", label: "Tema principal", shape: "box" },
      { id: "n1", label: "Subtema 1", shape: "box" },
      { id: "n2", label: "Subtema 2", shape: "box" },
      { id: "n3", label: "Subtema 3", shape: "box" },
      { id: "n11", label: "Detalhe", shape: "box" },
      { id: "n12", label: "Detalhe", shape: "box" },
    ],
    edges: [
      { id: "e1", from: "root", to: "n1" },
      { id: "e2", from: "root", to: "n2" },
      { id: "e3", from: "root", to: "n3" },
      { id: "e4", from: "n1", to: "n11" },
      { id: "e5", from: "n1", to: "n12" },
    ],
  },
  cycle: {
    title: "Ciclo de aprendizagem",
    direction: "TB",
    nodes: [
      { id: "c1", label: "Explorar", shape: "pill" },
      { id: "c2", label: "Praticar", shape: "pill" },
      { id: "c3", label: "Avaliar", shape: "pill" },
      { id: "c4", label: "Ajustar", shape: "pill" },
    ],
    edges: [
      { id: "e1", from: "c1", to: "c2" },
      { id: "e2", from: "c2", to: "c3" },
      { id: "e3", from: "c3", to: "c4" },
      { id: "e4", from: "c4", to: "c1" },
    ],
  },
};

/** Cria um diagrama editável a partir do template do tipo informado. */
export function createDiagramFromTemplate(type: DiagramType, title?: string): DiagramDocument {
  const definition = definitions[type] ?? definitions.flowchart;
  const base = normalizeDiagram({
    title: title || definition.title,
    type,
    direction: definition.direction,
    layout: "auto",
    source: "template",
    nodes: definition.nodes,
    edges: definition.edges,
  });
  return cloneDiagram({ ...base, title: title || definition.title, type });
}

export const diagramTemplates = (Object.keys(definitions) as DiagramType[]).map((type) => ({
  type,
  label: diagramTypeLabels[type],
  title: definitions[type].title,
}));

/** Diagrama de conceitos importado do Knowledge Graph. */
export function createConceptMapFromGraph(
  title: string,
  concepts: Array<{ id: string; name: string; description?: string }>,
  relations: Array<{ sourceId: string; targetId: string; kind: string }>,
): DiagramDocument {
  const selected = concepts.slice(0, 20);
  const allowed = new Set(selected.map((concept) => concept.id));
  const base = normalizeDiagram({
    title,
    type: "concept-map",
    direction: "LR",
    layout: "auto",
    source: "knowledge",
    nodes: selected.map((concept) => ({
      id: concept.id,
      label: concept.name,
      description: concept.description,
      shape: "rounded",
    })),
    edges: relations
      .filter((relation) => allowed.has(relation.sourceId) && allowed.has(relation.targetId))
      .slice(0, 40)
      .map((relation, index) => ({
        id: `kg-${index + 1}`,
        from: relation.sourceId,
        to: relation.targetId,
        label: relation.kind.replace(/_/g, " "),
      })),
  });
  return cloneDiagram({ ...base, title, source: "knowledge" });
}
