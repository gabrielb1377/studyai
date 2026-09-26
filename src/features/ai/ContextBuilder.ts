import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";
import type { TutorStudyContext } from "@/types/tutor-context";

const DEFAULT_MAX_CHARACTERS = 6_000;

const statusLabels = {
  not_started: "Não iniciado",
  in_progress: "Em andamento",
  completed: "Concluído",
};

export const ContextBuilder = {
  fromStudy(context: TutorStudyContext) {
    const blocks = [
      `studyId: ${context.studyId}`,
      `Título: ${context.title}`,
      `Matéria: ${context.subject}`,
      `Tema: ${context.topic}`,
      `Status: ${statusLabels[context.status]}`,
      `Progresso: ${context.progress}%`,
    ];

    if (context.summary) {
      blocks.push(`Resumo salvo (${context.summary.title}):\n${context.summary.content}`);
    }
    if (context.learning) {
      const guidance = context.learning.classification === "difficult"
        ? "Adapte a resposta: explique passo a passo, use exemplos concretos e proponha uma verificação curta."
        : context.learning.classification === "forgotten"
          ? "Adapte a resposta: faça uma retomada breve dos fundamentos antes de avançar."
          : context.learning.classification === "strong"
            ? "Adapte a resposta: seja conciso e proponha conexões ou desafios mais avançados."
            : "Adapte a resposta ao nível atual e confirme a compreensão antes de aprofundar.";
      blocks.push([
        "Perfil de aprendizagem do tema:",
        `Conhecimento estimado: ${context.learning.knowledge}%`,
        `Confiança da estimativa: ${context.learning.confidence}%`,
        `Domínio: ${context.learning.mastery}`,
        `Prioridade: ${context.learning.priority}`,
        `Sinais: ${context.learning.reasons.join("; ")}`,
        guidance,
      ].join("\n"));
    }
    if (context.document) {
      blocks.push([
        "Análise automática do documento:",
        context.document.title ? `Título identificado: ${context.document.title}` : "",
        context.document.subject ? `Disciplina identificada: ${context.document.subject}` : "",
        context.document.topic ? `Tema identificado: ${context.document.topic}` : "",
        context.document.language ? `Idioma: ${context.document.language}` : "",
        context.document.keywords.length > 0 ? `Palavras-chave: ${context.document.keywords.join(", ")}` : "",
        context.document.summaryPreview ? `Resumo inicial: ${context.document.summaryPreview}` : "",
        context.document.chapters.length > 0
          ? `Capítulos: ${context.document.chapters.map((chapter) => chapter.title).join("; ")}`
          : "",
      ].filter(Boolean).join("\n"));
    }
    if (context.knowledge?.matchedConcepts.length) {
      blocks.push([
        "Mapa de conhecimento relevante:",
        ...context.knowledge.matchedConcepts.map((concept) => [
          `- ${concept.name}: ${concept.description}`,
          concept.aliases.length ? `  Equivalentes: ${concept.aliases.join(", ")}` : "",
          concept.relatedConcepts.length ? `  Relacionado a: ${concept.relatedConcepts.join(", ")}` : "",
        ].filter(Boolean).join("\n")),
        `Relações consultadas: ${context.knowledge.relationshipCount}`,
      ].join("\n"));
    }
    if (context.notes.length > 0) {
      blocks.push(
        `Notas do estudante:\n${context.notes.map((note) => `- ${note.title}: ${note.content}`).join("\n")}`,
      );
    }
    if (context.mentor) {
      blocks.push([
        "Continuidade do Mentor:",
        context.mentor.lastSessionStatus ? `Última sessão: ${context.mentor.lastSessionStatus}` : "",
        ...context.mentor.recommendations.map((recommendation) =>
          `- ${recommendation.title} (${recommendation.priority}): ${recommendation.reason}`,
        ),
      ].filter(Boolean).join("\n"));
    }
    return blocks.join("\n");
  },

  fromChunks(chunks: readonly RetrievedChunk[], maxCharacters = DEFAULT_MAX_CHARACTERS) {
    const sections: string[] = [];
    let usedCharacters = 0;

    for (const chunk of chunks) {
      const section = [
        `[Fonte: ${chunk.metadata.sourceName} | trecho ${chunk.chunkIndex + 1} | relevância ${chunk.score}]`,
        chunk.text,
      ].join("\n");
      const separatorLength = sections.length > 0 ? 2 : 0;
      const remaining = maxCharacters - usedCharacters - separatorLength;
      if (remaining <= 0) break;
      const bounded = section.length > remaining
        ? `${section.slice(0, Math.max(remaining - 1, 0))}…`
        : section;
      if (bounded) sections.push(bounded);
      usedCharacters += bounded.length + separatorLength;
    }

    return sections.join("\n\n");
  },
};
