/**
 * Runner de avaliação — orquestra suites, casos e armazenamento.
 */

import type { EvaluationCase, EvaluationSuite, EvaluationRun, EvaluationResult, QualityCriterion, EvaluationMode } from "./types";
import { DeterministicEvaluator } from "./deterministic";
import { runLLMJudge } from "./llm-judge";

const STORAGE_KEY = "studyai:ai-quality";

function loadSuites(): EvaluationSuite[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveSuites(suites: EvaluationSuite[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(suites));
}

function loadRuns(): EvaluationRun[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY + ":runs");
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveRuns(runs: EvaluationRun[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY + ":runs", JSON.stringify(runs));
}

export const EvaluationStorage = {
  // Suites
  getSuites(): EvaluationSuite[] {
    return loadSuites();
  },
  getSuite(id: string): EvaluationSuite | undefined {
    return loadSuites().find((s) => s.id === id);
  },
  saveSuite(suite: EvaluationSuite): void {
    const suites = loadSuites();
    const idx = suites.findIndex((s) => s.id === suite.id);
    if (idx >= 0) suites[idx] = suite;
    else suites.push(suite);
    saveSuites(suites);
  },
  deleteSuite(id: string): void {
    saveSuites(loadSuites().filter((s) => s.id !== id));
  },

  // Runs
  getRuns(): EvaluationRun[] {
    return loadRuns();
  },
  getRun(id: string): EvaluationRun | undefined {
    return loadRuns().find((r) => r.id === id);
  },
  saveRun(run: EvaluationRun): void {
    const runs = loadRuns();
    const idx = runs.findIndex((r) => r.id === run.id);
    if (idx >= 0) runs[idx] = run;
    else runs.push(run);
    saveRuns(runs);
  },
  deleteRun(id: string): void {
    saveRuns(loadRuns().filter((r) => r.id !== id));
  },
};

export function generateId(): string {
  return crypto.randomUUID();
}

export function createSuite(name: string): EvaluationSuite {
  return {
    id: generateId(),
    name,
    cases: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createCase(
  suiteId: string,
  data: Omit<EvaluationCase, "id">
): EvaluationCase {
  return {
    id: generateId(),
    ...data,
  };
}

export async function runEvaluation(
  suite: EvaluationSuite,
  getActualAnswer: (question: string, sourceMaterial: string) => Promise<string>,
  mode: EvaluationMode,
  llmConfig?: { provider: string; model: string; apiKey?: string }
): Promise<EvaluationRun> {
  const run: EvaluationRun = {
    id: generateId(),
    suiteId: suite.id,
    mode,
    results: [],
    summary: { total: 0, passed: 0, failed: 0, averageScore: 0 },
    startedAt: new Date().toISOString(),
    provider: llmConfig?.provider,
    model: llmConfig?.model,
  };

  for (const case_ of suite.cases) {
    const actualAnswer = await getActualAnswer(case_.question, case_.sourceMaterial);

    let results: EvaluationResult[];
    if (mode === "deterministic") {
      results = DeterministicEvaluator.evaluateAll(case_, actualAnswer);
    } else {
      results = await runLLMJudge(case_, actualAnswer, {
        provider: llmConfig!.provider as "gemini" | "groq" | "openrouter" | "ollama",
        model: llmConfig!.model,
        apiKey: llmConfig!.apiKey,
        temperature: 0.1,
        maxTokens: 1000,
      }, case_.criteria);
    }

    run.results.push(...results);
  }

  run.completedAt = new Date().toISOString();
  run.summary.total = run.results.length;
  run.summary.passed = run.results.filter((r) => r.passed).length;
  run.summary.failed = run.results.filter((r) => !r.passed).length;
  run.summary.averageScore = run.results.length > 0
    ? run.results.reduce((sum, r) => sum + r.score, 0) / run.results.length
    : 0;

  EvaluationStorage.saveRun(run);
  return run;
}

export function compareRuns(runA: EvaluationRun, runB: EvaluationRun) {
  const details = runA.results.map((rA) => {
    const rB = runB.results.find((r) => r.caseId === rA.caseId && r.criterion === rA.criterion);
    if (!rB) return null;
    const delta = rB.score - rA.score;
    return {
      caseId: rA.caseId,
      criterion: rA.criterion,
      scoreA: rA.score,
      scoreB: rB.score,
      delta: Number(delta.toFixed(2)),
    };
  }).filter((d): d is { caseId: string; criterion: QualityCriterion; scoreA: number; scoreB: number; delta: number } => d !== null);

  return {
    improved: details.filter((d) => d.delta > 0.05).length,
    regressed: details.filter((d) => d.delta < -0.05).length,
    stable: details.filter((d) => Math.abs(d.delta) <= 0.05).length,
    details,
  };
}