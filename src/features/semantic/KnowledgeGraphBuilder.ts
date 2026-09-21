import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";
import { SemanticChunkService } from "./SemanticChunkService";
import { semanticHash } from "./semantic-utils";
import type { KnowledgeGraph, SemanticBlock, KnowledgeConcept, KnowledgeRelation } from "./types";

export const SEMANTIC_PARSER_VERSION = "1.0.0";

export const KnowledgeGraphBuilder = {
  sourceHash(content: ExtractedContent) {
    return semanticHash([content.fileId, content.studyId, content.metadata.name, content.extractedText].join("::"));
  },

  build(content: ExtractedContent, parsed: { blocks: SemanticBlock[]; concepts: KnowledgeConcept[]; relations: KnowledgeRelation[] }, previous?: KnowledgeGraph): KnowledgeGraph {
    const now = new Date().toISOString();
    const chunks = SemanticChunkService.create(content, parsed.blocks, parsed.concepts, parsed.relations);
    const chapters = new Set(parsed.blocks.map((block) => block.chapter).filter(Boolean));
    const relatedIds = new Set(parsed.relations.flatMap((relation) => [relation.sourceId, relation.targetId]));
    const possibleConnections = Math.max(parsed.concepts.length * (parsed.concepts.length - 1), 1);
    return {
      id: `knowledge-${content.fileId}`,
      version: 1,
      parserVersion: SEMANTIC_PARSER_VERSION,
      fileId: content.fileId,
      extractedContentId: content.id,
      studyId: content.studyId,
      documentName: content.metadata.name,
      sourceHash: this.sourceHash(content),
      concepts: parsed.concepts,
      relations: parsed.relations,
      blocks: parsed.blocks,
      chunks,
      statistics: {
        conceptCount: parsed.concepts.length,
        relationCount: parsed.relations.length,
        chapterCount: chapters.size,
        semanticChunkCount: chunks.length,
        structureDegree: Math.min(100, Math.round((parsed.relations.length * 2 / possibleConnections) * 100)),
        isolatedConceptCount: parsed.concepts.filter((concept) => !relatedIds.has(concept.id)).length,
      },
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
  },
};
