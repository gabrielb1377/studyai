import type { ContentChunk, RetrievedChunk } from "./RetrievalTypes";

const STOP_WORDS = new Set([
  "a", "ao", "aos", "as", "como", "com", "da", "das", "de", "do", "dos",
  "e", "em", "esse", "esta", "este", "eu", "isso", "me", "na", "nas",
  "no", "nos", "o", "os", "para", "por", "que", "se", "sem", "sobre",
  "um", "uma", "voce",
]);

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return [...new Set(normalize(value).split(" ").filter(
    (term) => term.length > 1 && !STOP_WORDS.has(term),
  ))];
}

function getTermFrequency(value: string) {
  const frequencies = new Map<string, number>();
  for (const term of normalize(value).split(" ").filter(Boolean)) {
    frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  }
  return frequencies;
}

function rankChunk(chunk: ContentChunk, terms: readonly string[], question: string) {
  const normalizedText = normalize(chunk.text);
  const normalizedName = normalize(chunk.metadata.sourceName);
  const textFrequency = getTermFrequency(chunk.text);
  const nameTerms = new Set(normalizedName.split(" ").filter(Boolean));
  const matchedTerms = terms.filter(
    (term) => textFrequency.has(term) || nameTerms.has(term),
  );
  if (matchedTerms.length === 0) return null;

  const termFrequency = matchedTerms.reduce(
    (score, term) => score + Math.min(textFrequency.get(term) ?? 0, 4),
    0,
  );
  const titleMatches = matchedTerms.filter((term) => nameTerms.has(term)).length;
  const coverage = matchedTerms.length / Math.max(terms.length, 1);
  const exactPhraseBonus = normalizedText.includes(normalize(question)) ? 5 : 0;
  const score = Math.round(
    (termFrequency * 2 + titleMatches * 4 + coverage * 10 + exactPhraseBonus) * 100,
  ) / 100;

  return { ...chunk, score, matchedTerms } satisfies RetrievedChunk;
}

export const SearchService = {
  search(
    question: string,
    chunks: readonly ContentChunk[],
    options: { studyId?: string; limit?: number } = {},
  ): RetrievedChunk[] {
    const terms = tokenize(question);
    if (terms.length === 0) return [];

    return chunks
      .filter((chunk) => !options.studyId || chunk.studyId === options.studyId)
      .map((chunk) => rankChunk(chunk, terms, question))
      .filter((chunk): chunk is RetrievedChunk => chunk !== null)
      .sort((left, right) => {
        const leftStudyBoost = left.studyId === options.studyId ? 1 : 0;
        const rightStudyBoost = right.studyId === options.studyId ? 1 : 0;
        return right.score + rightStudyBoost - (left.score + leftStudyBoost) ||
          left.chunkIndex - right.chunkIndex;
      })
      .slice(0, options.limit ?? 5);
  },
};
