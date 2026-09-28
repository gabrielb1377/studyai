import type { AcademyContentKind, AcademyStudy } from "../types";

const kindFactor: Record<AcademyContentKind, number> = {
  "study-material": 1,
  "learning-path": 1.15,
  "practical-project": 1.25,
};

const depthFactor: Record<AcademyStudy["depth"], number> = {
  essential: 0.7,
  balanced: 1,
  deep: 1.45,
};

export function estimateAcademyGeneration(study: AcademyStudy, kind: AcademyContentKind) {
  const estimatedOutputTokens = Math.round(Math.max(1_800, study.duration * 42) * kindFactor[kind] * depthFactor[study.depth]);
  return {
    estimatedOutputTokens,
    isLong: estimatedOutputTokens > 5_000,
    stages: 3,
  };
}
