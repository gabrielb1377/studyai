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
};
