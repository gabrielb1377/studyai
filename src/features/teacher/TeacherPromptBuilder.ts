import type { TutorStudyContext } from "@/types/tutor-context";
import {
  teacherLevelLabels,
  teacherMethodLabels,
  teacherSummaryStyleLabels,
  type TeacherAction,
  type TeacherRequest,
} from "./types";

const actionInstructions: Record<TeacherAction, string> = {
  dialogue: "Responda ao aluno e, quando ele estiver respondendo a um exercício anterior, faça a correção detalhada antes de avançar.",
  guided_lesson: "Conduza uma aula guiada, uma etapa por vez: explicação, pergunta, correção, novo conceito, exercício e resumo. Pare ao final da etapa atual e aguarde o aluno.",
  lesson_plan: "Crie um plano de aula com: objetivo, pré-requisitos, conceitos, exemplos, exercícios, resumo e próxima revisão. Relacione cada item somente ao material recuperado.",
  flowchart: "Gere um fluxograma em um bloco Mermaid `flowchart TD`. Inclua apenas relações sustentadas pelo material e acrescente uma explicação curta após o diagrama.",
  mind_map: "Gere um mapa mental em um bloco Mermaid `mindmap`. Use somente conceitos presentes no contexto e não crie ramificações sem evidência.",
  timeline: "Crie uma linha do tempo apenas se o material possuir ordem cronológica ou sequencial. Caso contrário, explique objetivamente por que esse formato não se aplica, sem inventar datas.",
  exercise: "Proponha um exercício adequado ao tema. Varie entre múltipla escolha, verdadeiro/falso, completar, associação, discursiva, código e estudo de caso. Apresente um exercício por vez e aguarde a resposta.",
  compare: "Compare os conceitos pedidos em uma tabela clara, destacando definição, finalidade, diferenças, semelhanças e um exemplo sustentado pelo contexto.",
  adaptive_summary: "Produza o resumo no formato solicitado, preservando conceitos, relações e ressalvas importantes do material.",
  explain_selection: "Explique prioritariamente o trecho selecionado e use os demais trechos apenas para esclarecer seu contexto. Informe a página ou capítulo quando disponível.",
};

const levelInstructions: Record<TeacherRequest["level"], string> = {
  beginner: "Use linguagem simples, defina termos antes de utilizá-los e dê um exemplo concreto.",
  intermediate: "Conecte fundamentos e aplicação, mantendo precisão sem excesso de jargão.",
  advanced: "Aprofunde relações, limites, exceções e consequências do conceito.",
  technical: "Use terminologia técnica, estrutura formal e detalhes de implementação quando existirem no material.",
  brief: "Seja direto e curto, mantendo apenas o essencial para compreensão e revisão.",
};

const methodInstructions: Record<TeacherRequest["method"], string> = {
  traditional: "Organize como uma aula: introdução, desenvolvimento, exemplo e fechamento.",
  step_by_step: "Avance em passos numerados e verifique a compreensão entre os blocos.",
  analogies: "Use analogias explicitamente marcadas e deixe claro onde elas deixam de representar o conceito.",
  practical_examples: "Priorize aplicações e exemplos coerentes com a matéria atual.",
  questions_and_answers: "Estruture a explicação em perguntas curtas seguidas de respostas objetivas.",
  socratic: "Priorize perguntas que levem o aluno a raciocinar antes de entregar a conclusão.",
  quick_review: "Priorize conceitos-chave, armadilhas comuns e uma verificação final curta.",
};

export const TeacherPromptBuilder = {
  instruction(request: TeacherRequest) {
    const blocks = [
      "Modo Professor ativo.",
      `Nível solicitado: ${teacherLevelLabels[request.level]}. ${levelInstructions[request.level]}`,
      `Método de ensino: ${teacherMethodLabels[request.method]}. ${methodInstructions[request.method]}`,
      actionInstructions[request.action],
      "Use exclusivamente os dados estruturados e os trechos recuperados. Não afirme que leu arquivos físicos.",
      "Quando corrigir uma resposta, mostre: resposta correta, justificativa, conceito relacionado, fonte utilizada e recomendação de revisão.",
      "Ao usar uma fonte, cite o rótulo de fonte recebido no contexto; não invente páginas, capítulos ou referências.",
    ];
    if (request.action === "adaptive_summary") {
      blocks.push(`Formato do resumo: ${teacherSummaryStyleLabels[request.summaryStyle]}.`);
    }
    if (request.selection) {
      const location = [
        request.selection.sourceName,
        request.selection.page ? `página ${request.selection.page}` : undefined,
        request.selection.chapter,
      ].filter(Boolean).join(" · ");
      blocks.push(`Trecho selecionado${location ? ` (${location})` : ""}:\n${request.selection.text}`);
    }
    return blocks.join("\n");
  },

  actionMessage(action: TeacherAction, context?: TutorStudyContext | null, summaryStyle?: TeacherRequest["summaryStyle"]) {
    const topic = context?.topic || context?.title || "o tema atual";
    const messages: Record<TeacherAction, string> = {
      dialogue: "Responda considerando meu nível e o método de ensino selecionado.",
      guided_lesson: `Ensine-me ${topic} em uma sessão guiada. Comece pela primeira etapa e aguarde minha resposta antes de avançar.`,
      lesson_plan: `Crie um plano automático de aula para ${topic}.`,
      flowchart: `Crie um fluxograma dos conceitos e relações centrais de ${topic}.`,
      mind_map: `Crie um mapa mental dos conceitos centrais de ${topic}.`,
      timeline: `Verifique se ${topic} possui uma sequência cronológica ou processual e, quando fizer sentido, crie uma linha do tempo.`,
      exercise: `Proponha um exercício sobre ${topic} e aguarde minha resposta.`,
      compare: `Compare os conceitos centrais e mais relacionados de ${topic}.`,
      adaptive_summary: `Gere um ${teacherSummaryStyleLabels[summaryStyle ?? "medium"].toLocaleLowerCase("pt-BR")} de ${topic}.`,
      explain_selection: "Explique o trecho selecionado com base no contexto do material.",
    };
    return messages[action];
  },
};
