import type { LabFeedback } from "../types";

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 8) : [];
}

export const LabFeedbackParser = {
  parse(text: string, metadata: { provider: string; model: string }): LabFeedback {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("A IA retornou uma correção em formato inválido.");
    let value: unknown;
    try { value = JSON.parse(match[0]); }
    catch { throw new Error("A IA retornou uma correção em formato inválido."); }
    if (!value || typeof value !== "object") throw new Error("A IA retornou uma correção vazia.");
    const record = value as Record<string, unknown>;
    const score = typeof record.score === "number" ? Math.round(record.score) : 0;
    return {
      correct: strings(record.correct),
      incorrect: strings(record.incorrect),
      explanation: typeof record.explanation === "string" ? record.explanation : "",
      improvement: typeof record.improvement === "string" ? record.improvement : "",
      alternativeSolution: typeof record.alternativeSolution === "string" ? record.alternativeSolution : "",
      nextExercises: strings(record.nextExercises),
      score: Math.min(100, Math.max(0, score)),
      provider: metadata.provider,
      model: metadata.model,
      createdAt: new Date().toISOString(),
    };
  },
};
