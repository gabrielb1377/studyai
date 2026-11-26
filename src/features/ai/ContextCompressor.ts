import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";
import type { AIMessage } from "./AIProvider";
import { TokenCounter } from "./TokenCounter";

const MAX_RECENT_MESSAGES = 6;
const MAX_CHUNKS = 3;

function normalize(value: string) {
  return value.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

function summarize(messages: readonly AIMessage[], maxTokens: number) {
  const lines = messages
    .map((message) => `${message.role === "user" ? "Usuário" : "Tutor"}: ${message.content.replace(/\s+/g, " ").trim()}`)
    .filter((line) => line.length > 0);
  return TokenCounter.truncate(lines.join("\n"), maxTokens);
}

function uniqueChunks(chunks: readonly RetrievedChunk[]) {
  const seen = new Set<string>();
  return [...chunks]
    .sort((left, right) => right.score - left.score)
    .filter((chunk) => {
      const key = `${chunk.fileId}:${normalize(chunk.text)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CHUNKS);
}

export type CompressedContext = {
  history: AIMessage[];
  chunks: RetrievedChunk[];
  historySummary?: string;
  statistics: {
    originalHistoryTokens: number;
    compressedHistoryTokens: number;
    chunkTokens: number;
    removedMessages: number;
    removedChunks: number;
  };
};

export type SkillCompressionInput = {
  maxInputTokens: number;
  systemPrompt: string;
  skillInstructions: string;
  studentInputs: string;
  allowedContext: readonly string[];
  studyContextText?: string;
  history?: readonly AIMessage[];
  chunks?: readonly RetrievedChunk[];
  errors?: readonly string[];
  providerFormatOverheadTokens?: number;
};

export type SkillCompressionResult = {
  withinBudget: boolean;
  budget: number;
  mandatoryTokens: number;
  contextTokens: number;
  totalEstimatedTokens: number;
  exceededBy: number;
  studyContextText?: string;
  history: AIMessage[];
  chunks: RetrievedChunk[];
  errors: string[];
  historySummary?: string;
  statistics: {
    originalHistoryTokens: number;
    compressedHistoryTokens: number;
    chunkTokens: number;
    errorTokens: number;
    removedMessages: number;
    removedChunks: number;
    removedErrors: number;
    droppedStudyContext: boolean;
  };
};

const DEFAULT_PROVIDER_FORMAT_OVERHEAD_TOKENS = 32;

export const ContextCompressor = {
  compress(
    history: readonly AIMessage[],
    chunks: readonly RetrievedChunk[],
    options: { maxHistoryTokens?: number; maxChunkTokens?: number } = {},
  ): CompressedContext {
    const maxHistoryTokens = options.maxHistoryTokens ?? 2_000;
    const maxChunkTokens = options.maxChunkTokens ?? 2_000;
    const recent = history.slice(-MAX_RECENT_MESSAGES);
    const older = history.slice(0, -MAX_RECENT_MESSAGES);
    const historySummary = older.length > 0 ? summarize(older, Math.floor(maxHistoryTokens * 0.35)) : undefined;
    const remainingHistoryBudget = Math.max(200, maxHistoryTokens - TokenCounter.estimate(historySummary ?? ""));
    const boundedRecent: AIMessage[] = [];
    let usedHistoryTokens = 0;

    for (const message of [...recent].reverse()) {
      const tokens = TokenCounter.estimate(message.content) + 4;
      if (usedHistoryTokens + tokens > remainingHistoryBudget) continue;
      boundedRecent.unshift(message);
      usedHistoryTokens += tokens;
    }

    const compressedHistory = historySummary
      ? [{ role: "assistant" as const, content: `Resumo da conversa anterior:\n${historySummary}` }, ...boundedRecent]
      : boundedRecent;
    const deduplicated = uniqueChunks(chunks);
    const boundedChunks: RetrievedChunk[] = [];
    let chunkTokens = 0;
    for (const chunk of deduplicated) {
      const remaining = maxChunkTokens - chunkTokens;
      if (remaining <= 0) break;
      const text = TokenCounter.truncate(chunk.text, remaining);
      const tokens = TokenCounter.estimate(text);
      if (!text || tokens <= 0) continue;
      boundedChunks.push({ ...chunk, text });
      chunkTokens += tokens;
    }

    return {
      history: compressedHistory,
      chunks: boundedChunks,
      historySummary,
      statistics: {
        originalHistoryTokens: TokenCounter.messages(history),
        compressedHistoryTokens: TokenCounter.messages(compressedHistory),
        chunkTokens,
        removedMessages: Math.max(0, history.length - boundedRecent.length),
        removedChunks: Math.max(0, chunks.length - boundedChunks.length),
      },
    };
  },

  /**
   * Aplica o orçamento de entrada declarado em `SkillSpec.tokenBudget.input`
   * considerando todos os componentes da solicitação (system prompt, instruções
   * da skill, inputs do aluno, delimitadores de segurança, overhead do provedor
   * e blocos de contexto autorizados).
   *
   * Regras invioláveis:
   * - Nunca remove instruções obrigatórias de segurança ou system prompt.
   * - Quando o conteúdo mínimo obrigatório já excede `maxInputTokens`, retorna
   *   `withinBudget: false` para que o chamador não envie a requisição ao provedor.
   */
  compressForSkill(input: SkillCompressionInput): SkillCompressionResult {
    const budget = Math.max(1, Math.trunc(input.maxInputTokens));
    const overhead = input.providerFormatOverheadTokens ?? DEFAULT_PROVIDER_FORMAT_OVERHEAD_TOKENS;
    const mandatoryTokens =
      TokenCounter.estimate(input.systemPrompt) +
      TokenCounter.estimate(input.skillInstructions) +
      TokenCounter.estimate(input.studentInputs) +
      overhead;

    const rawHistory = input.allowedContext.includes("history") ? (input.history ?? []) : [];
    const rawChunks = input.allowedContext.includes("chunks") ? (input.chunks ?? []) : [];
    const rawErrors = input.allowedContext.includes("errors") ? (input.errors ?? []) : [];
    const originalHistoryTokens = TokenCounter.messages(rawHistory);

    if (mandatoryTokens > budget) {
      return {
        withinBudget: false,
        budget,
        mandatoryTokens,
        contextTokens: 0,
        totalEstimatedTokens: mandatoryTokens,
        exceededBy: mandatoryTokens - budget,
        studyContextText: undefined,
        history: [],
        chunks: [],
        errors: [],
        statistics: {
          originalHistoryTokens,
          compressedHistoryTokens: 0,
          chunkTokens: 0,
          errorTokens: 0,
          removedMessages: rawHistory.length,
          removedChunks: rawChunks.length,
          removedErrors: rawErrors.length,
          droppedStudyContext: Boolean(input.studyContextText),
        },
      };
    }

    let remaining = budget - mandatoryTokens;
    let studyContextText: string | undefined;
    let studyTokens = 0;
    let droppedStudyContext = false;

    if (input.studyContextText && input.allowedContext.includes("study")) {
      const est = TokenCounter.estimate(input.studyContextText);
      if (est <= remaining) {
        studyContextText = input.studyContextText;
        studyTokens = est;
        remaining -= studyTokens;
      } else if (remaining >= 32) {
        studyContextText = TokenCounter.truncate(input.studyContextText, Math.min(remaining, 180));
        studyTokens = TokenCounter.estimate(studyContextText);
        if (studyTokens <= remaining) {
          remaining -= studyTokens;
        } else {
          studyContextText = undefined;
          studyTokens = 0;
          droppedStudyContext = true;
        }
      } else {
        droppedStudyContext = true;
      }
    } else if (input.studyContextText) {
      droppedStudyContext = true;
    }

    const hasChunks = rawChunks.length > 0;
    const hasHistory = rawHistory.length > 0;
    let maxChunkTokens = 0;
    let maxHistoryTokens = 0;

    if (remaining > 0) {
      if (hasChunks && hasHistory) {
        maxChunkTokens = Math.floor(remaining * 0.65);
        maxHistoryTokens = remaining - maxChunkTokens;
      } else if (hasChunks) {
        maxChunkTokens = remaining;
      } else if (hasHistory) {
        maxHistoryTokens = remaining;
      }
    }

    // Comprimir chunks respeitando estritamente maxChunkTokens
    const deduplicated = hasChunks ? uniqueChunks(rawChunks) : [];
    const boundedChunks: RetrievedChunk[] = [];
    let chunkTokens = 0;
    for (const chunk of deduplicated) {
      const avail = maxChunkTokens - chunkTokens;
      if (avail <= 8) break;
      const text = TokenCounter.truncate(chunk.text, avail);
      const tokens = TokenCounter.estimate(text);
      if (!text || tokens <= 0 || chunkTokens + tokens > maxChunkTokens) continue;
      boundedChunks.push({ ...chunk, text });
      chunkTokens += tokens;
    }

    // Reaproveitar eventual sobra de chunks para histórico se permitido
    const leftoverFromChunks = Math.max(0, maxChunkTokens - chunkTokens);
    const effectiveHistoryBudget = hasHistory ? maxHistoryTokens + leftoverFromChunks : 0;

    const boundedHistory: AIMessage[] = [];
    let usedHistoryTokens = 0;
    if (hasHistory && effectiveHistoryBudget >= 12) {
      const recent = rawHistory.slice(-MAX_RECENT_MESSAGES);
      for (const message of [...recent].reverse()) {
        const tokens = TokenCounter.estimate(message.content) + 4;
        if (usedHistoryTokens + tokens > effectiveHistoryBudget) continue;
        boundedHistory.unshift(message);
        usedHistoryTokens += tokens;
      }
    }

    const compressedHistoryTokens = TokenCounter.messages(boundedHistory);
    const remainingForErrors = Math.max(0, remaining - chunkTokens - compressedHistoryTokens);
    const boundedErrors: string[] = [];
    let errorTokens = 0;
    if (rawErrors.length > 0 && remainingForErrors >= 12) {
      const seenErrors = new Set<string>();
      for (const errText of rawErrors) {
        const key = normalize(errText);
        if (!key || seenErrors.has(key)) continue;
        seenErrors.add(key);
        const avail = remainingForErrors - errorTokens;
        if (avail <= 8) break;
        const truncated = TokenCounter.truncate(errText, avail);
        const tokens = TokenCounter.estimate(truncated);
        if (!truncated || tokens <= 0 || errorTokens + tokens > remainingForErrors) continue;
        boundedErrors.push(truncated);
        errorTokens += tokens;
      }
    }

    const contextTokens = studyTokens + chunkTokens + compressedHistoryTokens + errorTokens;
    const totalEstimatedTokens = mandatoryTokens + contextTokens;

    return {
      withinBudget: totalEstimatedTokens <= budget,
      budget,
      mandatoryTokens,
      contextTokens,
      totalEstimatedTokens,
      exceededBy: Math.max(0, totalEstimatedTokens - budget),
      studyContextText,
      history: boundedHistory,
      chunks: boundedChunks,
      errors: boundedErrors,
      statistics: {
        originalHistoryTokens,
        compressedHistoryTokens,
        chunkTokens,
        errorTokens,
        removedMessages: Math.max(0, rawHistory.length - boundedHistory.length),
        removedChunks: Math.max(0, rawChunks.length - boundedChunks.length),
        removedErrors: Math.max(0, rawErrors.length - boundedErrors.length),
        droppedStudyContext,
      },
    };
  },
};
