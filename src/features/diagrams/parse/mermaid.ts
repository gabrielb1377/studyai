/**
 * Leitor do subconjunto Mermaid suportado pelo Diagram Studio.
 *
 * Não usa o pacote `mermaid` (que exige DOM e adiciona centenas de kB ao
 * bundle). Apenas o subconjunto necessário é interpretado — `flowchart`/`graph`
 * com nós, rótulos e conectores — e convertido para o modelo canônico. Qualquer
 * outra construção gera um erro legível, nunca execução de código.
 */

import { DIAGRAM_LIMITS, normalizeDiagram } from "../limits";
import type { DiagramDocument, DiagramEdge, DiagramNode, DiagramNodeShape } from "../types";

export type MermaidParseResult = {
  ok: boolean;
  diagram?: DiagramDocument;
  issues: string[];
};

const CONNECTORS = ["-.->", "-->", "==>", "---"] as const;

const NODE_TOKEN = /^([A-Za-z0-9_][\w-]*)\s*(\(\(.*?\)\)|\[.*?\]|\{.*?\}|\(.*?\))?$/;

function shapeFromToken(token: string | undefined): { label: string; shape: DiagramNodeShape; hasShape: boolean } {
  if (!token) return { label: "", shape: "box", hasShape: false };
  const value = token.trim();
  if (value.startsWith("((") && value.endsWith("))")) {
    return { label: value.slice(2, -2), shape: "ellipse", hasShape: true };
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    return { label: value.slice(1, -1), shape: "box", hasShape: true };
  }
  if (value.startsWith("{") && value.endsWith("}")) {
    return { label: value.slice(1, -1), shape: "diamond", hasShape: true };
  }
  if (value.startsWith("(") && value.endsWith(")")) {
    return { label: value.slice(1, -1), shape: "rounded", hasShape: true };
  }
  return { label: "", shape: "box", hasShape: false };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  return trimmed;
}

/** Converte o texto Mermaid em diagrama canônico. */
export function parseMermaid(source: string, options: { title?: string; id?: string } = {}): MermaidParseResult {
  const issues: string[] = [];
  if (typeof source !== "string" || !source.trim()) {
    return { ok: false, issues: ["Cole o código Mermaid do diagrama."] };
  }
  if (source.length > DIAGRAM_LIMITS.maxMermaidSource) {
    return { ok: false, issues: [`O código excede ${DIAGRAM_LIMITS.maxMermaidSource} caracteres.`] };
  }

  const lines = source.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim());
  const header = lines.find((line) => /^(flowchart|graph)\b/i.test(line));
  if (!header) {
    return { ok: false, issues: ["Cabeçalho ausente. Use `flowchart TD` ou `graph LR`."] };
  }
  const headerMatch = /^(flowchart|graph)\s+(TB|TD|LR|RL|BT)/i.exec(header);
  if (!headerMatch) {
    return { ok: false, issues: ["Direção inválida no cabeçalho. Use TD, TB, LR ou BT."] };
  }
  const rawDirection = headerMatch[2].toUpperCase();
  const direction: DiagramDocument["direction"] = rawDirection === "LR" || rawDirection === "RL" ? "LR" : "TB";

  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  let edgeIndex = 0;

  const ensureNode = (token: string, fallbackId: string): string | null => {
    const match = NODE_TOKEN.exec(token);
    if (!match) return null;
    const id = match[1] || fallbackId;
    const parsed = shapeFromToken(match[2]);
    const label = unquote(parsed.hasShape ? parsed.label : id) || id;
    const existing = nodes.get(id);
    if (existing) {
      if (parsed.hasShape) {
        existing.label = label;
        existing.shape = parsed.shape;
      }
      return id;
    }
    if (nodes.size >= DIAGRAM_LIMITS.maxNodes) return null;
    nodes.set(id, { id, label, shape: parsed.shape });
    return id;
  };

  for (const rawLine of lines) {
    if (!rawLine || rawLine.startsWith("%%") || /^(flowchart|graph)\b/i.test(rawLine)) continue;
    // Converte rótulos no meio do conector (A -- texto --> B) para |texto|.
    const line = rawLine
      .replace(/--\s+([^>|]+?)\s+-->/g, "-->|$1|")
      .replace(/--\s+([^>|]+?)\s+---/g, "---|$1|");

    const segments = line.split(/\s*(-\.->|-->|==>|---)\s*/);
    if (segments.length < 3) {
      // Linha apenas declara um nó.
      const declared = line.split("&").map((item) => item.trim()).filter(Boolean);
      for (const token of declared) {
        if (!ensureNode(token, `n${nodes.size + 1}`)) issues.push(`Linha não reconhecida: "${rawLine}".`);
      }
      continue;
    }

    let previousIds: string[] = [];
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index].trim();
      const isConnector = (CONNECTORS as readonly string[]).includes(segment);
      if (isConnector) continue;

      // Rótulo do conector, quando presente (|texto| antes do alvo).
      let connectorLabel = "";
      let token = segment;
      const labelMatch = /^\|([^|]*)\|\s*(.*)$/.exec(token);
      if (labelMatch) {
        connectorLabel = labelMatch[1].trim();
        token = labelMatch[2].trim();
      }

      const targets = token.split("&").map((item) => item.trim()).filter(Boolean);
      const currentIds: string[] = [];
      for (const target of targets) {
        const id = ensureNode(target, `n${nodes.size + 1}`);
        if (!id) {
          issues.push(`Nó inválido: "${target}".`);
          continue;
        }
        currentIds.push(id);
        if (previousIds.length && edgeIndex < DIAGRAM_LIMITS.maxEdges) {
          const connector = segments[index - 1] as string;
          for (const from of previousIds) {
            if (from === id) continue;
            edges.push({
              id: `e${edgeIndex + 1}`,
              from,
              to: id,
              label: connectorLabel || undefined,
              style: connector === "-.->" ? "dashed" : "solid",
              arrow: connector !== "---",
            });
            edgeIndex += 1;
          }
        }
      }
      previousIds = currentIds;
    }
  }

  if (!nodes.size) {
    return { ok: false, issues: [...issues, "Nenhum nó foi encontrado no código Mermaid."].slice(0, 6) };
  }
  if (issues.length) {
    return { ok: false, issues: issues.slice(0, 6) };
  }

  const now = new Date().toISOString();
  const diagram = normalizeDiagram({
    id: options.id,
    title: options.title || "Diagrama importado do Mermaid",
    type: "flowchart",
    direction,
    layout: "auto",
    source: "mermaid",
    nodes: [...nodes.values()],
    edges,
    createdAt: now,
  });
  return { ok: true, diagram, issues: [] };
}
