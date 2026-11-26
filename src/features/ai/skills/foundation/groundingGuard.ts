/**
 * StudyAI — Intelligence Engine (IE-4A)
 * Especificação pedagógica: grounding.guard (v0.1.0).
 *
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §2 (#13):
 * - Objetivo: Exigir trecho de apoio; recusar o que o material não sustenta.
 * - Base existente: delimitador (`UntrustedDataBoundary`), `RetrievalPipeline` e `grounding.ts`.
 * - Ferramentas (fase): `library` (declarativo até Tool Engine).
 * - Orçamento inicial: 1.500 entrada / 300 saída.
 *
 * Limitação documentada: a presença de `sourceRef` válido contra os chunks efetivamente
 * enviados após compressão verifica rastreabilidade estrutural, mas não garante verificação
 * semântica universal da veracidade factual da afirmação.
 */

import type { SkillSpec, SkillValidationResult } from "../types";

export interface GroundingClaimCheck {
  readonly statement: string;
  readonly grounded: boolean;
  readonly sourceRef?: string;
  readonly reason: string;
}

export interface GroundingGuardOutput {
  readonly status: "grounded" | "partially_grounded" | "insufficient_material";
  readonly claims: readonly GroundingClaimCheck[];
  readonly safeResponse: string;
  readonly uncertaintyNotice?: string;
}

export const GROUNDING_GUARD_FALLBACK_JSON = JSON.stringify({
  status: "insufficient_material",
  claims: [],
  safeResponse: "Não encontrei trecho de apoio suficiente no material disponível para confirmar essa afirmação com segurança.",
  uncertaintyNotice: "Material insuficiente ou ausente no contexto autorizado para sustentar a resposta.",
} satisfies GroundingGuardOutput);

export function validateGroundingGuardOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: GroundingGuardOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as GroundingGuardOutput;
  } catch {
    return { valid: false, errors: ["A saída de grounding.guard não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída de grounding.guard deve ser um objeto JSON."] };
  }

  const validStatuses = ["grounded", "partially_grounded", "insufficient_material"];
  if (!validStatuses.includes(parsed.status)) {
    errors.push("A propriedade 'status' deve ser 'grounded', 'partially_grounded' ou 'insufficient_material'.");
  }

  if (!Array.isArray(parsed.claims)) {
    errors.push("A propriedade 'claims' deve ser uma lista de verificações de afirmações.");
  } else {
    parsed.claims.forEach((claim, idx) => {
      if (!claim?.statement || typeof claim.grounded !== "boolean" || !claim.reason) {
        errors.push(`Afirmação ${idx + 1} deve conter 'statement', 'grounded' (booleano) e 'reason'.`);
      }
      if (claim?.grounded && (!claim.sourceRef || !claim.sourceRef.trim())) {
        errors.push(`Afirmação ${idx + 1} marcada como fundamentada exige 'sourceRef' não vazio.`);
      }
      if (parsed?.status === "insufficient_material" && claim?.grounded) {
        errors.push(`Afirmação ${idx + 1} não pode estar marcada como fundamentada quando status='insufficient_material'.`);
      }
    });
  }

  if (!parsed.safeResponse || typeof parsed.safeResponse !== "string" || !parsed.safeResponse.trim()) {
    errors.push("A propriedade 'safeResponse' deve conter uma resposta segura não vazia.");
  }

  if (
    parsed.status === "insufficient_material" &&
    (!parsed.uncertaintyNotice || typeof parsed.uncertaintyNotice !== "string" || !parsed.uncertaintyNotice.trim())
  ) {
    errors.push("Quando status='insufficient_material', 'uncertaintyNotice' é obrigatório para declarar ausência de apoio.");
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed: errors.length === 0 ? parsed : undefined,
  };
}

export const groundingGuardSkillSpec: SkillSpec = {
  id: "grounding.guard",
  version: "0.1.0",
  objective: "Exigir trecho de apoio no contexto efetivamente autorizado e recusar ou sinalizar incerteza para tudo que o material não sustenta.",
  triggers: [
    {
      type: "rule",
      value: "require_grounding",
      description: "Verificação de fundamentação aplicada quando a resposta depende exclusivamente dos materiais do estudo.",
    },
    {
      type: "intent",
      value: "verify_material_support",
      description: "Verificação explícita se uma afirmação ou pergunta possui sustentação no material.",
    },
  ],
  inputs: {
    schema: {
      type: "object",
      properties: {
        claimOrQuestion: { type: "string", maxLength: 1000 },
        draftResponse: { type: "string", maxLength: 2000 },
        studyId: { type: "string" },
      },
      required: ["claimOrQuestion"],
    },
    required: ["claimOrQuestion"],
  },
  allowedContext: ["study", "chunks"],
  allowedTools: ["library"],
  output: {
    type: "json",
    formatDescription:
      "Objeto JSON com status ('grounded'|'partially_grounded'|'insufficient_material'), claims ([{statement, grounded, sourceRef?, reason}]), safeResponse e uncertaintyNotice opcional.",
    example: JSON.stringify({
      status: "grounded",
      claims: [
        {
          statement: "A busca binária exige vetor ordenado.",
          grounded: true,
          sourceRef: "Algoritmos · p. 18",
          reason: "Trecho recuperado afirma explicitamente o pré-requisito de ordenação.",
        },
      ],
      safeResponse: "Segundo Algoritmos (p. 18), a busca binária exige que o vetor esteja previamente ordenado.",
    }),
    requiredKeys: ["status", "claims", "safeResponse"],
    validator: validateGroundingGuardOutput,
  },
  tokenBudget: {
    input: 1500,
    output: 300,
  },
  safety: {
    doNotLeakInstructions: true,
    untrustedInputDelimited: true,
    requireSourceGrounding: true,
    forbiddenOutputs: [
      "afirmações de ter lido arquivos físicos do sistema operacional",
      "referências inventadas fora do material",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Toda afirmação marcada como grounded possui sourceRef presente nos chunks efetivamente enviados após compressão",
      "Recusa ou declara incerteza explicitamente quando o material for insuficiente",
      "Não inventa páginas, capítulos ou trechos ausentes",
    ],
    maxOutputWords: 220,
    schemaValidation: true,
  },
  fallback: {
    type: "json",
    content: GROUNDING_GUARD_FALLBACK_JSON,
    description: "Recusa conservadora estruturada em JSON declarando ausência de apoio suficiente.",
  },
};
