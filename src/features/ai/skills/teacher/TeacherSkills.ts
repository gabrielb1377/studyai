/**
 * StudyAI — Intelligence Engine (IE-1)
 * Migração das 13 ações do Teacher para SkillSpecs com paridade estrita.
 * 
 * Conforme STUDYAI_INTELLIGENCE_ENGINE.md e STUDYAI_EDUCATIONAL_SKILLS.md:
 * - Ações, níveis e métodos atuais são migrados para SkillSpec preservando o texto exato.
 * - Nada de segundo motor paralelo.
 * - As 13 ações possuem id canônico `teacher.<action>` e versão `1.0.0`.
 */

import type { TutorStudyContext } from "@/types/tutor-context";
import {
  teacherLevelLabels,
  teacherMethodLabels,
  teacherSummaryStyleLabels,
  type TeacherAction,
  type TeacherRequest,
} from "@/features/teacher/types";
import type { SkillRegistryImpl } from "../SkillRegistry";
import type { SkillContextType, SkillOutput, SkillSpec, SkillToolName } from "../types";

export const ACTION_INSTRUCTIONS: Record<TeacherAction, string> = {
  dialogue: "Responda ao aluno e, quando ele estiver respondendo a um exercício anterior, faça a correção detalhada antes de avançar.",
  guided_lesson: "Conduza uma aula guiada, uma etapa por vez: explicação, pergunta, correção, novo conceito, exercício e resumo. Pare ao final da etapa atual e aguarde o aluno.",
  lesson_plan: "Crie um plano de aula com: objetivo, pré-requisitos, conceitos, exemplos, exercícios, resumo e próxima revisão. Relacione cada item somente ao material recuperado.",
  flowchart: "Gere um fluxograma em um bloco Mermaid `flowchart TD`. Inclua apenas relações sustentadas pelo material e acrescente uma explicação curta após o diagrama.",
  mind_map: "Gere um mapa mental em um bloco Mermaid `mindmap`. Use somente conceitos presentes no contexto e não crie ramificações sem evidência.",
  timeline: "Crie uma linha do tempo apenas se o material possuir ordem cronológica ou sequencial. Caso contrário, explique objetivamente por que esse formato não se aplica, sem inventar datas.",
  exercise: "Proponha um exercício gradual adequado ao tema e ao nível do estudante. Comece por fixação conceitual (etapa 1: fácil), avance para aplicação (etapa 2: médio) e depois análise/síntese (etapa 3+: difícil), ajustando conforme acertos e erros pendentes. Varie entre múltipla escolha, verdadeiro/falso, completar, associação, discursiva, código e estudo de caso. Apresente um exercício por vez e aguarde a resposta.",
  compare: "Compare os conceitos pedidos em uma tabela clara, destacando definição, finalidade, diferenças, semelhanças e um exemplo sustentado pelo contexto.",
  adaptive_summary: "Produza o resumo no formato solicitado, preservando conceitos, relações e ressalvas importantes do material.",
  explain_selection: "Explique prioritariamente o trecho selecionado e use os demais trechos apenas para esclarecer seu contexto. Informe a página ou capítulo quando disponível.",
  audio_lesson: "Conduza uma aula narrada completa sobre o tema. Estruture em etapas: 1) Introdução e objetivos, 2) Explicação conceitual clara, 3) Exemplos práticos do material, 4) Exercício proposto, 5) Correção e feedback, 6) Resumo e próxima etapa. Pare em cada etapa e aguarde confirmação do aluno antes de avançar. Use linguagem natural para narração: evite markdown excessivo, não leia URLs, explique fórmulas de forma compreensível.",
  voice_question: "O aluno fez uma pergunta por voz durante a aula narrada. Responda de forma direta e clara, usando o contexto da aula atual. Se a pergunta estiver fora do escopo da aula atual, diga que abordará depois e foque no tema da aula. Use linguagem natural para narração.",
  explain_differently: "O aluno pediu para explicar o conceito atual de outra forma. Use analogias diferentes, exemplos práticos distintos, ou uma abordagem mais visual/passo a passo. Não repita a explicação anterior. Identifique onde o aluno pode ter travado e foque nesse ponto. Use linguagem natural para narração.",
};

export const LEVEL_INSTRUCTIONS: Record<TeacherRequest["level"], string> = {
  beginner: "Use linguagem simples, defina termos antes de utilizá-los e dê um exemplo concreto.",
  intermediate: "Conecte fundamentos e aplicação, mantendo precisão sem excesso de jargão.",
  advanced: "Aprofunde relações, limites, exceções e consequências do conceito.",
  technical: "Use terminologia técnica, estrutura formal e detalhes de implementação quando existirem no material.",
  brief: "Seja direto e curto, mantendo apenas o essencial para compreensão e revisão.",
};

