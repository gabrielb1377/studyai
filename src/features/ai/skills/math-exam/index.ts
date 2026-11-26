/**
 * StudyAI — Intelligence Engine (IE-4F)
 * Registro das 2 últimas skills do catálogo oficial (20/20 — encerramento da IE-4 / Onda 2):
 * - math.step-by-step (0.1.0)
 * - exam.comparative-analysis (0.1.0)
 */

import type { SkillRegistryImpl } from "../SkillRegistry";
import { mathStepByStepSkillSpec } from "./mathStepByStep";
import { examComparativeAnalysisSkillSpec } from "./examComparativeAnalysis";

export function registerMathExamSkills(registry: SkillRegistryImpl): void {
  const specs = [mathStepByStepSkillSpec, examComparativeAnalysisSkillSpec];
  for (const spec of specs) {
    if (!registry.has(spec.id, spec.version)) {
      registry.register(spec);
    }
  }
}

export * from "./mathStepByStep";
export * from "./examComparativeAnalysis";
export * from "./__fixtures__/mathExamFixtures";
