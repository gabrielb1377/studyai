import {
  labChallengeModalities,
  labLanguages,
  type LabChallengeModality,
  type LabChallengeRequest,
  type LabDifficulty,
  type LabGeneratedChallenge,
  type LabGuidedStep,
  type LabLanguage,
  type LabProject,
  type LabReviewRequest,
} from "../types";
import { DataLabService } from "../services/DataLabService";
import { MathLabService } from "../services/MathLabService";

const labDifficulties: readonly LabDifficulty[] = ["easy", "medium", "hard"];
const challengeLanguageByModality: Record<LabChallengeModality, LabLanguage> = {
  code: "javascript",
  math: "math",
  data: "data",
  sql: "sql",
};

export function modalityToLabLanguage(modality: LabChallengeModality): LabLanguage {
  return challengeLanguageByModality[modality];
}

export function isLabChallengeModality(value: unknown): value is LabChallengeModality {
  return typeof value === "string" && labChallengeModalities.includes(value as LabChallengeModality);
}

export function isLabDifficulty(value: unknown): value is LabDifficulty {
  return typeof value === "string" && labDifficulties.includes(value as LabDifficulty);
}

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

export function isLabChallengeRequest(value: unknown): value is LabChallengeRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<LabChallengeRequest>;
  if (!request.materialId || typeof request.materialId !== "string" || request.materialId.trim().length === 0 || request.materialId.length > 160) {
    return false;
  }
  if (request.studyId !== undefined && (typeof request.studyId !== "string" || request.studyId.trim().length === 0 || request.studyId.length > 160)) {
    return false;
  }
  if (request.materialFileId !== undefined && (typeof request.materialFileId !== "string" || request.materialFileId.trim().length === 0 || request.materialFileId.length > 160)) {
    return false;
  }
  if (typeof request.materialName !== "string" || !request.materialName.trim() || request.materialName.length > 240) {
    return false;
  }
  if (request.subject !== undefined && (typeof request.subject !== "string" || request.subject.length > 200)) return false;
  if (request.topic !== undefined && (typeof request.topic !== "string" || request.topic.length > 200)) return false;
  if (!isLabChallengeModality(request.modality)) return false;
  if (!isLabLanguage(request.language) || request.language !== modalityToLabLanguage(request.modality)) return false;
  if (!isLabDifficulty(request.difficulty)) return false;
  if (typeof request.extractedText !== "string" || request.extractedText.trim().length < 10 || request.extractedText.length > 12_000) {
    return false;
  }
  if (!Array.isArray(request.chunks) || request.chunks.length > 6) return false;
  const expectedFileId = request.materialFileId ?? request.materialId;
  return request.chunks.every((chunk) => {
    if (!chunk || typeof chunk !== "object") return false;
    const item = chunk as Partial<LabChallengeRequest["chunks"][number]>;
    if (typeof item.fileId !== "string" || !item.fileId.trim() || item.fileId.length > 160 || item.fileId !== expectedFileId) {
      return false;
    }
    if (item.studyId !== undefined && typeof item.studyId !== "string") return false;
    if (request.studyId && item.studyId && item.studyId !== request.studyId) return false;
    return typeof item.sourceName === "string" && item.sourceName.trim().length > 0 && item.sourceName.length <= 240 &&
      typeof item.text === "string" && item.text.trim().length > 0 && item.text.length <= 4_000;
  });
}

const forbiddenJavaScript =
  /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|Worker|SharedWorker|importScripts|BroadcastChannel|indexedDB|caches|sendBeacon|cookieStore|WebTransport|RTCPeerConnection|FileSystemSyncAccessHandle|showOpenFilePicker)\b|\bimport\s*\(|\bnavigator\s*\.\s*(?:storage|serviceWorker|credentials|locks|clipboard)\b/;
const forbiddenSql = /\b(?:ATTACH|DETACH|LOAD_EXTENSION)\b/i;
const sqlKeywords = /\b(?:SELECT|CREATE\s+TABLE|INSERT\s+INTO|WITH\s+\w+\s+AS|UPDATE\s+\w+|DELETE\s+FROM)\b/i;
const jsKeywords = /\b(?:function\s+\w+|const\s+\w+\s*=|let\s+\w+\s*=|console\.log\s*\(|=>)\b/;

export function validateExecutableCode(language: LabLanguage, code: string) {
  if (code.length > 40_000) return "O código excede o limite seguro de 40 mil caracteres.";
  if ((language === "javascript" || language === "typescript") && forbiddenJavaScript.test(code)) {
    return "Acesso à rede, workers e imports externos não são permitidos no Laboratório.";
  }
  return undefined;
}

function readRequiredString(record: Record<string, unknown>, key: string, maxLength: number) {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`O campo "${key}" do desafio gerado está ausente ou inválido.`);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new Error(`O campo "${key}" do desafio gerado está vazio ou excede o limite.`);
  }
  return trimmed;
}