export const METHOD_INSTRUCTIONS: Record<TeacherRequest["method"], string> = {
  traditional: "Organize como uma aula: introdução, desenvolvimento, exemplo e fechamento.",
  step_by_step: "Avance em passos numerados e verifique a compreensão entre os blocos.",
  analogies: "Use analogias explicitamente marcadas e deixe claro onde elas deixam de representar o conceito.",
  practical_examples: "Priorize aplicações e exemplos coerentes com a matéria atual.",
  questions_and_answers: "Estruture a explicação em perguntas curtas seguidas de respostas objetivas.",
  socratic: "Priorize perguntas que levem o aluno a raciocinar antes de entregar a conclusão.",
  quick_review: "Priorize conceitos-chave, armadilhas comuns e uma verificação final curta.",
};

const ACTION_OBJECTIVES: Record<TeacherAction, string> = {
  dialogue: "Dialogar com o aluno mantendo progressão e corrigindo exercícios anteriores.",
  guided_lesson: "Conduzir aula guiada passo a passo com verificação de compreensão.",
  lesson_plan: "Gerar plano estruturado de aula a partir do material recuperado.",
  flowchart: "Gerar fluxograma conceitual em Mermaid com relações do material.",
  mind_map: "Gerar mapa mental conceitual em Mermaid com relações do material.",
  timeline: "Gerar linha do tempo cronológica/sequencial sustentada no material.",
  exercise: "Propor exercício gradual com adaptação por etapas de fixação a análise.",
  compare: "Comparar conceitos centrais em tabela analítica com exemplos do material.",
  adaptive_summary: "Produzir resumo no formato solicitado fiel aos trechos recuperados.",
  explain_selection: "Explicar prioritariamente o trecho selecionado no contexto do material.",
  audio_lesson: "Conduzir aula narrada por etapas com confirmação e linguagem falada.",
  voice_question: "Responder dúvida de voz no contexto da aula narrada.",
  explain_differently: "Reexplicar conceito com nova abordagem para destravar compreensão.",
};

function getActionTools(action: TeacherAction): readonly SkillToolName[] {
  switch (action) {
    case "flowchart":
    case "mind_map":
      return ["library", "diagram"];
    case "audio_lesson":
    case "voice_question":
      return ["library", "audio"];
    case "exercise":
      return ["library", "quiz"];
    case "lesson_plan":
      return ["library", "plan"];
    default:
      return ["library"];
  }
}

function getActionOutput(action: TeacherAction): SkillOutput {
  if (action === "flowchart" || action === "mind_map") {
    return {
      type: "mermaid",
      formatDescription: "Bloco Mermaid válido iniciando com o tipo de diagrama.",
    };
  }
  return {
    type: "text",
    formatDescription: "Texto explicativo estruturado e fundamentado no material.",
  };
}

/**
 * Constrói a instrução padrão de uma ação do Teacher com paridade estrita.
 */
export function buildTeacherInstruction(
  request: TeacherRequest,
  options: { omitSelection?: boolean } = {},
): string {
  const blocks = [
    "Modo Professor ativo.",
    `Nível solicitado: ${teacherLevelLabels[request.level]}. ${LEVEL_INSTRUCTIONS[request.level]}`,
    `Método de ensino: ${teacherMethodLabels[request.method]}. ${METHOD_INSTRUCTIONS[request.method]}`,
    ACTION_INSTRUCTIONS[request.action],
    "Use exclusivamente os dados estruturados e os trechos recuperados. Não afirme que leu arquivos físicos.",
    "Quando corrigir uma resposta, mostre: resposta correta, justificativa, conceito relacionado, fonte utilizada e recomendação de revisão.",
    "Ao usar uma fonte, cite o rótulo de fonte recebido no contexto; não invente páginas, capítulos ou referências.",
  ];
  if (request.action === "exercise" && request.exerciseStage) {
    const stage = request.exerciseStage;
    const stageGuidance =
      stage === 1
        ? "Progressão gradual — Etapa 1 (fácil/fixação): verifique compreensão básica antes de aumentar a complexidade."
        : stage === 2
          ? "Progressão gradual — Etapa 2 (médio/aplicação): exija aplicação do conceito em cenário concreto."
          : `Progressão gradual — Etapa ${stage} (difícil/análise): proponha problema de síntese, comparação ou caso complexo.`;
    blocks.push(stageGuidance);
  }
  if (request.action === "adaptive_summary") {
    blocks.push(`Formato do resumo: ${teacherSummaryStyleLabels[request.summaryStyle]}.`);
  }
  if (request.action === "audio_lesson") {
    blocks.push(
      `Preferências de áudio: voz "${request.voice ?? "padrão"}", velocidade ${request.rate}x, reprodução automática ${request.autoplay ? "ligada" : "desligada"}.`,
    );
  }
  if (request.selection && !options.omitSelection) {
    const location = [
      request.selection.sourceName,
      request.selection.page ? `página ${request.selection.page}` : undefined,
      request.selection.chapter,
    ]
      .filter(Boolean)
      .join(" · ");
    blocks.push(`Trecho selecionado${location ? ` (${location})` : ""}:\n${request.selection.text}`);
  }
  return blocks.join("\n");
}

/**
 * Constrói a mensagem padrão de ação disparada pelo usuário.
 */
