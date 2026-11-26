/**
 * StudyAI — Intelligence Engine (IE-4A)
 * Ponto de entrada e registro do primeiro lote de skills da IE-4 (Fundação Pedagógica):
 * - tutor.beginner (0.1.0)
 * - grounding.guard (0.1.0)
 * - examples.analogies (0.1.0)
 */

import type { SkillRegistryImpl } from "../SkillRegistry";
import { tutorBeginnerSkillSpec } from "./tutorBeginner";
import { groundingGuardSkillSpec } from "./groundingGuard";
import { examplesAnalogiesSkillSpec } from "./examplesAnalogies";

export * from "./tutorBeginner";
export * from "./groundingGuard";
export * from "./examplesAnalogies";
export * from "./__fixtures__/foundationFixtures";

/**
 * Registra as três skills do lote IE-4A no registro informado.
 */
export function registerFoundationSkills(registry: SkillRegistryImpl): void {
  const specs = [tutorBeginnerSkillSpec, groundingGuardSkillSpec, examplesAnalogiesSkillSpec];
  for (const spec of specs) {
    if (!registry.has(spec.id, spec.version)) {
      registry.register(spec);
    }
  }
}
