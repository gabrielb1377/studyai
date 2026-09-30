import "server-only";

import { ContextBuilder } from "@/features/ai/ContextBuilder";
import { PromptBuilder } from "@/features/ai/PromptBuilder";
import { TokenCounter } from "@/features/ai/TokenCounter";
import type { AcademyContentKind, AcademyGenerationMode, AcademyGenerationStage, AcademyStudy } from "../types";

const schemas: Record<AcademyGenerationStage, string> = {
  outline: `{
  "title": "string",
  "objective": "string",
  "prerequisites": ["string"],
  "modules": [{ "title": "string", "objective": "string", "estimatedMinutes": 30 }],
  "nextSteps": ["string"]
}`,
  lessons: `{
  "chapters": [{ "title": "string", "objective": "string", "content": "markdown completo", "concepts": ["string"], "examples": ["string"] }],
  "concepts": [{ "name": "string", "description": "string", "relatedTo": ["string"] }],
  "examples": ["string"],
  "summary": "string",
  "review": ["string"]
}`,
  practice: `{
  "exercises": [{ "type": "multiple-choice|true-false|discursive|code|practical", "question": "string", "guidance": "string", "answer": "string", "difficulty": "easy|medium|hard" }],
  "studyPlan": ["string"],
  "flashcards": [{ "question": "string", "answer": "string", "difficulty": "easy|medium|hard" }],
  "quiz": [{ "question": "string", "alternatives": ["a", "b", "c", "d"], "correctAnswer": 0, "explanation": "string", "difficulty": "easy|medium|hard" }],
  "trail": [{ "day": 1, "goal": "string", "lesson": "string", "exercise": "string", "review": "string", "checkpoint": "string opcional" }],
  "project": { "objective": "string", "technologies": ["string"], "requirements": ["string"], "steps": ["string"], "challenges": ["string"], "checklist": ["string"], "completionCriteria": ["string"] }
}`,
};

function stageInstruction(kind: AcademyContentKind, stage: AcademyGenerationStage) {
  if (stage !== "practice") return "";
  if (kind === "learning-path") return "Preencha trail com uma sequência diária coerente. Omita project.";
  if (kind === "practical-project") return "Preencha project com um projeto executável e progressivo. Omita trail.";
  return "Omita trail e project.";
}

export const AcademyPromptBuilder = {
  build({ study, kind, stage, previous }: {
    study: AcademyStudy;
    kind: AcademyContentKind;
    generationMode?: AcademyGenerationMode;
    stage: AcademyGenerationStage;
    previous?: unknown;
  }) {
    const previousContext = previous
      ? TokenCounter.truncate(JSON.stringify(previous), 2_200)
      : "Nenhuma etapa anterior.";
    const question = [
      "Crie conteúdo educacional original, correto e seguro para o Academy do StudyAI.",
      "MODO DE GERAÇÃO LIVRE: use somente as preferências fornecidas abaixo. Não exija, procure ou presuma PDF, materialId, documentId, chunks, Biblioteca ou Knowledge Graph existente.",
      "Responda SOMENTE com JSON válido no schema informado, sem markdown ao redor do JSON.",
      "Não mencione arquivos, PDFs ou fontes que não foram fornecidos. Não invente credenciais, links ou referências.",
      "Use conteúdo suficiente para estudo, respeitando o nível, a duração e a profundidade pedidos.",
      "Contexto do estudo:",
      ContextBuilder.fromAcademy(study, kind),
      "Etapas anteriores (use para manter consistência e não repetir conteúdo):",
      previousContext,
      `Etapa atual: ${stage}`,
      stageInstruction(kind, stage),
      "Schema obrigatório:",
      schemas[stage],
    ].filter(Boolean).join("\n\n");
    return PromptBuilder.contextual({ question, history: [] });
  },
};
