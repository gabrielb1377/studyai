import "server-only";

import type { TutorStudyContext } from "@/types/tutor-context";

const statusLabels = {
  not_started: "Não iniciado",
  in_progress: "Em andamento",
  completed: "Concluído",
};

export const PromptBuilder = {
  build(message: string, context?: TutorStudyContext | null) {
    if (!context) return message;
    const contextBlocks = [
      `studyId: ${context.studyId}`,
      `Título: ${context.title}`,
      `Matéria: ${context.subject}`,
      `Tema: ${context.topic}`,
      `Status: ${statusLabels[context.status]}`,
      `Progresso: ${context.progress}%`,
    ];

    if (context.summary) {
      contextBlocks.push(
        `Resumo salvo (${context.summary.title}):\n${context.summary.content}`,
      );
    }

    if (context.notes.length > 0) {
      contextBlocks.push(
        `Notas do estudante:\n${context.notes
          .map((note) => `- ${note.title}: ${note.content}`)
          .join("\n")}`,
      );
    }

    return [
      "Use o contexto de estudo abaixo quando ele for relevante para responder.",
      "Não invente informações ausentes e responda normalmente se a pergunta não depender do contexto.",
      "",
      "Contexto atual:",
      contextBlocks.join("\n"),
      "",
      `Pergunta do usuário: ${message}`,
    ].join("\n");
  },
};
