import { normalizeSemanticText, semanticId } from "./semantic-utils";
import type { KnowledgeConcept, KnowledgeRelation, RelationKind, SemanticBlock } from "./types";

function relation(sourceId: string, targetId: string, kind: RelationKind, evidence: string, weight: number): KnowledgeRelation {
  return { id: semanticId("relation", sourceId, targetId, kind), sourceId, targetId, kind, evidence: evidence.slice(0, 240), weight };
}

export const RelationExtractor = {
  extract(concepts: KnowledgeConcept[], blocks: SemanticBlock[]): KnowledgeRelation[] {
    const relations = new Map<string, KnowledgeRelation>();
    const byNormalized = new Map(concepts.map((concept) => [concept.normalizedName, concept]));
    const add = (item: KnowledgeRelation) => relations.set(item.id, item);

    for (const concept of concepts) {
      for (const alias of concept.aliases) {
        const aliasConcept = byNormalized.get(normalizeSemanticText(alias));
        if (aliasConcept && aliasConcept.id !== concept.id) add(relation(concept.id, aliasConcept.id, "abbreviation_of", `${concept.name} representa ${alias}.`, 1));
      }
    }

    for (const block of blocks) {
      const normalized = normalizeSemanticText(block.text);
      const present = concepts.filter((concept) => normalized.includes(concept.normalizedName)).slice(0, 8);
      block.conceptIds = present.map((concept) => concept.id);
      for (let left = 0; left < present.length; left += 1) {
        for (let right = left + 1; right < present.length; right += 1) {
          const source = present[left];
          const target = present[right];
          let kind: RelationKind = "related_to";
          let weight = 0.55;
          const between = normalized.slice(normalized.indexOf(source.normalizedName) + source.normalizedName.length, normalized.indexOf(target.normalizedName));
          if (/depende|requer|necessita/.test(between)) { kind = "depends_on"; weight = 0.9; }
          else if (/usa|utiliza|aplica/.test(between)) { kind = "uses"; weight = 0.8; }
          else if (/exemplo|caso/.test(normalized) || source.kind === "example") { kind = "example_of"; weight = 0.75; }
          else if (/parte|componente|cap[ií]tulo/.test(between)) { kind = "part_of"; weight = 0.7; }
          add(relation(source.id, target.id, kind, block.text, weight));
        }
      }
    }

    for (const concept of concepts) {
      concept.relationIds = [...relations.values()].filter((item) => item.sourceId === concept.id || item.targetId === concept.id).map((item) => item.id);
    }
    return [...relations.values()];
  },
};
