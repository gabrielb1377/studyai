/**
 * StudyAI — Intelligence Engine (IE-4B)
 * Especificação pedagógica: doc.analysis (v0.1.0).
 *
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §2 (#12):
 * - Objetivo: Resumir e questionar um documento com proveniência.
 * - Base existente: `summaries`, `ocr`, `retrieval`, `UntrustedDataBoundary`, `grounding.ts`.
 * - Ferramentas (fase): `doc_reader` (declarativo até Onda 3).
 * - Orçamento inicial: 4.000 entrada / 800 saída.
 *
 * Limitação documentada: validação de `sourceRef` verifica rastreabilidade contra
 * os chunks efetivamente mantidos após compressão, mas não constitui verificação
 * semântica universal.
 */

import type { SkillSpec, SkillValidationResult } from "../types";

export interface DocKeyConcept {
  readonly concept: string;
  readonly explanation: string;
  readonly sourceRef: string;
}

export interface DocAnalysisOutput {
  readonly status: "analyzed" | "insufficient_material";
  readonly summary: string;
  readonly keyConcepts: readonly DocKeyConcept[];
  readonly documentQuestions: readonly string[];
  readonly complementaryInterpretation?: string;
  readonly provenance: readonly string[];
  readonly uncertaintyNotice?: string;
}

export const DOC_ANALYSIS_FALLBACK_JSON = JSON.stringify({
  status: "insufficient_material",
  summary: "Não foi possível gerar uma análise estruturada com os trechos atualmente disponíveis.",
  keyConcepts: [],
  documentQuestions: [
    "Qual é o objetivo principal descrito na introdução do documento?",
    "Quais definições ou requisitos aparecem destacados no material?",
  ],
  provenance: ["sem apoio no material"],
  uncertaintyNotice: "Material insuficiente ou saída fora do contrato estrutural para análise documental segura.",
} satisfies DocAnalysisOutput);

export function validateDocAnalysisOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: DocAnalysisOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as DocAnalysisOutput;
  } catch {
    return { valid: false, errors: ["A saída de doc.analysis não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída de doc.analysis deve ser um objeto JSON."] };
  }

  if (parsed.status !== "analyzed" && parsed.status !== "insufficient_material") {
    errors.push("A propriedade 'status' deve ser 'analyzed' ou 'insufficient_material'.");
  }

  if (!parsed.summary || typeof parsed.summary !== "string" || !parsed.summary.trim()) {
    errors.push("A propriedade 'summary' deve conter um resumo não vazio.");
  }

  if (!Array.isArray(parsed.keyConcepts)) {
    errors.push("A propriedade 'keyConcepts' deve ser uma lista de conceitos-chave.");
  } else {
    if (parsed.status === "analyzed" && parsed.keyConcepts.length === 0) {
      errors.push("Quando status='analyzed', 'keyConcepts' deve conter ao menos um conceito fundamentado.");
    }
    parsed.keyConcepts.forEach((kc, idx) => {
      if (!kc?.concept || !kc?.explanation || !kc?.sourceRef?.trim()) {
        errors.push(`Conceito-chave ${idx + 1} exige 'concept', 'explanation' e 'sourceRef' não vazios.`);
      }
    });
  }

  if (!Array.isArray(parsed.documentQuestions) || parsed.documentQuestions.length === 0) {
    errors.push("A propriedade 'documentQuestions' deve conter ao menos uma pergunta sobre o documento.");
  }

  if (!Array.isArray(parsed.provenance) || parsed.provenance.length === 0) {
    errors.push("A propriedade 'provenance' deve listar as referências de origem utilizadas.");
  }

  if (
    parsed.status === "insufficient_material" &&
    (!parsed.uncertaintyNotice || typeof parsed.uncertaintyNotice !== "string" || !parsed.uncertaintyNotice.trim())
  ) {
    errors.push("Quando status='insufficient_material', 'uncertaintyNotice' é obrigatório.");
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed: errors.length === 0 ? parsed : undefined,
  };
}

export const docAnalysisSkillSpec: SkillSpec = {
  id: "doc.analysis",
  version: "0.1.0",
  objective: "Resumir e questionar um documento com proveniência rastreável, separando evidência do material de interpretação complementar.",
  triggers: [
    {
      type: "action",
      value: "analyze_document",
      description: "Análise estruturada de documento selecionado na Biblioteca ou Workspace.",
    },
    {
      type: "intent",
      value: "summarize_and_question_document",
      description: "Estudante pede resumo fundamentado e perguntas sobre um documento.",
    },
  ],
  inputs: {
    schema: {
      type: "object",
      properties: {
        documentTitle: { type: "string", maxLength: 200 },
        question: { type: "string", maxLength: 1000 },
        studyId: { type: "string" },
      },
      required: ["documentTitle"],
    },
    required: ["documentTitle"],
  },
  allowedContext: ["study", "chunks"],
  allowedTools: ["doc_reader"],
  output: {
    type: "json",
    formatDescription:
      "Objeto JSON com status ('analyzed'|'insufficient_material'), summary, keyConcepts ([{concept, explanation, sourceRef}]), documentQuestions, complementaryInterpretation?, provenance e uncertaintyNotice?.",
    example: JSON.stringify({
      status: "analyzed",
      summary: "O documento descreve o protocolo TCP e seus mecanismos de controle de congestionamento.",
      keyConcepts: [
        {
          concept: "Slow Start",
          explanation: "Crescimento exponencial inicial da janela de congestionamento até atingir o limiar ssthresh.",
          sourceRef: "Redes de Computadores · p. 112",
        },
      ],
      documentQuestions: ["Como o TCP reage ao detectar perda de pacote por timeout?"],
      complementaryInterpretation: "Na prática, o controle de congestionamento evita colapso em enlaces compartilhados.",
      provenance: ["Redes de Computadores · p. 112"],
    }),
    requiredKeys: ["status", "summary", "keyConcepts", "documentQuestions", "provenance"],
    validator: validateDocAnalysisOutput,
  },
  tokenBudget: {
    input: 4000,
    output: 800,
  },
  safety: {
    doNotLeakInstructions: true,
    untrustedInputDelimited: true,
    requireSourceGrounding: true,
    forbiddenOutputs: [
      "afirmações de ter lido arquivos físicos do sistema operacional",
      "citações inventadas fora do material",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Resumo fiel aos trechos recuperados com proveniência explícita",
      "Cada conceito-chave possui sourceRef presente nos chunks efetivamente mantidos após compressão",
      "Separa evidência do documento de complementaryInterpretation",
      "Declara insufficient_material e uncertaintyNotice quando o documento é vazio ou insuficiente",
    ],
    maxOutputWords: 550,
    schemaValidation: true,
  },
  fallback: {
    type: "json",
    content: DOC_ANALYSIS_FALLBACK_JSON,
    description: "Análise documental conservadora em JSON sinalizando material insuficiente.",
  },
};
