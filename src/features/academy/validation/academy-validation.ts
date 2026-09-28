import {
  academyDepths,
  academyGoals,
  academyLanguages,
  academyLevels,
  academyStyles,
  type CreateAcademyStudyInput,
} from "../types";

export type AcademyFieldErrors = Partial<Record<keyof CreateAcademyStudyInput, string>>;

export function validateAcademyStudy(input: CreateAcademyStudyInput) {
  const errors: AcademyFieldErrors = {};
  if (input.topic.trim().length < 2) errors.topic = "Informe um tema com pelo menos 2 caracteres.";
  if (input.subject.trim().length < 2) errors.subject = "Informe uma matéria com pelo menos 2 caracteres.";
  if (!academyLevels.includes(input.level)) errors.level = "Selecione um nível válido.";
  if (!academyGoals.includes(input.goal)) errors.goal = "Selecione um objetivo válido.";
  if (!Number.isFinite(input.duration) || input.duration < 5 || input.duration > 600) errors.duration = "Escolha uma duração entre 5 e 600 minutos.";
  if (!academyLanguages.includes(input.language)) errors.language = "Selecione um idioma válido.";
  if (!academyDepths.includes(input.depth)) errors.depth = "Selecione uma profundidade válida.";
  if (!academyStyles.includes(input.style)) errors.style = "Selecione um estilo válido.";
  return { success: Object.keys(errors).length === 0, errors };
}

export function normalizeAcademyStudyInput(input: CreateAcademyStudyInput): CreateAcademyStudyInput {
  return {
    ...input,
    title: input.title?.trim() || input.topic.trim(),
    topic: input.topic.trim(),
    subject: input.subject.trim(),
    duration: Math.round(input.duration),
  };
}
