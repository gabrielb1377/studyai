/**
 * StudyAI — Intelligence Engine (IE-4E)
 * Especificação pedagógica: audio.learning (v0.1.0).
 *
 * Conforme STUDYAI_EDUCATIONAL_SKILLS.md §2 (#15):
 * - Objetivo: Aula curta em áudio com perguntas.
 * - Base existente: `teacher/services/TeacherAudioLessonService.ts` (`NarratedLessonPlan`, `NarratedLessonStep`),
 *   `teacher/services/TeacherNarrationService.ts` (`prepareNarrationText`, `isNarratable`), `voice/*`.
 * - Ferramentas (fase): `audio` (estritamente declarativo até Onda 3 / MM-1 / MM-2).
 * - Orçamento inicial: 2.500 entrada / 900 saída.
 *
 * Regras de segurança e paridade:
 * - Nunca inicia síntese TTS real, microfone, reconhecimento de voz ou gravação de arquivos de áudio.
 * - Nunca declara que áudio foi sintetizado quando existe somente um roteiro (`audioSynthesized: false`).
 * - Diferencia explicitamente estimativa de duração (`durationBasis: "estimated_from_script"`) de duração medida.
 * - Valida `sourceRefs` contra os chunks efetivamente mantidos após compressão.
 */

import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";
import type { NarratedLessonStep } from "@/features/teacher/services/TeacherAudioLessonService";
import { isNarratable, prepareNarrationText } from "@/features/teacher/services/TeacherNarrationService";
import { validateParsedSourceRefs } from "../pilot/grounding";
import type { SkillSpec, SkillValidationResult } from "../types";

export type AudioLessonStepKind = NarratedLessonStep["kind"];

const VALID_STEP_KINDS: readonly AudioLessonStepKind[] = [
  "introduction",
  "explanation",
  "example",
  "exercise",
  "correction",
  "summary",
];

export interface AudioLearningSnapshot {
  readonly topic: string;
  readonly level: "beginner" | "intermediate" | "advanced";
  readonly hasMaterial: boolean;
  readonly targetDurationMinutes: number;
  readonly contextSummary: string;
}

export interface AudioComprehensionQuestion {
  readonly question: string;
  readonly expectedKeyPoints: readonly string[];
}

export interface AudioLearningOutput {
  readonly topic: string;
  readonly level: "beginner" | "intermediate" | "advanced";
  readonly status: "ready" | "insufficient_material";
  readonly steps: readonly NarratedLessonStep[];
  readonly comprehensionQuestions: readonly AudioComprehensionQuestion[];
  readonly estimatedDurationMinutes: number;
  /** Diferencia explicitamente duração estimada a partir do roteiro de duração efetivamente medida. */
  readonly durationBasis: "estimated_from_script";
  /** Sempre false na Onda 2: apenas roteiro textual narrável, sem síntese TTS real. */
  readonly audioSynthesized: boolean;
  readonly sourceRefs: readonly string[];
}

export const AUDIO_LEARNING_FALLBACK_JSON = JSON.stringify({
  topic: "Tema em estudo",
  level: "beginner",
  status: "insufficient_material",
  steps: [
    {
      title: "Abertura",
      kind: "introduction",
      spoken: "Ainda não há trechos suficientes do material autorizado para montar uma aula narrada completa sobre este tema.",
      original: "Material insuficiente para aula narrada fundamentada.",
    },
    {
      title: "Próximo passo",
      kind: "summary",
      spoken: "Selecione um material ou capítulo do seu estudo para gerar um roteiro narrativo fundamentado com perguntas de verificação.",
      original: "Selecione material de apoio antes de gerar o roteiro.",
    },
  ],
  comprehensionQuestions: [
    {
      question: "Qual conceito principal do material você gostaria de revisar primeiro?",
      expectedKeyPoints: ["Identificação do tópico central a partir do material autorizado."],
    },
  ],
  estimatedDurationMinutes: 1,
  durationBasis: "estimated_from_script",
  audioSynthesized: false,
  sourceRefs: ["sem apoio no material"],
} satisfies AudioLearningOutput);

const FALSE_SYNTHESIS_CLAIM =
  /\b([áa]udio\s+(?:mp3|wav|ogg)\s+(?:gerado|sintetizado|gravado|pronto\s+para\s+download)|arquivo\s+de\s+[áa]udio\s+criado|dura[cç][aã]o\s+medida\s+no\s+player)\b/i;