export function buildTeacherActionMessage(
  action: TeacherAction,
  context?: TutorStudyContext | null,
  summaryStyle?: TeacherRequest["summaryStyle"],
  exerciseStage?: number,
): string {
  const topic = context?.topic || context?.title || "o tema atual";
  const messages: Record<TeacherAction, string> = {
    dialogue: "Responda considerando meu nível e o método de ensino selecionado.",
    guided_lesson: `Ensine-me ${topic} em uma sessão guiada. Comece pela primeira etapa e aguarde minha resposta antes de avançar.`,
    lesson_plan: `Crie um plano automático de aula para ${topic}.`,
    flowchart: `Crie um fluxograma dos conceitos e relações centrais de ${topic}.`,
    mind_map: `Crie um mapa mental dos conceitos centrais de ${topic}.`,
    timeline: `Verifique se ${topic} possui uma sequência cronológica ou processual e, quando fizer sentido, crie uma linha do tempo.`,
    exercise: exerciseStage
      ? `Proponha um exercício gradual (etapa ${exerciseStage}) sobre ${topic} e aguarde minha resposta.`
      : `Proponha um exercício sobre ${topic} e aguarde minha resposta.`,
    compare: `Compare os conceitos centrais e mais relacionados de ${topic}.`,
    adaptive_summary: `Gere um ${teacherSummaryStyleLabels[summaryStyle ?? "medium"].toLocaleLowerCase("pt-BR")} de ${topic}.`,
    explain_selection: "Explique o trecho selecionado com base no contexto do material.",
    audio_lesson: `Inicie uma aula narrada completa sobre ${topic}. Comece pela introdução e pelo objetivo da aula, depois prossiga etapa por etapa aguardando minha confirmação para avançar.`,
    voice_question: "Tenho uma dúvida sobre o que você acabou de explicar. Por favor, esclareça.",
    explain_differently: "Não entendi completamente. Poderia explicar de outra forma, com uma analogia ou exemplo diferente?",
  };
  return messages[action];
}

/**
 * Cria a especificação SkillSpec para uma ação do Teacher.
 */
export function createTeacherSkillSpec(action: TeacherAction): SkillSpec {
  const allowedContext: SkillContextType[] = ["study", "chunks", "selection", "errors", "history"];
  const allowedTools = getActionTools(action);
  const output = getActionOutput(action);

  return {
    id: `teacher.${action}`,
    version: "1.0.0",
    objective: ACTION_OBJECTIVES[action],
    triggers: [
      {
        type: "action",
        value: action,
        description: `Disparado quando a ação "${action}" é selecionada na interface do Professor.`,
      },
    ],
    inputs: {
      schema: {
        type: "object",
        properties: {
          mode: { const: "teacher" },
          action: { const: action },
          level: { type: "string" },
          method: { type: "string" },
        },
        required: ["mode", "action", "level", "method"],
      },
      required: ["mode", "action", "level", "method"],
    },
    allowedContext,
    allowedTools,
    output,
    tokenBudget: {
      input: 2500,
      output: 800,
    },
    safety: {
      doNotLeakInstructions: true,
      untrustedInputDelimited: true,
      requireSourceGrounding: true,
      forbiddenOutputs: ["afirmações de ter lido arquivos físicos do sistema operacional"],
    },
    qualityCriteria: {
      criteria: [
        "Aderência ao nível e método pedagógico selecionado",
        "Respeito aos limites do material recuperado",
        "Citação fiel de fonte e página quando disponível",
      ],
      maxOutputWords: 1500,
      schemaValidation: true,
    },
    fallback: {
      type: "text",
      content: "Não foi possível concluir a ação pedagógica solicitada com o formato esperado. Consulte o material ou tente formular a pergunta de outra forma.",
      description: "Fallback seguro padrão para a ação pedagógica.",
    },
    buildInstruction: (params: unknown) => {
      const p = params as { request: TeacherRequest; options?: { omitSelection?: boolean } };
      return buildTeacherInstruction(p.request, p.options);
    },
    buildActionMessage: (params: unknown) => {
      const p = (params || {}) as {
        context?: TutorStudyContext | null;
        summaryStyle?: TeacherRequest["summaryStyle"];
        exerciseStage?: number;
      };
      return buildTeacherActionMessage(action, p.context, p.summaryStyle, p.exerciseStage);
    },
  };
}

/**
 * Registra todas as 13 skills pedagógicas do Teacher no registro.
 */
export function registerTeacherSkills(registry: SkillRegistryImpl): void {
  const actions: TeacherAction[] = [
    "dialogue",
    "guided_lesson",
    "lesson_plan",
    "flowchart",
    "mind_map",
    "timeline",
    "exercise",
    "compare",
    "adaptive_summary",
    "explain_selection",
    "audio_lesson",
    "voice_question",
    "explain_differently",
  ];

  for (const action of actions) {
    const spec = createTeacherSkillSpec(action);
    if (!registry.has(spec.id, spec.version)) {
      registry.register(spec);
    }
  }
}
