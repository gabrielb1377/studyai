/**
 * StudyAI — Tool Engine (TE-1)
 * Feature flag de rollback do Tool Gateway (`tools.enabled`).
 *
 * Conforme STUDYAI_TOOL_ENGINE.md §9:
 * "Gateway atrás de flag (`tools.enabled`); desligar volta ao fluxo atual.
 * Sem mudança de schema."
 *
 * Padrão: false (desabilitado até homologação e conexão controlada nas próximas sprints).
 */

let testOverride: boolean | null = null;

export function isToolsEnabled(): boolean {
  if (testOverride !== null) {
    return testOverride;
  }
  return process.env.NEXT_PUBLIC_ENABLE_AI_TOOLS === "true";
}

/**
 * Permite que suítes de teste alternem a flag de forma determinística
 * e restaurem o padrão (null -> false) ao final de cada cenário.
 */
export function setToolsEnabledForTesting(value: boolean | null): void {
  testOverride = value;
}
