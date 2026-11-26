/**
 * StudyAI — Intelligence Engine (IE-4D)
 * Especificação pedagógica: explain.multimodal (v0.1.0).
 *
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §2 (#11):
 * - Objetivo: Explicar com diagrama, mapa mental ou roteiro de áudio (ou fallback textual).
 * - Base existente: `diagrams/*`, Mermaid do Teacher, `TeacherAudioLessonService` e `UntrustedDataBoundary`.
 * - Ferramentas (fase): `diagram`, `audio` (estritamente declarativas até Onda 3 / MM-1 / MM-2).
 * - Orçamento inicial: 2.500 entrada / 800 saída.
 *
 * Regras de segurança e integridade (PS-1a / PS-1b):
 * - Nunca declara que imagens binárias, áudio gravado ou diagramas renderizados foram gerados
 *   quando existir apenas especificação textual (`declarativeCapabilitiesOnly: true`).
 * - Quando recursos multimodais não estiverem disponíveis, exige fallback textual explícito.
 * - Bloqueia HTML executável, JavaScript, URLs perigosas e imagens remotas Markdown (`![...](http...)`).
 * - Valida `sourceRefs` contra os chunks efetivamente mantidos após compressão.
 */

import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";
import { validateParsedSourceRefs } from "../pilot/grounding";
import type { SkillSpec, SkillValidationResult } from "../types";

export type MultimodalRepresentationType =
  | "mermaid"
  | "audio_script"
  | "structured_table"
  | "text_fallback";

export interface MultimodalExplainSnapshot {
  readonly topic: string;
  readonly availableModalities: readonly MultimodalRepresentationType[];
  readonly hasMultimodalResource: boolean;
  readonly contextSummary: string;
}

export interface MultimodalComplementaryRepresentation {
  readonly modality: MultimodalRepresentationType;
  readonly status: "specification_only" | "textual_fallback";
  readonly content: string;
  readonly notes?: string;
}

export interface MultimodalExample {
  readonly title: string;
  readonly description: string;
}

export interface ExplainMultimodalOutput {
  readonly topic: string;
  readonly textualExplanation: string;
  readonly complementaryRepresentation: MultimodalComplementaryRepresentation;
  readonly examples: readonly MultimodalExample[];
  readonly sourceRefs: readonly string[];
  /** Sempre true em IE-4: não gera imagens binárias nem áudio real (capacidades declarativas até MM-1/MM-2). */
  readonly declarativeCapabilitiesOnly: boolean;
}

export const EXPLAIN_MULTIMODAL_FALLBACK_JSON = JSON.stringify({
  topic: "Conceito em estudo",
  textualExplanation:
    "Explicação textual simplificada: revise a definição central do conceito, seus componentes principais e um exemplo prático presente no material autorizado.",
  complementaryRepresentation: {
    modality: "text_fallback",
    status: "textual_fallback",
    content: "1. Definição central -> 2. Componentes -> 3. Exemplo aplicado -> 4. Checagem rápida.",
    notes: "Fallback textual seguro utilizado na ausência de recurso visual ou sonoro disponível.",
  },
  examples: [
    {
      title: "Exemplo passo a passo",
      description: "Aplique o conceito a um caso simples descrito no material de estudo.",
    },
  ],
  sourceRefs: ["sem apoio no material"],
  declarativeCapabilitiesOnly: true,
} satisfies ExplainMultimodalOutput);

const DANGEROUS_CONTENT_PATTERN =
  /(<\s*script\b|<\s*iframe\b|<\s*object\b|<\s*embed\b|javascript\s*:|data\s*:\s*text\/html|on(?:error|load|click|mouseover)\s*=|!\[[^\]]*\]\(\s*https?:\/\/)/i;

const MERMAID_HEADER_PATTERN =
  /^\s*(flowchart|graph|sequenceDiagram|mindmap|stateDiagram(?:-v2)?|classDiagram|erDiagram)\b/;

const FALSE_ARTIFACT_GENERATION_CLAIM =
  /\b(imagem\s+(?:gerada|criada|salva)\s+em\s+https?:|[áa]udio\s+(?:mp3|wav)\s+(?:gerado|gravado|dispon[íi]vel)\s+em)\b/i;

