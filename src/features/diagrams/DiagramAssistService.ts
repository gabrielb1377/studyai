import "server-only";

import { AIService } from "@/features/ai/AIService";
import type { AIProviderId } from "@/features/ai/AIProvider";
import { TokenCounter } from "@/features/ai/TokenCounter";
import { DIAGRAM_LIMITS, normalizeDiagram, normalizeText } from "./limits";
import { parseDiagramProposal } from "./parse/proposal";
import { diagramTypeLabels, type DiagramDocument, type DiagramType } from "./types";

/**
 * Geração de diagramas com IA.
 *
 * Usa exclusivamente o AI Core (AIService → ProviderManager → provider BYOK). A
 * resposta precisa ser JSON estruturado; SVG, HTML e código são descartados. A
 * proposta nunca é aplicada automaticamente: a interface exibe o resultado e
 * só substitui o diagrama após confirmação.
 */

export type DiagramAssistRequest = {
  topic: string;
  type: DiagramType;
  context?: string;
  apiKeys?: Partial<Record<AIProviderId, string>>;
};

export type DiagramAssistResponse = {
  proposal: DiagramDocument;
  explanation: string;
  type: DiagramType;
};

const ALLOWED_TYPES: DiagramType[] = [
  "flowchart",
  "process",
  "mindmap",
  "concept-map",
  "timeline",
  "comparison",
  "org-chart",
  "cycle",
];

function buildInstruction(type: DiagramType): string {
  return [
    "Você projeta diagramas de estudo em português do Brasil.",
    `Tipo solicitado: ${type} (${diagramTypeLabels[type]}).`,
    "Responda SOMENTE com um objeto JSON válido, sem markdown, sem comentários e sem texto antes ou depois.",
    'Formato: {"title":"...","nodes":[{"id":"a","label":"...","description":"..."}],"edges":[{"from":"a","to":"b","label":"..."}]}',
    `Use no máximo ${DIAGRAM_LIMITS.maxNodes} nós e ${DIAGRAM_LIMITS.maxEdges} conexões.`,
    "Os identificadores devem ser curtos (a, b, c...). Cada aresta deve referenciar identificadores existentes.",
    "Rótulos com até 60 caracteres; descrições opcionais com até 120 caracteres.",
    "Não inclua HTML, SVG, scripts, links, credenciais ou dados pessoais.",
    "Não repita o mesmo nó em vários lugares: use conexões.",
  ].join("\n");
}

export const DiagramAssistService = {
  async generate(request: DiagramAssistRequest): Promise<DiagramAssistResponse> {
    const topic = normalizeText(request.topic, DIAGRAM_LIMITS.maxAiTopicLength);
    if (!topic) throw new Error("Descreva o tema do diagrama antes de gerar.");
    const type = ALLOWED_TYPES.includes(request.type) ? request.type : "flowchart";

    const message = [
      buildInstruction(type),
      request.context ? `Contexto do estudo: ${TokenCounter.truncate(request.context, 800)}` : "",
      `Tema: ${TokenCounter.truncate(topic, 400)}`,
    ].filter(Boolean).join("\n\n");

    const response = await AIService.generate({
      history: [],
      message,
      mode: "automatic",
      stream: false,
      apiKeys: request.apiKeys,
    });

    const parsed = parseDiagramProposal(response.text.trim(), topic);
    if (!parsed.ok || !parsed.diagram) {
      throw new Error(parsed.issues[0] ?? "A IA não retornou um diagrama válido.");
    }

    const proposal = normalizeDiagram({
      ...parsed.diagram,
      type,
      title: parsed.diagram.title || topic,
      source: "ai",
    });

    return {
      proposal,
      explanation: `Proposta gerada pela IA com ${proposal.nodes.length} nós e ${proposal.edges.length} conexões. Revise antes de aplicar.`,
      type,
    };
  },
};
