import type { HybridRanking, SemanticSearchResult } from "./EmbeddingTypes";
import type { ContentChunk, RetrievedChunk } from "./RetrievalTypes";

export type HybridRetrievedChunk = RetrievedChunk & {
  ranking: HybridRanking;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getQuestionTerms(question: string) {
  return [...new Set(normalize(question).split(" ").filter((term) => term.length > 1))];
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function countTermMatches(text: string, terms: readonly string[]) {
  const frequencies = new Map<string, number>();
  normalize(text).split(" ").filter(Boolean).forEach((term) => {
    frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  });
  return terms.reduce((total, term) => total + (frequencies.get(term) ?? 0), 0);
}

export const RankingService = {
  rank(
    question: string,
    chunks: readonly ContentChunk[],
    semanticResults: readonly SemanticSearchResult[],
    lexicalResults: readonly RetrievedChunk[],
    options: { studyId?: string; limit?: number } = {},
  ): HybridRetrievedChunk[] {
    const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
    const semanticById = new Map(
      semanticResults.map((result) => [result.chunk.id, result.similarity]),
    );
    const lexicalById = new Map(lexicalResults.map((result) => [result.id, result]));
    const candidateIds = new Set([...semanticById.keys(), ...lexicalById.keys()]);
    const questionTerms = getQuestionTerms(question);
    const maximumLexicalScore = Math.max(
      ...lexicalResults.map((result) => result.score),
      1,
    );

    return [...candidateIds]
      .map((chunkId) => {
        const chunk = chunksById.get(chunkId);
        if (!chunk) return null;
        const lexical = lexicalById.get(chunkId);
        const semanticSimilarity = semanticById.get(chunkId) ?? 0;
        const nameTerms = new Set(normalize(chunk.metadata.sourceName).split(" ").filter(Boolean));
        const nameMatches = questionTerms.filter((term) => nameTerms.has(term)).length;
        const termFrequency = countTermMatches(chunk.text, questionTerms);
        const matchedTerms = lexical?.matchedTerms ?? [];
        const ranking: HybridRanking = {
          semanticSimilarity: round(semanticSimilarity),
          semanticScore: round(semanticSimilarity * 55),
          lexicalScore: round(((lexical?.score ?? 0) / maximumLexicalScore) * 25),
          studyScore: chunk.studyId === options.studyId ? 8 : 0,
          fileNameScore: round((nameMatches / Math.max(questionTerms.length, 1)) * 7),
          frequencyScore: round(Math.min(termFrequency / 5, 1) * 5),
        };
        const score = round(
          ranking.semanticScore + ranking.lexicalScore + ranking.studyScore +
          ranking.fileNameScore + ranking.frequencyScore,
        );

        return { ...chunk, matchedTerms, score, ranking } satisfies HybridRetrievedChunk;
      })
      .filter((result): result is HybridRetrievedChunk => result !== null)
      .sort((left, right) => right.score - left.score || left.chunkIndex - right.chunkIndex)
      .slice(0, options.limit ?? 5);
  },
};
