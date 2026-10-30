/**
 * AI Quality Lab — Infraestrutura de avaliação determinística + opcional LLM-as-judge.
 *
 * Inspirado em DeepEval (conceitos), adaptado para TypeScript nativo.
 * Não executa avaliações pagas automaticamente.
 */

export type QualityCriterion =
  | "fidelity"
  | "relevance"
  | "citations"
  | "no-context"
  | "pedagogical"
  | "exercise-correction"
  | "language-consistency"
  | "provider-error-handling";

export type EvaluationMode = "deterministic" | "llm-judge";

export interface EvaluationCase {
  id: string;
  name: string;
  question: string;
  sourceMaterial: string;
  expectedAnswer: string;
  expectedCitations?: string[]; // trechos esperados na resposta
  expectedPageRefs?: number[]; // páginas esperadas
  criteria: QualityCriterion[];
  metadata?: Record<string, unknown>;
}

export interface EvaluationResult {
  caseId: string;
  criterion: QualityCriterion;
  passed: boolean;
  score: number; // 0-1 (determinístico) ou 0-10 (LLM judge)
  reasoning: string;
  details?: Record<string, unknown>;
  mode: EvaluationMode;
  timestamp: string;
}

export interface EvaluationSuite {
  id: string;
  name: string;
  cases: EvaluationCase[];
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationRun {
  id: string;
  suiteId: string;
  mode: EvaluationMode;
  results: EvaluationResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    averageScore: number;
  };
  startedAt: string;
  completedAt?: string;
  provider?: string; // provider usado para LLM judge
  model?: string;
}

export interface LLMJudgeConfig {
  provider: "gemini" | "groq" | "openrouter" | "ollama";
  model: string;
  apiKey?: string; // BYOK do usuário
  temperature: number;
  maxTokens: number;
}

export const DEFAULT_CRITERIA: QualityCriterion[] = [
  "fidelity",
  "relevance",
  "citations",
  "no-context",
  "pedagogical",
];

export const CRITERION_LABELS: Record<QualityCriterion, string> = {
  fidelity: "Fidelidade ao material",
  relevance: "Relevância da resposta",
  citations: "Citações corretas (página/trecho)",
  "no-context": "Resposta sem contexto suficiente",
  pedagogical: "Qualidade pedagógica",
  "exercise-correction": "Correção de exercícios",
  "language-consistency": "Consistência de idioma",
  "provider-error-handling": "Tratamento de erros de providers",
};

export const CRITERION_DESCRIPTIONS: Record<QualityCriterion, string> = {
  fidelity: "A resposta contém apenas informações presentes no material-fonte, sem alucinações.",
  relevance: "A resposta aborda diretamente a pergunta feita pelo usuário.",
  citations: "A resposta cita trechos e páginas do material-fonte quando apropriado.",
  "no-context": "Quando o material não contém a resposta, o sistema admite limitação em vez de inventar.",
  pedagogical: "A explicação é didática, estruturada e adequada ao nível do aluno.",
  "exercise-correction": "Correções de exercícios incluem justificativa, conceito e revisão.",
  "language-consistency": "O idioma da resposta corresponde ao idioma da pergunta/material.",
  "provider-error-handling": "Erros de providers são comunicados claramente sem expor detalhes internos.",
};