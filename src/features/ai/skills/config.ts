/**
 * Feature flag do subsistema de Skills Pedagógicas (IE-1 / Rollback).
 * 
 * Conforme STUDYAI_INTELLIGENCE_ENGINE.md:
 * "Registro atrás de uma flag de configuração (skills.enabled) com caminho legado
 * intacto; reverter é desligar a flag. Sem migração de dados."
 * 
 * Padrão: false (desabilitado em produção até homologação da onda).
 */

let testOverride: boolean | null = null;

export function isSkillsEnabled(): boolean {
  if (testOverride !== null) {
    return testOverride;
  }
  return process.env.NEXT_PUBLIC_ENABLE_AI_SKILLS === "true";
}

/**
 * Permite que suítes de teste alternem o estado do flag de forma determinística
 * e limpem a sobrescrita após os testes.
 */
export function setSkillsEnabledForTesting(value: boolean | null): void {
  testOverride = value;
}
