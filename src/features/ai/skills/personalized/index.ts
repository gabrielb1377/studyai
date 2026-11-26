/**
 * StudyAI — Intelligence Engine (IE-4D)
 * Registro das 3 skills do Lote 4 (Aprendizagem Personalizada — 15/20 do catálogo oficial):
 * - feedback.personal (0.1.0)
 * - review.from-errors (0.1.0)
 * - explain.multimodal (0.1.0)
 */

import type { SkillRegistryImpl } from "../SkillRegistry";
import { feedbackPersonalSkillSpec } from "./feedbackPersonal";
import { reviewFromErrorsSkillSpec } from "./reviewFromErrors";
import { explainMultimodalSkillSpec } from "./explainMultimodal";

export function registerPersonalizedSkills(registry: SkillRegistryImpl): void {
  if (!registry.has(feedbackPersonalSkillSpec.id, feedbackPersonalSkillSpec.version)) {
    registry.register(feedbackPersonalSkillSpec);
  }
  if (!registry.has(reviewFromErrorsSkillSpec.id, reviewFromErrorsSkillSpec.version)) {
    registry.register(reviewFromErrorsSkillSpec);
  }
  if (!registry.has(explainMultimodalSkillSpec.id, explainMultimodalSkillSpec.version)) {
    registry.register(explainMultimodalSkillSpec);
  }
}

export * from "./feedbackPersonal";
export * from "./reviewFromErrors";
export * from "./explainMultimodal";
export * from "./__fixtures__/personalizedFixtures";
