import { AIService } from "@/features/ai/AIService";
import type { AIProviderId } from "@/features/ai/AIProvider";
import { prepareNarration } from "./TeacherNarrationService";
import type { TeacherRequest } from "../types";

/**
 * Geração de aula narrada.
 *
 * Reutiliza o AI Core (AIService → ProviderManager) e o TeacherPromptBuilder.
 * Nenhum provider novo é criado: a chamada passa pelo mesmo caminho do Professor.
 */

export type NarratedLessonStep = {
  title: string;
  spoken: string;
  original: string;
  kind: "introduction" | "explanation" | "example" | "exercise" | "correction" | "summary";
  exercisePrompt?: string;
};

export type NarratedLessonPlan = {
  topic: string;
  steps: NarratedLessonStep[];
};

const STEP_KINDS: NarratedLessonStep["kind"][] = [
  "introduction",
  "explanation",
  "example",
  "exercise",
  "correction",
  "summary",
];

function parseSteps(payload: string): { title: string; body: string }[] {
  const steps: { title: string; body: string }[] = [];
  const blocks = payload.split(/\n(?=##\s)/g);
  for (const block of blocks) {
    const match = block.match(/^##\s*(.+?)\n([\s\S]*)$/);
    if (match) {
      steps.push({ title: match[1].trim(), body: match[2].trim() });
      continue;
    }
    if (block.trim()) steps.push({ title: "", body: block.trim() });
  }
  return steps;
}

/**
 * Pede ao Professor um plano de aula em etapas, já com linguagem falada.
 * O modelo responde em Markdown com títulos `##` por etapa.
 */
export async function generateNarratedLessonPlan(input: {
  topic: string;
  context?: string;
  teaching: TeacherRequest;
  steps?: number;
  apiKeys?: Partial<Record<AIProviderId, string>>;
}): Promise<NarratedLessonPlan> {
  const stepCount = input.steps ?? 5;
  const instruction = [
    "Crie um plano de aula NARRAVADA sobre o tema informado.",
    `Gere exatamente ${stepCount} etapas, na ordem: introdução, explicação conceitual, exemplo prático, exercício e resumo.`,
    "Responda apenas em Markdown, com um título `##` por etapa e o texto corrido da etapa abaixo dele.",
    "Escreva em linguagem falada natural, pronta para ser lida em voz alta: sem listas de URLs, sem blocos de código, sem tabelas.",
    "No exercício, termine a etapa com a linha `EXERCICIO:` seguida do enunciado.",
    "Não inclua preâmbulo, numeração de etapas ou comentários fora do conteúdo.",
    input.context ? `Contexto do material recuperado:\n${input.context}` : "",
  ].filter(Boolean).join("\n");

  const response = await AIService.generate({
    history: [],
    message: instruction,
    mode: "automatic",
    stream: false,
    apiKeys: input.apiKeys,
  });

  const parsed = parseSteps(response.text);
  const steps: NarratedLessonStep[] = parsed.slice(0, stepCount).map((step, index) => {
    const kind = STEP_KINDS[Math.min(index, STEP_KINDS.length - 1)];
    const exerciseMatch = step.body.match(/EXERCICIO:\s*(.+)$/im);
    const body = exerciseMatch ? step.body.replace(/EXERCICIO:.*$/im, "").trim() : step.body;
    const narration = prepareNarration(body);
    return {
      title: step.title || `Etapa ${index + 1}`,
      spoken: narration.spokenText || body,
      original: body,
      kind,
      exercisePrompt: exerciseMatch ? exerciseMatch[1].trim() : undefined,
    };
  });

  return { topic: input.topic, steps };
}

/**
 * Gera uma explicação alternativa para a etapa atual, evitando repetir a anterior.
 */
export async function generateAlternativeExplanation(input: {
  topic: string;
  previousExplanation: string;
  teaching: TeacherRequest;
  apiKeys?: Partial<Record<AIProviderId, string>>;
}): Promise<string> {
  const instruction = [
    "Reexplique o conceito atual de uma forma diferente da explicação anterior.",
    "Use uma analogia nova, um exemplo de outra situação ou uma abordagem visual/passos.",
    "Não repita frases da explicação anterior.",
    "Responda apenas com a nova explicação, em linguagem falada natural, pronta para narração.",
    `Tema: ${input.topic}`,
    `Explicação anterior (não repetir):\n${input.previousExplanation.slice(0, 1200)}`,
  ].join("\n");

  const response = await AIService.generate({
    history: [],
    message: instruction,
    mode: "automatic",
    stream: false,
    apiKeys: input.apiKeys,
  });

  return prepareNarration(response.text).spokenText || response.text;
}

/**
 * Pede ao Professor uma correção para a resposta do aluno a um exercício.
 */
export async function generateExerciseCorrection(input: {
  question: string;
  studentAnswer: string;
  teaching: TeacherRequest;
  apiKeys?: Partial<Record<AIProviderId, string>>;
}): Promise<{ spoken: string; correct: boolean }> {
  const instruction = [
    "Corrija a resposta do aluno ao exercício.",
    "Responda em duas partes separadas por uma linha em branco:",
    "Primeiro: `CORRETO:` ou `INCORRETO:` seguido de uma frase curta de veredito.",
    "Depois: a explicação do porquê, com a resposta correta e o conceito envolvido.",
    "Escreva em linguagem falada natural, pronta para narração.",
    `Enunciado: ${input.question}`,
    `Resposta do aluno: ${input.studentAnswer || "(sem resposta)"}`,
  ].join("\n");

  const response = await AIService.generate({
    history: [],
    message: instruction,
    mode: "automatic",
    stream: false,
    apiKeys: input.apiKeys,
  });

  const correct = /CORRETO\s*:/i.test(response.text) && !/INCORRETO\s*:/i.test(response.text);
  return { spoken: prepareNarration(response.text).spokenText || response.text, correct };
}
