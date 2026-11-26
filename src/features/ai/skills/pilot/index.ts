/**
 * StudyAI — Intelligence Engine (IE-2)
 * Ponto de entrada e registro das três skills piloto da Onda 2.
 */

import type { SkillRegistryImpl } from "../SkillRegistry";
import { feynmanSkillSpec } from "./feynman";
import { socraticSkillSpec } from "./socratic";
import { activeRecallSkillSpec } from "./activeRecall";

export * from "./feynman";
export * from "./socratic";
export * from "./activeRecall";
export * from "./grounding";
export * from "./SkillExecutionHarness";
export * from "./__fixtures__";

/**
 * Registra as três skills piloto no registro informado.
 */
export function registerPilotSkills(registry: SkillRegistryImpl): void {
  const pilotSpecs = [feynmanSkillSpec, socraticSkillSpec, activeRecallSkillSpec];
  for (const spec of pilotSpecs) {
    if (!registry.has(spec.id, spec.version)) {
      registry.register(spec);
    }
  }
}
