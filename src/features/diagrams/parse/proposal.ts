/**
 * Interpretação da proposta de diagrama gerada pela IA.
 *
 * A IA responde apenas com dados estruturados (JSON). Nada de SVG, HTML ou
 * código é aceito: o texto é convertido em nós/conexões pelo mesmo
 * `normalizeDiagram` usado no editor, e só é aplicado após confirmação do
 * usuário na interface.
 */

import { DIAGRAM_LIMITS, normalizeDiagram } from "../limits";
import { diagramTypes, type DiagramDocument, type DiagramType } from "../types";

export type DiagramProposal = {
  ok: boolean;
  diagram?: DiagramDocument;
  issues: string[];
};

function readType(value: unknown): DiagramType {
  return diagramTypes.includes(value as DiagramType) ? (value as DiagramType) : "flowchart";
}

/**
 * Credenciais nunca devem virar conteúdo do diagrama. A IA não recebe chaves
 * no prompt, mas a resposta pode repetir um segredo por engano: qualquer
 * padrão conhecido de chave é substituído antes de o diagrama ser aplicado.
 */
const SECRET_PATTERN = /(?:sk-[A-Za-z0-9_-]{16,}|gsk_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|xai-[A-Za-z0-9]{20,}|hf_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,})/g;

function redactSecrets(value: string): string {
  return value.replace(SECRET_PATTERN, "[credencial removida]");
}

/** Extrai o primeiro objeto JSON balanceado do texto retornado pela IA. */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

/** Converte o texto da IA em um diagrama canônico. */
export function parseDiagramProposal(text: string, fallbackTitle = "Diagrama gerado por IA"): DiagramProposal {
  if (!text || !text.trim()) {
    return { ok: false, issues: ["A IA não retornou conteúdo."] };
  }
  if (text.length > DIAGRAM_LIMITS.maxMermaidSource) {
    return { ok: false, issues: ["A resposta da IA excede o tamanho permitido."] };
  }
  if (/<\s*(svg|script|html|iframe)\b/i.test(text)) {
    return { ok: false, issues: ["A resposta contém marcação executável e foi descartada."] };
  }

  const json = extractJsonObject(text);
  if (!json) {
    return { ok: false, issues: ["A resposta da IA não contém um objeto JSON válido."] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, issues: ["Não foi possível interpretar o JSON retornado pela IA."] };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, issues: ["O JSON retornado pela IA não é um objeto."] };
  }

  const candidate = parsed as {
    title?: unknown;
    type?: unknown;
    direction?: unknown;
    nodes?: unknown;
    edges?: unknown;
  };
  const rawNodes = Array.isArray(candidate.nodes) ? candidate.nodes : [];
  if (!rawNodes.length) {
    return { ok: false, issues: ["A IA não propôs nenhum nó para o diagrama."] };
  }

  const diagram = normalizeDiagram({
    title: typeof candidate.title === "string" ? redactSecrets(candidate.title) : fallbackTitle,
    type: readType(candidate.type),
    direction: candidate.direction === "LR" ? "LR" : "TB",
    layout: "auto",
    source: "ai",
    nodes: rawNodes,
    edges: Array.isArray(candidate.edges) ? candidate.edges : [],
  });

  if (!diagram.nodes.length) {
    return { ok: false, issues: ["Nenhum nó válido foi proposto pela IA."] };
  }

  return {
    ok: true,
    issues: [],
    diagram: {
      ...diagram,
      caption: diagram.caption ? redactSecrets(diagram.caption) : diagram.caption,
      nodes: diagram.nodes.map((node) => ({
        ...node,
        label: redactSecrets(node.label),
        description: node.description ? redactSecrets(node.description) : node.description,
      })),
      edges: diagram.edges.map((edge) => ({
        ...edge,
        label: edge.label ? redactSecrets(edge.label) : edge.label,
      })),
    },
  };
}