/**
 * Adaptador puro (sem efeitos colaterais) que informa à skill quais modalidades
 * declarativas estão disponíveis nesta execução.
 */
export function buildMultimodalExplainSnapshot(input: {
  readonly topic: string;
  readonly availableModalities?: readonly MultimodalRepresentationType[];
}): MultimodalExplainSnapshot {
  const modalities =
    input.availableModalities && input.availableModalities.length > 0
      ? input.availableModalities
      : (["text_fallback"] as const);

  const hasMultimodalResource = modalities.some((m) => m !== "text_fallback");
  const contextSummary = [
    `ExplainMultimodal: topic="${input.topic}", availableModalities=[${modalities.join(", ")}], hasMultimodalResource=${hasMultimodalResource}.`,
    "Restrição IE-4: todas as representações são especificações textuais/declarativas (sem geração real de imagem ou TTS).",
  ].join("\n");

  return {
    topic: input.topic,
    availableModalities: modalities,
    hasMultimodalResource,
    contextSummary,
  };
}

export function validateExplainMultimodalOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: ExplainMultimodalOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as ExplainMultimodalOutput;
  } catch {
    return { valid: false, errors: ["A saída de explain.multimodal não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída de explain.multimodal deve ser um objeto JSON."] };
  }

  if (typeof parsed.topic !== "string" || !parsed.topic.trim()) {
    errors.push("Campo 'topic' deve ser preenchido.");
  }
  if (typeof parsed.textualExplanation !== "string" || parsed.textualExplanation.trim().length < 15) {
    errors.push("Campo 'textualExplanation' deve conter uma explicação textual clara.");
  }
  if (parsed.declarativeCapabilitiesOnly !== true) {
    errors.push("Campo 'declarativeCapabilitiesOnly' deve ser true na fase IE-4 (sem geração real de artefatos).");
  }

  const rep = parsed.complementaryRepresentation;
  const validModalities: MultimodalRepresentationType[] = [
    "mermaid",
    "audio_script",
    "structured_table",
    "text_fallback",
  ];
  if (!rep || typeof rep !== "object") {
    errors.push("Campo 'complementaryRepresentation' é obrigatório.");
  } else {
    if (!validModalities.includes(rep.modality)) {
      errors.push(`Modalidade inválida: "${String(rep.modality)}".`);
    }
    if (rep.status !== "specification_only" && rep.status !== "textual_fallback") {
      errors.push("complementaryRepresentation.status deve ser 'specification_only' ou 'textual_fallback'.");
    }
    if (typeof rep.content !== "string" || !rep.content.trim()) {
      errors.push("complementaryRepresentation.content deve ser preenchido.");
    } else {
      if (rep.modality === "mermaid" && !MERMAID_HEADER_PATTERN.test(rep.content)) {
        errors.push("Representação 'mermaid' deve iniciar com um tipo de diagrama Mermaid válido.");
      }
      if (rep.modality === "text_fallback" && rep.status !== "textual_fallback") {
        errors.push("Representação 'text_fallback' deve usar status='textual_fallback'.");
      }
    }
  }

  if (!Array.isArray(parsed.examples) || parsed.examples.length === 0) {
    errors.push("Campo 'examples' deve conter ao menos um exemplo coerente.");
  } else {
    parsed.examples.forEach((ex, idx) => {
      if (!ex || typeof ex.title !== "string" || !ex.title.trim() || typeof ex.description !== "string" || !ex.description.trim()) {
        errors.push(`examples[${idx}] exige 'title' e 'description'.`);
      }
    });
  }

  if (!Array.isArray(parsed.sourceRefs) || parsed.sourceRefs.length === 0) {
    errors.push("Campo 'sourceRefs' deve listar referências autorizadas ou 'sem apoio no material'.");
  }

  // Varredura PS-1a / PS-1b contra HTML executável, JS, imagens remotas Markdown ou falsa alegação de artefato binário
  const allText = [
    parsed.textualExplanation ?? "",
    rep?.content ?? "",
    rep?.notes ?? "",
    ...(Array.isArray(parsed.examples) ? parsed.examples.map((e) => `${e?.title ?? ""} ${e?.description ?? ""}`) : []),
  ].join("\n");

  if (DANGEROUS_CONTENT_PATTERN.test(allText)) {
    errors.push(
      "Conteúdo bloqueado por segurança (PS-1a/PS-1b): HTML executável, script, URL javascript:/data: ou imagem remota Markdown não são permitidos.",
    );
  }
  if (FALSE_ARTIFACT_GENERATION_CLAIM.test(allText)) {
    errors.push("A skill não pode declarar que gerou imagem/áudio binário hospedado externamente.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validação contextual determinística contra modalidades disponíveis e chunks pós-compressão.
 */
export function validateExplainMultimodalAgainstSnapshot(
  parsed: ExplainMultimodalOutput,
  snapshot: MultimodalExplainSnapshot,
  chunks?: readonly RetrievedChunk[],
): SkillValidationResult {
  const errors: string[] = [];

  const chosen = parsed.complementaryRepresentation.modality;
  if (!snapshot.hasMultimodalResource && chosen !== "text_fallback") {
    errors.push(
      `Nenhum recurso multimodal disponível no contexto; esperado 'text_fallback', recebido '${chosen}'.`,
    );
  } else if (chosen !== "text_fallback" && !snapshot.availableModalities.includes(chosen)) {
    errors.push(
      `Modalidade '${chosen}' não autorizada nas modalidades disponíveis ([${snapshot.availableModalities.join(", ")}]).`,
    );
  }

  const grounding = validateParsedSourceRefs("explain.multimodal", parsed, chunks);
  if (!grounding.valid) {
    errors.push(...grounding.errors);
  }

  return { valid: errors.length === 0, errors };
}

export const explainMultimodalSkillSpec: SkillSpec = {
  id: "explain.multimodal",
  version: "0.1.0",
  objective:
    "Explicar um conceito combinando texto claro, exemplos coerentes e uma especificação complementar compatível (Mermaid, roteiro de áudio, tabela estruturada ou fallback textual), fundamentada no material autorizado.",
  triggers: [
    {
      type: "action",
      value: "explain_multimodal",
      description: "Explicação com representação complementar (diagrama Mermaid, roteiro narrado ou tabela).",
    },
    {
      type: "intent",
      value: "visual_or_audio_explanation",
      description: "Estudante pede uma explicação com diagrama, mapa mental ou roteiro em áudio.",
    },
  ],
  inputs: {
    schema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        preferredModality: { type: "string" },
        multimodalSummary: { type: "string" },
      },
      required: ["topic"],
    },
    required: ["topic"],
  },
  output: {
    type: "json",
    requiredKeys: [
      "topic",
      "textualExplanation",
      "complementaryRepresentation",
      "examples",
      "sourceRefs",
      "declarativeCapabilitiesOnly",
    ],
    formatDescription:
      'JSON estrito: { topic, textualExplanation, complementaryRepresentation: { modality: "mermaid"|"audio_script"|"structured_table"|"text_fallback", status: "specification_only"|"textual_fallback", content, notes? }, examples: [{ title, description }], sourceRefs: string[], declarativeCapabilitiesOnly: true }.',
    validator: validateExplainMultimodalOutput,
  },
  allowedContext: ["study", "chunks", "profile"],
  allowedTools: ["diagram", "audio"],
  tokenBudget: {
    input: 2500,
    output: 800,
  },
  safety: {
    doNotLeakInstructions: true,
    untrustedInputDelimited: true,
    requireSourceGrounding: true,
    forbiddenOutputs: [
      "HTML executável, scripts ou URLs javascript:/data:text/html",
      "imagens remotas Markdown não autorizadas (PS-1a)",
      "alegação falsa de imagem binária ou áudio real gerado",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Combinar explicação textual clara, exemplos coerentes e representação complementar compatível.",
      "Usar fallback textual explícito quando recursos multimodais não estiverem disponíveis.",
      "Nunca declarar geração real de imagem/áudio binário (declarativeCapabilitiesOnly=true).",
      "Bloquear HTML executável, JavaScript, URLs perigosas e imagens remotas Markdown (PS-1a/PS-1b).",
      "Validar sourceRefs contra os chunks efetivamente mantidos após compressão.",
    ],
    maxOutputWords: 500,
    schemaValidation: true,
  },
  fallback: {
    type: "json",
    content: EXPLAIN_MULTIMODAL_FALLBACK_JSON,
    description: "Fallback textual seguro em JSON sem artefatos externos.",
  },
};
