import type { KnowledgeScore } from "@/features/learning/types";
import type { KnowledgeGraph } from "./types";

export type PrerequisiteRecommendation = {
  studyId: string;
  concept: string;
  prerequisite: string;
  reason: string;
};

export const LearningKnowledgeBridge = {
  recommend(graphs: readonly KnowledgeGraph[], scores: readonly KnowledgeScore[]): PrerequisiteRecommendation[] {
    const difficultStudies = new Set(scores.filter((score) => score.classification === "difficult" || score.classification === "forgotten").map((score) => score.studyId));
    return graphs.filter((graph) => difficultStudies.has(graph.studyId)).flatMap((graph) => graph.relations
      .filter((relation) => relation.kind === "depends_on" || relation.kind === "prerequisite_of")
      .map((relation) => {
        const source = graph.concepts.find((concept) => concept.id === relation.sourceId);
        const target = graph.concepts.find((concept) => concept.id === relation.targetId);
        if (!source || !target) return null;
        return {
          studyId: graph.studyId,
          concept: relation.kind === "depends_on" ? source.name : target.name,
          prerequisite: relation.kind === "depends_on" ? target.name : source.name,
          reason: `Revise ${relation.kind === "depends_on" ? target.name : source.name} antes de aprofundar ${relation.kind === "depends_on" ? source.name : target.name}.`,
        } satisfies PrerequisiteRecommendation;
      }).filter((item): item is PrerequisiteRecommendation => item !== null))
      .slice(0, 3);
  },
};
