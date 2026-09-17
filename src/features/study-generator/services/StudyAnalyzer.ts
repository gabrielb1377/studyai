import type { DocumentSection, ExtractionMetadata } from "@/features/extraction/ExtractionTypes";
import type { StudyAnalysis } from "../types";
import { KeywordExtractor } from "./KeywordExtractor";
import { ReadingTimeCalculator, wordsFrom } from "./ReadingTimeCalculator";
import { SubjectDetector, normalizeForDetection } from "./SubjectDetector";
import { TopicDetector } from "./TopicDetector";

function detectLanguage(text: string) {
  const words = wordsFrom(text).map((word) => normalizeForDetection(word));
  if (words.length < 8) return undefined;
  const portuguese = new Set(["de", "do", "da", "em", "para", "que", "uma", "como", "com"]);
  const english = new Set(["the", "of", "in", "to", "for", "that", "with", "and"]);
  const pt = words.filter((word) => portuguese.has(word)).length;
  const en = words.filter((word) => english.has(word)).length;
  if (pt === en) return undefined;
  return pt > en ? "pt-BR" : "en";
}

function createSummaryPreview(text: string) {
  const clean = text.replace(/^#{1,6}\s+/gm, "").trim();
  if (!clean) return "Conteúdo textual não disponível para gerar uma prévia.";
  const firstParagraph = clean.split(/\n{2,}/).find((paragraph) => paragraph.trim().length > 40) ?? clean;
  const sentences = firstParagraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  const preview = sentences.slice(0, 2).join(" ").replace(/\s+/g, " ").trim();
  return preview.length > 360 ? `${preview.slice(0, 359).trimEnd()}…` : preview;
}

export const StudyAnalyzer = {
  analyze({
    fileName,
    text,
    sections = [],
    metadata,
    fallbackSubject,
  }: {
    fileName: string;
    text: string;
    sections?: readonly DocumentSection[];
    metadata: ExtractionMetadata;
    fallbackSubject?: string;
  }): StudyAnalysis {
    const analyzedAt = new Date().toISOString();
    const structure = TopicDetector.detect(fileName, text, sections);
    const reading = ReadingTimeCalculator.calculate(text);
    const subject = SubjectDetector.detect(
      `${fileName} ${structure.title} ${structure.topic} ${text.slice(0, 8_000)}`,
      fallbackSubject,
    );
    const hasContent = reading.wordCount > 0;

    return {
      ...structure,
      subject,
      keywords: KeywordExtractor.extract(text),
      summaryPreview: createSummaryPreview(text),
      language: metadata.language ?? detectLanguage(text),
      pageCount: metadata.pageCount,
      ...reading,
      analysisStatus: hasContent ? "analyzed" : "fallback",
      analyzedAt,
      createdAt: metadata.createdAt ?? analyzedAt,
      updatedAt: analyzedAt,
    };
  },

  detectLanguage,
};

