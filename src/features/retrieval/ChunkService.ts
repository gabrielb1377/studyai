import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";
import type { ContentChunk } from "./RetrievalTypes";

const TARGET_WORDS = 160;
const OVERLAP_WORDS = 30;

function splitIntoWindows(text: string) {
  const paragraphs = text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const windows: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length === 0) return;
    windows.push(current.join(" "));
    current = current.slice(-OVERLAP_WORDS);
  };

  for (const paragraph of paragraphs) {
    const words = paragraph.replace(/\s+/g, " ").split(" ").filter(Boolean);
    for (const word of words) {
      current.push(word);
      if (current.length >= TARGET_WORDS) flush();
    }
    if (current.length >= TARGET_WORDS - OVERLAP_WORDS) flush();
  }
  if (current.length > OVERLAP_WORDS || windows.length === 0) windows.push(current.join(" "));

  return windows.filter(Boolean).filter((window, index, values) => index === 0 || window !== values[index - 1]);
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
        title: content.metadata.title,
        subject: content.metadata.subject,
        topic: content.metadata.topic,
        keywords: content.metadata.keywords,
      },
    }));
  },
};
