/**
 * StudyAI — Intelligence Engine (IE-4E)
 * Registro das 3 skills do Lote 5 (Áudio e Computação — 18/20 do catálogo oficial):
 * - audio.learning (0.1.0)
 * - code.teaching (0.1.0)
 * - cs.algorithms (0.1.0)
 */

import type { SkillRegistryImpl } from "../SkillRegistry";
import { audioLearningSkillSpec } from "./audioLearning";
import { codeTeachingSkillSpec } from "./codeTeaching";
import { csAlgorithmsSkillSpec } from "./csAlgorithms";

export function registerAudioComputingSkills(registry: SkillRegistryImpl): void {
  const specs = [audioLearningSkillSpec, codeTeachingSkillSpec, csAlgorithmsSkillSpec];
  for (const spec of specs) {
    if (!registry.has(spec.id, spec.version)) {
      registry.register(spec);
    }
  }
}

export * from "./audioLearning";
export * from "./codeTeaching";
export * from "./csAlgorithms";
export * from "./__fixtures__/audioComputingFixtures";
