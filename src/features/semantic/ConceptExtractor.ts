import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";
import { normalizeSemanticText, semanticId, uniqueStrings } from "./semantic-utils";
import type { ConceptKind, KnowledgeConcept, SemanticBlock } from "./types";

const TECH_TERMS = /\b(?:API|SQL|NoSQL|HTML|CSS|JavaScript|TypeScript|React|Next\.js|Python|Java|Git|Docker|HTTP|REST|GraphQL|JSON|XML|Linux|Windows|algoritmo|recurs[aã]o|vetor(?:es)?|matriz(?:es)?|banco de dados|estrutura de dados)\b/gi;
const FORMULA = /(?:^|\s)(?:[A-Za-z]\w*\s*=\s*[^,.;]{2,}|\b(?:sin|cos|log|sqrt)\s*\([^)]*\)|\d+\s*[+\-*/^]\s*\d+)/;
const DEFINITION = /^(.{2,80}?)\s+(?:é|são|significa|refere-se a|consiste em|define-se como)\s+(.{8,})$/i;
const COLON_DEFINITION = /^([^:]{2,60}):\s+(.{10,})$/;
const ACRONYM = /\b([A-ZÁÉÍÓÚ][\p{L}]+(?:\s+(?:de|da|do|e)?\s*[A-ZÁÉÍÓÚ][\p{L}]+){1,6})\s*\(([A-Z][A-Z0-9-]{1,9})\)/gu;
const PERSON = /\b(?:prof(?:essor)?\.?|dra?\.?)\s+([A-ZÁÉÍÓÚ][\p{L}]+(?:\s+[A-ZÁÉÍÓÚ][\p{L}]+){1,3})/giu;
const ORGANIZATION = /\b([A-ZÁÉÍÓÚ][\p{L}&]+(?:\s+[A-ZÁÉÍÓÚ][\p{L}&]+){0,4}\s+(?:Universidade|Faculdade|Instituto|Foundation|Corporation|Corp\.?|Inc\.?|Ltda\.?))\b/gu;

type Candidate = {
  name: string;
  description: string;
  kind: ConceptKind;
  aliases?: string[];
  chapter?: string;
  section?: string;
  page?: number;
  examples?: string[];
  observations?: string[];
  importance?: number;
};

function candidateFromBlock(block: SemanticBlock): Candidate[] {
  const candidates: Candidate[] = [];
  const definition = block.text.match(DEFINITION) ?? block.text.match(COLON_DEFINITION);
  if (definition) {
    candidates.push({ name: definition[1].trim(), description: definition[2].trim(), kind: "concept", chapter: block.chapter, section: block.section, page: block.page, importance: 0.9 });
  }
  if (block.kind === "heading" && block.text.length <= 100) {
    candidates.push({ name: block.text, description: `Seção do material dedicada a ${block.text}.`, kind: "concept", chapter: block.chapter, section: block.section, page: block.page, importance: 0.75 });
  }
  if (block.kind === "formula" || FORMULA.test(block.text)) {
    candidates.push({ name: block.text.slice(0, 80), description: block.text, kind: "formula", chapter: block.chapter, section: block.section, page: block.page, importance: 0.7 });
  }
  if (block.kind === "example") {
    candidates.push({ name: `Exemplo: ${block.text.replace(/^exemplo\s*:*/i, "").slice(0, 55)}`, description: block.text, kind: "example", chapter: block.chapter, section: block.section, page: block.page, importance: 0.45 });
  }
  if (block.kind === "observation") {
    candidates.push({ name: `Observação: ${block.text.replace(/^(?:observa[cç][aã]o|importante)\s*:*/i, "").slice(0, 50)}`, description: block.text, kind: "observation", chapter: block.chapter, section: block.section, page: block.page, importance: 0.5 });
  }

  for (const match of block.text.matchAll(ACRONYM)) {
    candidates.push({ name: match[2], description: match[1], kind: "acronym", aliases: [match[1]], chapter: block.chapter, section: block.section, page: block.page, importance: 0.7 });
  }
  for (const term of block.text.match(TECH_TERMS) ?? []) {
    candidates.push({ name: term, description: `Termo técnico mencionado no material: ${term}.`, kind: "technology", chapter: block.chapter, section: block.section, page: block.page, importance: 0.55 });
  }
  for (const match of block.text.matchAll(PERSON)) {
    candidates.push({ name: match[1], description: `Pessoa mencionada no material.`, kind: "person", chapter: block.chapter, section: block.section, page: block.page, importance: 0.35 });
  }
  for (const match of block.text.matchAll(ORGANIZATION)) {
    candidates.push({ name: match[1], description: `Organização mencionada no material.`, kind: "organization", chapter: block.chapter, section: block.section, page: block.page, importance: 0.35 });
  }
  return candidates;
}

export const ConceptExtractor = {
  extract(content: ExtractedContent, blocks: readonly SemanticBlock[]): KnowledgeConcept[] {
    const metadataCandidates: Candidate[] = (content.metadata.keywords ?? []).map((keyword) => ({
      name: keyword,
      description: `Palavra-chave identificada no documento.`,
      kind: "technical_term",
      importance: 0.6,
    }));
    const candidates = [...metadataCandidates, ...blocks.flatMap(candidateFromBlock)];
    const byName = new Map<string, KnowledgeConcept>();

    for (const candidate of candidates) {
      const name = candidate.name.replace(/\s+/g, " ").trim().replace(/[.:;,-]+$/, "");
      const normalizedName = normalizeSemanticText(name);
      if (normalizedName.length < 2 || normalizedName.length > 120) continue;
      const current = byName.get(normalizedName);
      if (current) {
        current.aliases = uniqueStrings([...current.aliases, ...(candidate.aliases ?? [])]);
        if (candidate.description.length > current.description.length) current.description = candidate.description;
        current.importance = Math.max(current.importance, candidate.importance ?? 0.5);
        continue;
      }
      byName.set(normalizedName, {
        id: semanticId("concept", content.fileId, normalizedName),
        name,
        normalizedName,
        description: candidate.description,
        kind: candidate.kind,
        aliases: uniqueStrings(candidate.aliases ?? []),
        keywords: uniqueStrings([name, ...(candidate.aliases ?? [])]),
        examples: candidate.examples ?? [],
        observations: candidate.observations ?? [],
        document: content.metadata.name,
        fileId: content.fileId,
        studyId: content.studyId,
        chapter: candidate.chapter,
        section: candidate.section,
        page: candidate.page,
        relationIds: [],
        importance: candidate.importance ?? 0.5,
      });
    }
    return [...byName.values()].sort((left, right) => right.importance - left.importance || left.name.localeCompare(right.name));
  },
};
