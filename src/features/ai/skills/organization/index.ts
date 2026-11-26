/**
 * StudyAI — Intelligence Engine (IE-4B)
 * Ponto de entrada e registro do segundo lote de skills da IE-4 (Organização do Aprendizado):
 * - doc.analysis (0.1.0)
 * - plan.study (0.1.0)
 * - technique.spaced-repetition (0.1.0)
 */

import type { SkillRegistryImpl } from "../SkillRegistry";
import { docAnalysisSkillSpec } from "./docAnalysis";
import { planStudySkillSpec } from "./planStudy";
import { spacedRepetitionSkillSpec } from "./spacedRepetition";

export * from "./docAnalysis";
export * from "./planStudy";
export * from "./spacedRepetition";
export * from "./__fixtures__/organizationFixtures";

/**
 * Registra as três skills do lote IE-4B no registro informado.
 */
export function registerOrganizationSkills(registry: SkillRegistryImpl): void {
  const specs = [docAnalysisSkillSpec, planStudySkillSpec, spacedRepetitionSkillSpec];
  for (const spec of specs) {
    if (!registry.has(spec.id, spec.version)) {
      registry.register(spec);
    }
  }
}
