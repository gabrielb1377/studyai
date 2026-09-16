import {
  EMBEDDING_DIMENSIONS,
  type ChunkEmbedding,
} from "./EmbeddingTypes";
import type { ContentChunk } from "./RetrievalTypes";

const STOP_WORDS = new Set([
  "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos",
  "e", "em", "esse", "esta", "este", "eu", "isso", "me", "na", "nas",
  "no", "nos", "o", "os", "para", "por", "que", "se", "sem", "sobre",
  "um", "uma", "voce",
]);

const PORTUGUESE_SUFFIXES = [
  "amentos", "imentos", "amento", "imento", "acoes", "adores", "adoras",
  "acao", "mente", "idades", "idade", "ismos", "istas", "osos", "osas",
  "ivas", "ivos", "iva", "ivo", "ando", "endo", "indo", "ados", "adas",
  "idos", "idas", "es", "s", "ao",
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalize(value).split(" ").filter(
    (term) => term.length > 1 && !STOP_WORDS.has(term),
  );
}

function stem(term: string) {
  const suffix = PORTUGUESE_SUFFIXES.find(
    (candidate) => term.endsWith(candidate) && term.length - candidate.length >= 4,
  );
  return suffix ? term.slice(0, -suffix.length) : term;
}

function hash(value: string, seed: number) {
  let result = seed;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16_777_619);
  }
  return result | 0;
}

function addFeature(vector: number[], feature: string, weight: number) {
  const positionHash = hash(feature, -2_128_835_035);
  const signHash = hash(feature, -1_640_531_527);
  const position = Math.abs(positionHash) % vector.length;
  vector[position] += signHash % 2 === 0 ? weight : -weight;
}

function tokenTrigrams(term: string) {
  const bounded = `^${term}$`;
  const trigrams: string[] = [];
  for (let index = 0; index <= bounded.length - 3; index += 1) {
    trigrams.push(bounded.slice(index, index + 3));
  }
  return trigrams;
}

function normalizeVector(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => Math.round((value / magnitude) * 1_000_000) / 1_000_000);
}

function encodeVector(vector: readonly number[]) {
  const bytes = Uint8Array.from(vector, (value) => Math.round(Math.max(-1, Math.min(1, value)) * 127) + 128);
  return btoa(String.fromCharCode(...bytes));
}

function decodeVector(value: string) {
  const binary = atob(value);
  return Array.from(binary, (character) => (character.charCodeAt(0) - 128) / 127);
}

export const EmbeddingService = {
  generate(text: string) {
    const vector = Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    const terms = tokenize(text);

    terms.forEach((term, index) => {
      addFeature(vector, `term:${term}`, 2);
      addFeature(vector, `stem:${stem(term)}`, 1.5);
      tokenTrigrams(term).forEach((trigram) => addFeature(vector, `tri:${trigram}`, 0.3));
      const nextTerm = terms[index + 1];
      if (nextTerm) addFeature(vector, `pair:${term}:${nextTerm}`, 0.75);
    });

    return normalizeVector(vector);
  },

  generateForChunk(chunk: ContentChunk, createdAt = new Date().toISOString()): ChunkEmbedding {
    return {
      chunkId: chunk.id,
      studyId: chunk.studyId,
      embedding: encodeVector(this.generate(`${chunk.metadata.sourceName} ${chunk.text}`)),
      createdAt,
    };
  },

  encode: encodeVector,

  decode: decodeVector,

  cosineSimilarity(left: readonly number[], right: readonly number[]) {
    if (left.length !== right.length || left.length === 0) return 0;
    const similarity = left.reduce((sum, value, index) => sum + value * right[index], 0);
    return Math.max(0, Math.min(1, similarity));
  },
};
