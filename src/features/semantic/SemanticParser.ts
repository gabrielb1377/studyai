import type { DocumentSection, ExtractedContent } from "@/features/extraction/ExtractionTypes";
import { ConceptExtractor } from "./ConceptExtractor";
import { RelationExtractor } from "./RelationExtractor";
import { semanticId } from "./semantic-utils";
import type { SemanticBlock, SemanticBlockKind } from "./types";

function classify(section: DocumentSection): SemanticBlockKind {
  const text = section.text.trim();
  if (section.type === "title" || section.type === "heading") return "heading";
  if (section.type === "list") return "list";
  if (section.type === "table") return "table";
  if (/^(?:exemplo|caso pr[aá]tico)\s*[:.-]/i.test(text)) return "example";
  if (/^(?:observa[cç][aã]o|importante|nota)\s*[:.-]/i.test(text)) return "observation";
  if (/(?:^|\s)[A-Za-z]\w*\s*=\s*[^,.;]{2,}/.test(text)) return "formula";
  if (/^.{2,80}\s+(?:é|são|significa|refere-se a|consiste em|define-se como)\s+.{8,}$/i.test(text)) return "definition";
  return "paragraph";
}

function fallbackSections(text: string): DocumentSection[] {
  return text.split(/\n{2,}/).map((value) => value.trim()).filter(Boolean).map((value) => ({ type: "paragraph" as const, text: value }));
}

function blocksFrom(content: ExtractedContent) {
  const sections = content.sections?.length ? content.sections : fallbackSections(content.extractedText);
  let chapter = content.metadata.chapters?.[0]?.title;
  let subsection: string | undefined;
  return sections.map((section, index) => {
    if (section.type === "title" || section.type === "heading") {
      if ((section.level ?? 1) <= 1) chapter = section.text;
      else subsection = section.text;
    }
    return {
      id: semanticId("block", content.fileId, String(index), section.text.slice(0, 100)),
      kind: classify(section),
      text: section.text,
      chapter,
      section: subsection,
      page: section.page,
      conceptIds: [],
    } satisfies SemanticBlock;
  });
}

export const SemanticParser = {
  parse(content: ExtractedContent) {
    const blocks = blocksFrom(content);
    const concepts = ConceptExtractor.extract(content, blocks);
    const relations = RelationExtractor.extract(concepts, blocks);
    return { blocks, concepts, relations };
  },
};
