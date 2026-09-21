import type { ContentChunk } from "@/features/retrieval/RetrievalTypes";

export const conceptKinds = [
  "concept",
  "entity",
  "technical_term",
  "acronym",
  "formula",
  "technology",
  "person",
  "organization",
  "example",
  "observation",
] as const;

export type ConceptKind = (typeof conceptKinds)[number];

export const relationKinds = [
  "defines",
  "related_to",
  "depends_on",
  "prerequisite_of",
  "example_of",
  "uses",
  "part_of",
  "abbreviation_of",
  "references",
] as const;

export type RelationKind = (typeof relationKinds)[number];

export type SemanticBlockKind =
  | "heading"
  | "definition"
  | "paragraph"
  | "list"
  | "table"
  | "formula"
  | "example"
  | "observation";

export type SemanticBlock = {
  id: string;
  kind: SemanticBlockKind;
  text: string;
  chapter?: string;
  section?: string;
  page?: number;
  conceptIds: string[];
};

export type KnowledgeConcept = {
  id: string;
  name: string;
  normalizedName: string;
  description: string;
  kind: ConceptKind;
  aliases: string[];
  keywords: string[];
  examples: string[];
  observations: string[];
  document: string;
  fileId: string;
  studyId: string;
  chapter?: string;
  section?: string;
  page?: number;
  relationIds: string[];
  importance: number;
};

export type KnowledgeRelation = {
  id: string;
  sourceId: string;
  targetId: string;
  kind: RelationKind;
  evidence: string;
  weight: number;
};

export type SemanticChunk = ContentChunk & {
  metadata: ContentChunk["metadata"] & {
    semanticType: "semantic";
    conceptIds: string[];
    relationIds: string[];
    chapter?: string;
    section?: string;
  };
};

export type KnowledgeStatistics = {
  conceptCount: number;
  relationCount: number;
  chapterCount: number;
  semanticChunkCount: number;
  structureDegree: number;
  isolatedConceptCount: number;
};

export type KnowledgeGraph = {
  id: string;
  version: 1;
  parserVersion: string;
  fileId: string;
  extractedContentId: string;
  studyId: string;
  documentName: string;
  sourceHash: string;
  concepts: KnowledgeConcept[];
  relations: KnowledgeRelation[];
  blocks: SemanticBlock[];
  chunks: SemanticChunk[];
  statistics: KnowledgeStatistics;
  createdAt: string;
  updatedAt: string;
};

export type ConceptSearchMatch = {
  concept: KnowledgeConcept;
  graphId: string;
  score: number;
  matchedBy: Array<"name" | "alias" | "description" | "keyword" | "relation">;
  related: KnowledgeConcept[];
};

export type KnowledgeContext = {
  query: string;
  expandedQuery: string;
  concepts: ConceptSearchMatch[];
  relationCount: number;
  hasContext: boolean;
};
