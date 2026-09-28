import { labLanguages, type LabLanguage, type LabProject, type LabReviewRequest } from "../types";

export function isLabLanguage(value: unknown): value is LabLanguage {
  return typeof value === "string" && labLanguages.includes(value as LabLanguage);
}

export function isLabProject(value: unknown): value is LabProject {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<LabProject>;
  return typeof project.id === "string" && typeof project.title === "string" && isLabLanguage(project.language) &&
    Boolean(project.files && typeof project.files === "object") && Boolean(project.exercise && typeof project.exercise === "object") &&
    Boolean(project.terminal && typeof project.terminal === "object") && typeof project.createdAt === "string" && typeof project.updatedAt === "string";
}

export function isLabReviewRequest(value: unknown): value is LabReviewRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<LabReviewRequest>;
  return typeof request.projectId === "string" && request.projectId.length <= 160 && isLabLanguage(request.language) &&
    typeof request.statement === "string" && request.statement.length <= 12_000 &&
    typeof request.answer === "string" && request.answer.length <= 40_000 &&
    typeof request.expectedResult === "string" && request.expectedResult.length <= 12_000 &&
    Array.isArray(request.errors) && request.errors.length <= 20 && request.errors.every((item) => typeof item === "string" && item.length <= 1_000) &&
    Array.isArray(request.context) && request.context.length <= 5 && request.context.every((item) => item && typeof item.sourceName === "string" && typeof item.text === "string" && item.text.length <= 8_000);
}

const forbiddenJavaScript = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|Worker|SharedWorker|importScripts)\b|\bimport\s*\(/;

export function validateExecutableCode(language: LabLanguage, code: string) {
  if (code.length > 40_000) return "O código excede o limite seguro de 40 mil caracteres.";
  if ((language === "javascript" || language === "typescript") && forbiddenJavaScript.test(code)) {
    return "Acesso à rede, workers e imports externos não são permitidos no Laboratório.";
  }
  return undefined;
}