function validateGeneratedCodeForModality(modality: LabChallengeModality, starterCode: string, solution: string) {
  const language = modalityToLabLanguage(modality);
  const codeError = validateExecutableCode(language, starterCode) ?? validateExecutableCode(language, solution);
  if (codeError) {
    throw new Error(codeError);
  }

  if (modality === "code") {
    if (sqlKeywords.test(solution) && !jsKeywords.test(solution)) {
      throw new Error("A solução gerada parece SQL em vez de JavaScript.");
    }
    return;
  }

  if (modality === "sql") {
    if (forbiddenSql.test(starterCode) || forbiddenSql.test(solution)) {
      throw new Error("O SQL gerado contém comandos não permitidos no Laboratório.");
    }
    if (!sqlKeywords.test(solution) || jsKeywords.test(solution)) {
      throw new Error("O conteúdo gerado não é uma consulta SQL válida.");
    }
    return;
  }

  if (modality === "math") {
    if (jsKeywords.test(starterCode) || jsKeywords.test(solution) || sqlKeywords.test(solution)) {
      throw new Error("O desafio matemático gerado contém sintaxe incompatível de código ou SQL.");
    }
    const execution = MathLabService.execute(solution);
    if (execution.status !== "success") {
      throw new Error(execution.error || "A solução matemática gerada não é válida para o simulador.");
    }
    return;
  }

  if (modality === "data") {
    if (jsKeywords.test(starterCode) || jsKeywords.test(solution) || sqlKeywords.test(solution)) {
      throw new Error("O desafio de dados gerado contém sintaxe incompatível de código ou SQL.");
    }
    const solutionExecution = DataLabService.execute(solution);
    if (solutionExecution.status !== "success") {
      throw new Error(solutionExecution.error || "Os dados gerados não puderam ser processados pelo Laboratório.");
    }
    const starterExecution = DataLabService.execute(starterCode);
    if (starterExecution.status !== "success") {
      throw new Error(starterExecution.error || "O código inicial de dados não possui formato tabular válido.");
    }
  }
}

export function parseGeneratedLabChallenge(
  text: string,
  expected: { modality: LabChallengeModality; difficulty: LabDifficulty },
  metadata: { provider: string; model: string },
): LabGeneratedChallenge {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("A IA não retornou o desafio no formato JSON esperado.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("A IA retornou um JSON malformado ao gerar o desafio.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("A IA retornou uma estrutura de desafio inválida.");
  }

  const record = parsed as Record<string, unknown>;
  const expectedLanguage = modalityToLabLanguage(expected.modality);

  if (record.modality !== undefined && record.modality !== expected.modality) {
    throw new Error("O desafio retornado pela IA pertence a outra modalidade.");
  }
  if (record.language !== undefined && record.language !== expectedLanguage) {
    throw new Error("O desafio retornado pela IA usa uma linguagem incompatível com o modo escolhido.");
  }

  const title = readRequiredString(record, "title", 180);
  const statement = readRequiredString(record, "statement", 8_000);
  const starterCode = readRequiredString(record, "starterCode", 20_000);
  const expectedResult = readRequiredString(record, "expectedResult", 4_000);
  const solution = readRequiredString(record, "solution", 20_000);
  const explanation = readRequiredString(record, "explanation", 8_000);

  if (record.difficulty !== undefined && !isLabDifficulty(record.difficulty)) {
    throw new Error("A dificuldade retornada pela IA é inválida.");
  }
  const difficulty = isLabDifficulty(record.difficulty) ? record.difficulty : expected.difficulty;

  validateGeneratedCodeForModality(expected.modality, starterCode, solution);

  const hints = Array.isArray(record.hints)
    ? record.hints
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 400))
        .slice(0, 4)
    : [];

  const steps: LabGuidedStep[] = Array.isArray(record.steps)
    ? record.steps
        .map((item, index): LabGuidedStep | null => {
          if (typeof item === "string" && item.trim()) {
            return { id: `step-${index + 1}`, title: item.trim().slice(0, 240), done: false };
          }
          if (item && typeof item === "object") {
            const candidate = item as { id?: unknown; title?: unknown };
            if (typeof candidate.title === "string" && candidate.title.trim()) {
              return {
                id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim().slice(0, 40) : `step-${index + 1}`,
                title: candidate.title.trim().slice(0, 240),
                done: false,
              };
            }
          }
          return null;
        })
        .filter((item): item is LabGuidedStep => Boolean(item))
        .slice(0, 5)
    : [];

  return {
    title,
    statement,
    modality: expected.modality,
    language: expectedLanguage,
    difficulty,
    starterCode,
    expectedResult,
    hints,
    steps,
    solution,
    explanation,
    provider: metadata.provider,
    model: metadata.model,
  };
}
