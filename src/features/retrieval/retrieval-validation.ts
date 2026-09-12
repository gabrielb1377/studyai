import type { RetrievedChunk } from "./RetrievalTypes";

export function isRetrievedChunk(value: unknown): value is RetrievedChunk {
  if (!value || typeof value !== "object") return false;
  const chunk = value as Partial<RetrievedChunk>;
  return typeof chunk.id === "string" && typeof chunk.studyId === "string" &&
    typeof chunk.fileId === "string" && Number.isInteger(chunk.chunkIndex) &&
    typeof chunk.text === "string" && chunk.text.length > 0 && chunk.text.length <= 8_000 &&
    typeof chunk.score === "number" && Number.isFinite(chunk.score) &&
    Array.isArray(chunk.matchedTerms) && chunk.matchedTerms.every((term) => typeof term === "string") &&
    Boolean(chunk.metadata) && typeof chunk.metadata?.extractedContentId === "string" &&
    typeof chunk.metadata.sourceName === "string" && typeof chunk.metadata.fileType === "string" &&
    typeof chunk.metadata.mimeType === "string" && typeof chunk.metadata.size === "number";
}
