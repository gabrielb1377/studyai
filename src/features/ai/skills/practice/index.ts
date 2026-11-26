/**
 * StudyAI — Intelligence Engine (IE-4C)
 * Ponto de entrada e registro do terceiro lote de skills da IE-4 (Preparação e Prática):
 * - practice.adaptive (0.1.0)
 * - exam.preparation (0.1.0)
 * - gap.detection (0.1.0)
 */

import type { SkillRegistryImpl } from "../SkillRegistry";
import { practiceAdaptiveSkillSpec } from "./practiceAdaptive";
import { examPreparationSkillSpec } from "./examPreparation";
import { gapDetectionSkillSpec } from "./gapDetection";

export * from "./practiceAdaptive";
export * from "./examPreparation";
export * from "./gapDetection";
export * from "./__fixtures__/practiceFixtures";

/**
 * Registra as três skills do lote IE-4C no registro informado.
 */
export function registerPracticeSkills(registry: SkillRegistryImpl): void {
  const specs = [practiceAdaptiveSkillSpec, examPreparationSkillSpec, gapDetectionSkillSpec];
  for (const spec of specs) {
    if (!registry.has(spec.id, spec.version)) {
      registry.register(spec);
    }
  }
}
