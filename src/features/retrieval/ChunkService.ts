import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";
import type { ContentChunk } from "./RetrievalTypes";

const TARGET_WORDS = 160;
const OVERLAP_WORDS = 30;

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function splitIntoWindows(text: string) {
  const words = normalizeWhitespace(text).split(" ").filter(Boolean);
  if (words.length === 0) return [];

  const windows: string[] = [];
  const step = TARGET_WORDS - OVERLAP_WORDS;

  for (let start = 0; start < words.length; start += step) {
    const window = words.slice(start, start + TARGET_WORDS).join(" ");
    if (window) windows.push(window);
    if (start + TARGET_WORDS >= words.length) break;
  }

  return windows;
}

export const ChunkService = {
  createChunks(content: ExtractedContent): ContentChunk[] {
    if (content.status !== "extracted" || !content.extractedText.trim()) return [];

    return splitIntoWindows(content.extractedText).map((text, chunkIndex) => ({
      id: `${content.id}:chunk:${chunkIndex}`,
      studyId: content.studyId,
      fileId: content.fileId,
      chunkIndex,
      text,
      metadata: {
        extractedContentId: content.id,
        sourceName: content.metadata.name,
        fileType: content.fileType,
        mimeType: content.metadata.type,
        size: content.metadata.size,
        pageCount: content.metadata.pageCount,
        duration: content.metadata.duration,
        language: content.metadata.language,
      },
    }));
  },
};
