import { normalizeSemanticText, tokenizeSemantic, uniqueStrings } from "./semantic-utils";
import { KnowledgeStorage } from "./KnowledgeStorage";
import type { ConceptSearchMatch, KnowledgeConcept, KnowledgeContext, KnowledgeGraph } from "./types";

const SYNONYMS: Record<string, string[]> = {
  ia: ["inteligencia artificial", "machine learning", "aprendizado de maquina"],
  algoritmo: ["procedimento", "rotina", "sequencia de passos"],
  banco: ["database", "base de dados", "bd"],
  funcao: ["metodo", "procedimento", "function"],
  vetor: ["array", "arranjo", "lista indexada"],
  recursao: ["recursividade", "chamada recursiva"],
};

function scoreConcept(concept: KnowledgeConcept, queryTerms: readonly string[]) {
  const names = [concept.normalizedName, ...concept.aliases.map(normalizeSemanticText)];
  const description = normalizeSemanticText(concept.description);
  const keywords = concept.keywords.map(normalizeSemanticText);
  const matchedBy = new Set<ConceptSearchMatch["matchedBy"][number]>();
  let score = 0;
  for (const term of queryTerms) {
    if (names.some((name) => name === term || name.includes(term))) { score += 10; matchedBy.add("name"); }
    if (concept.aliases.some((alias) => normalizeSemanticText(alias).includes(term))) { score += 8; matchedBy.add("alias"); }
    if (keywords.some((keyword) => keyword.includes(term))) { score += 5; matchedBy.add("keyword"); }
    if (description.includes(term)) { score += 2; matchedBy.add("description"); }
  }
  return { score: score * (0.7 + concept.importance * 0.3), matchedBy: [...matchedBy] };
}

function relatedConcepts(graph: KnowledgeGraph, concept: KnowledgeConcept) {
  const ids = new Set(graph.relations.filter((relation) => relation.sourceId === concept.id || relation.targetId === concept.id).flatMap((relation) => [relation.sourceId, relation.targetId]));
  ids.delete(concept.id);
  return graph.concepts.filter((candidate) => ids.has(candidate.id)).slice(0, 8);
}

export const SemanticSearchService = {
  expandQuery(query: string, graphs: readonly KnowledgeGraph[]) {
    const normalized = normalizeSemanticText(query);
    const terms = tokenizeSemantic(query);
    const expansions = terms.flatMap((term) => SYNONYMS[term] ?? []);
    for (const graph of graphs) {
      for (const concept of graph.concepts) {
        if (normalized.includes(concept.normalizedName) || concept.aliases.some((alias) => normalized.includes(normalizeSemanticText(alias)))) {
          expansions.push(concept.name, ...concept.aliases);
          for (const related of relatedConcepts(graph, concept).slice(0, 4)) expansions.push(related.name);
        }
      }
    }
    return uniqueStrings([query, ...expansions]).join(" ");
  },

  async search(query: string, options: { studyId?: string; limit?: number } = {}): Promise<KnowledgeContext> {
    const source = await KnowledgeStorage.load();
    const graphs = options.studyId ? source.filter((graph) => graph.studyId === options.studyId) : source;
    const expandedQuery = this.expandQuery(query, graphs);
    const queryTerms = tokenizeSemantic(expandedQuery);
    const matches = graphs.flatMap((graph) => graph.concepts.map((concept) => {
      const ranking = scoreConcept(concept, queryTerms);
      return ranking.score > 0 ? {
        concept,
        graphId: graph.id,
        score: Math.round(ranking.score * 100) / 100,
        matchedBy: ranking.matchedBy,
        related: relatedConcepts(graph, concept),
      } satisfies ConceptSearchMatch : null;
    })).filter((match): match is ConceptSearchMatch => match !== null)
      .sort((left, right) => right.score - left.score)
      .slice(0, options.limit ?? 8);
    const matchedIds = new Set(matches.flatMap((match) => [match.concept.id, ...match.related.map((concept) => concept.id)]));
    const relationCount = graphs.flatMap((graph) => graph.relations).filter((relation) => matchedIds.has(relation.sourceId) && matchedIds.has(relation.targetId)).length;
    return { query, expandedQuery, concepts: matches, relationCount, hasContext: matches.length > 0 };
  },
};