/**
 * Adaptador puro (sem efeitos colaterais) que prepara o snapshot da aula narrada
 * sem acionar TTS, microfone ou APIs externas.
 */
export function buildAudioLearningSnapshot(input: {
  readonly topic: string;
  readonly level?: "beginner" | "intermediate" | "advanced";
  readonly chunks?: readonly RetrievedChunk[];
  readonly targetDurationMinutes?: number;
}): AudioLearningSnapshot {
  const level = input.level ?? "intermediate";
  const chunks = input.chunks ?? [];
  const hasMaterial = chunks.some((c) => isNarratable(c.text));
  const targetDurationMinutes = Math.max(1, Math.min(15, Math.round(input.targetDurationMinutes ?? 4)));

  const contextSummary = [
    `AudioLearning: topic="${input.topic}", level=${level}, hasMaterial=${hasMaterial}, targetDurationMinutes=${targetDurationMinutes} (estimativa).`,
    "Restrição IE-4E: gerar somente roteiro textual narrável (audioSynthesized=false, durationBasis=estimated_from_script).",
  ].join("\n");

  return {
    topic: input.topic,
    level,
    hasMaterial,
    targetDurationMinutes,
    contextSummary,
  };
}

export function validateAudioLearningOutput(outputStr: string): SkillValidationResult {
  const errors: string[] = [];
  let parsed: AudioLearningOutput | null = null;
  try {
    const rawMatch = outputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = rawMatch && rawMatch[1] ? rawMatch[1].trim() : outputStr.trim();
    parsed = JSON.parse(jsonStr) as AudioLearningOutput;
  } catch {
    return { valid: false, errors: ["A saída de audio.learning não é um JSON válido."] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, errors: ["A saída de audio.learning deve ser um objeto JSON."] };
  }

  if (typeof parsed.topic !== "string" || !parsed.topic.trim()) {
    errors.push("Campo 'topic' deve ser preenchido.");
  }
  if (parsed.level !== "beginner" && parsed.level !== "intermediate" && parsed.level !== "advanced") {
    errors.push("Campo 'level' deve ser 'beginner', 'intermediate' ou 'advanced'.");
  }
  if (parsed.status !== "ready" && parsed.status !== "insufficient_material") {
    errors.push("Campo 'status' deve ser 'ready' ou 'insufficient_material'.");
  }
  if (parsed.audioSynthesized !== false) {
    errors.push("Campo 'audioSynthesized' deve ser false (apenas roteiro narrativo na Onda 2).");
  }
  if (parsed.durationBasis !== "estimated_from_script") {
    errors.push("Campo 'durationBasis' deve ser 'estimated_from_script'.");
  }
  if (typeof parsed.estimatedDurationMinutes !== "number" || parsed.estimatedDurationMinutes <= 0 || parsed.estimatedDurationMinutes > 30) {
    errors.push("Campo 'estimatedDurationMinutes' deve ser um número positivo (<= 30).");
  }

  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    errors.push("Campo 'steps' deve conter ao menos uma etapa de aula narrada.");
  } else {
    parsed.steps.forEach((step, idx) => {
      if (!step || typeof step.title !== "string" || !step.title.trim()) {
        errors.push(`steps[${idx}] exige 'title'.`);
      }
      if (!step || !VALID_STEP_KINDS.includes(step.kind)) {
        errors.push(`steps[${idx}].kind inválido: "${String(step?.kind)}".`);
      }
      if (!step || typeof step.spoken !== "string" || !isNarratable(step.spoken)) {
        errors.push(`steps[${idx}].spoken deve conter texto narrável válido.`);
      }
      if (!step || typeof step.original !== "string" || !step.original.trim()) {
        errors.push(`steps[${idx}] exige 'original'.`);
      }
    });
    if (parsed.status === "ready" && parsed.steps.length < 3) {
      errors.push("Roteiro com status='ready' deve conter sequência pedagógica progressiva (mínimo 3 etapas).");
    }
  }

  if (!Array.isArray(parsed.comprehensionQuestions) || parsed.comprehensionQuestions.length === 0) {
    errors.push("Campo 'comprehensionQuestions' deve conter ao menos uma pergunta de verificação.");
  } else {
    parsed.comprehensionQuestions.forEach((q, idx) => {
      if (!q || typeof q.question !== "string" || !q.question.trim()) {
        errors.push(`comprehensionQuestions[${idx}] exige 'question'.`);
      }
      if (!Array.isArray(q?.expectedKeyPoints) || q.expectedKeyPoints.length === 0) {
        errors.push(`comprehensionQuestions[${idx}] exige 'expectedKeyPoints'.`);
      }
    });
  }

  if (!Array.isArray(parsed.sourceRefs) || parsed.sourceRefs.length === 0) {
    errors.push("Campo 'sourceRefs' deve informar referências autorizadas ou 'sem apoio no material'.");
  }

  const allSpoken = Array.isArray(parsed.steps)
    ? parsed.steps.map((s) => `${prepareNarrationText(s?.spoken ?? "")} ${s?.original ?? ""}`).join(" ")
    : "";
  if (FALSE_SYNTHESIS_CLAIM.test(allSpoken)) {
    errors.push("O roteiro não pode alegar que áudio MP3/WAV foi sintetizado ou medido em player.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validação contextual determinística contra snapshot e chunks pós-compressão.
 */
export function validateAudioLearningAgainstSnapshot(
  parsed: AudioLearningOutput,
  snapshot: AudioLearningSnapshot,
  chunks?: readonly RetrievedChunk[],
): SkillValidationResult {
  const errors: string[] = [];

  if (!snapshot.hasMaterial && parsed.status === "ready") {
    errors.push("Sem material narrável autorizado, 'status' deve ser 'insufficient_material'.");
  }
  if (parsed.level !== snapshot.level) {
    errors.push(`Divergência em 'level': esperado "${snapshot.level}", recebido "${parsed.level}".`);
  }

  const grounding = validateParsedSourceRefs("audio.learning", parsed, chunks);
  if (!grounding.valid) {
    errors.push(...grounding.errors);
  }

  return { valid: errors.length === 0, errors };
}

export const audioLearningSkillSpec: SkillSpec = {
  id: "audio.learning",
  version: "0.1.0",
  objective:
    "Produzir roteiro estruturado de aula curta em áudio compatível com NarratedLessonPlan/NarratedLessonStep, com explicações progressivas, exemplos e perguntas de compreensão fundamentadas no material.",
  triggers: [
    {
      type: "action",
      value: "audio_lesson",
      description: "Geração de roteiro de aula curta narrada com perguntas de verificação.",
    },
    {
      type: "intent",
      value: "listen_short_lesson",
      description: "Estudante solicita uma explicação em formato de aula curta para ouvir.",
    },
  ],
  inputs: {
    schema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        level: { type: "string" },
        targetDurationMinutes: { type: "number" },
        audioSummary: { type: "string" },
      },
      required: ["topic"],
    },
    required: ["topic"],
  },
  output: {
    type: "json",
    requiredKeys: [
      "topic",
      "level",
      "status",
      "steps",
      "comprehensionQuestions",
      "estimatedDurationMinutes",
      "durationBasis",
      "audioSynthesized",
      "sourceRefs",
    ],
    formatDescription:
      'JSON estrito: { topic, level, status: "ready"|"insufficient_material", steps: [{ title, kind, spoken, original, exercisePrompt? }], comprehensionQuestions: [{ question, expectedKeyPoints }], estimatedDurationMinutes, durationBasis: "estimated_from_script", audioSynthesized: false, sourceRefs }.',
    validator: validateAudioLearningOutput,
  },
  allowedContext: ["study", "chunks", "profile"],
  allowedTools: ["audio"],
  tokenBudget: {
    input: 2500,
    output: 900,
  },
  safety: {
    doNotLeakInstructions: true,
    untrustedInputDelimited: true,
    requireSourceGrounding: true,
    forbiddenOutputs: [
      "alegação falsa de áudio MP3/WAV sintetizado ou medido em player",
      "referências ausentes dos trechos autorizados pós-compressão",
    ],
  },
  qualityCriteria: {
    criteria: [
      "Preservar o contrato legado NarratedLessonStep (title, kind, spoken, original).",
      "Diferenciar estimativa de duração (estimated_from_script) de duração medida.",
      "Nunca alegar síntese real de áudio (audioSynthesized=false).",
      "Validar sourceRefs contra os chunks efetivamente mantidos após compressão.",
    ],
    maxOutputWords: 600,
    schemaValidation: true,
  },
  fallback: {
    type: "json",
    content: AUDIO_LEARNING_FALLBACK_JSON,
    description: "Roteiro conservador em JSON sinalizando material insuficiente sem síntese de áudio.",
  },
};
