/**
 * Client-side LLM Judge — chama API route para evitar import server-only.
 */

import type { EvaluationCase, EvaluationResult, LLMJudgeConfig, QualityCriterion } from "./types";

const JUDGE_PROMPT_TEMPLATE = `Você é um avaliador especialista de respostas educacionais.
Avalie a resposta do aluno com base no CRITÉRIO abaixo.

CRITÉRIO: {criterion}
DESCRIÇÃO: {description}

MATERIAL-FONTE:
{sourceMaterial}

PERGUNTA: {question}

RESPOSTA ESPERADA (referência):
{expectedAnswer}

RESPOSTA OBTIDA:
{actualAnswer}

Retorne APENAS um JSON válido:
{
  "passed": boolean,
  "score": number,  // 0 a 10
  "reasoning": "explicação curta em português"
}`;

function buildPrompt(case_: EvaluationCase, actualAnswer: string, criterion: QualityCriterion): string {
  return JUDGE_PROMPT_TEMPLATE
    .replace("{criterion}", criterion)
    .replace("{description}", "{description}")
    .replace("{sourceMaterial}", case_.sourceMaterial.slice(0, 8000))
    .replace("{question}", case_.question)
    .replace("{expectedAnswer}", case_.expectedAnswer)
    .replace("{actualAnswer}", actualAnswer);
}

function parseJudgeResponse(text: string): { passed: boolean; score: number; reasoning: string } | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed.passed !== "boolean" || typeof parsed.score !== "number") return null;
    return {
      passed: parsed.passed,
      score: Math.max(0, Math.min(10, parsed.score)),
      reasoning: String(parsed.reasoning ?? "").slice(0, 500),
    };
  } catch {
    return null;
  }
}

interface JudgeApiRequest {
  prompt: string;
  provider: string;
  model: string;
  apiKey?: string;
  maxTokens: number;
}

interface JudgeApiResponse {
  text: string;
  provider: string;
  model: string;
}

export async function runLLMJudge(
  case_: EvaluationCase,
  actualAnswer: string,
  config: LLMJudgeConfig,
  criteria: QualityCriterion[]
): Promise<EvaluationResult[]> {
  const results: EvaluationResult[] = [];

  for (const criterion of criteria) {
    const prompt = buildPrompt(case_, actualAnswer, criterion);
    try {
      const response = await fetch("/api/ai-quality/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          provider: config.provider,
          model: config.model,
          apiKey: config.apiKey,
          maxTokens: config.maxTokens,
        } satisfies JudgeApiRequest),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json() as JudgeApiResponse;
      const parsed = parseJudgeResponse(data.text);

      if (parsed) {
        results.push({
          caseId: case_.id,
          criterion,
          passed: parsed.passed,
          score: parsed.score,
          reasoning: parsed.reasoning,
          mode: "llm-judge",
          timestamp: new Date().toISOString(),
        });
      } else {
        results.push({
          caseId: case_.id,
          criterion,
          passed: false,
          score: 0,
          reasoning: "Resposta do judge inválida (não JSON).",
          mode: "llm-judge",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      results.push({
        caseId: case_.id,
        criterion,
        passed: false,
        score: 0,
        reasoning: error instanceof Error ? error.message : "Erro ao chamar provider.",
        mode: "llm-judge",
        timestamp: new Date().toISOString(),
      });
    }
  }

  return results;
}