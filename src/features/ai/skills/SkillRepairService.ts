/**
 * StudyAI — Intelligence Engine (IE-1)
 * Serviço de Reparo e Fallback de Skills Pedagógicas (SkillRepairService).
 * 
 * Conforme STUDYAI_INTELLIGENCE_ENGINE.md e STUDYAI_EDUCATIONAL_SKILLS.md:
 * - Validação inicial via OutputValidator.
 * - Exatamente 1 tentativa de reparo em caso de saída inválida.
 * - Fallback seguro se o reparo também falhar (sem loops de reparo).
 * - Totalmente determinístico e testável sem chamadas de IA pagas.
 */

import { OutputValidator } from "./OutputValidator";
import type { SkillRepairResult, SkillSpec } from "./types";

export interface RepairOptions {
  spec: SkillSpec;
  rawOutput: string;
  repairFn: (prompt: string) => Promise<string>;
}

export const SkillRepairService = {
  /**
   * Constrói o prompt padrão para a tentativa única de reparo estruturado.
   */
  buildRepairPrompt(spec: SkillSpec, rawOutput: string, errors: readonly string[]): string {
    const errorList = errors.map((e) => `- ${e}`).join("\n");
    const formatReq = spec.output.type === "json"
      ? "Responda apenas com um JSON válido conforme o esquema exigido, sem markdown envolvente ou comentários adicionais."
      : spec.output.type === "mermaid"
        ? "Responda com o código Mermaid correto iniciando com a declaração do diagrama."
        : "Responda em formato textual atendendo rigorosamente às seções e requisitos solicitados.";

    return [
      `A resposta gerada para a habilidade "${spec.id}" (v${spec.version}) violou as regras de validação estrutural:`,
      errorList,
      "",
      formatReq,
      "",
      "Texto original a ser corrigido:",
      rawOutput,
    ].join("\n");
  },

  /**
   * Valida a saída e executa no máximo 1 tentativa de reparo se for inválida.
   * Se o reparo falhar, retorna o fallback seguro declarado na SkillSpec.
   */
  async validateOrRepair({ spec, rawOutput, repairFn }: RepairOptions): Promise<SkillRepairResult> {
    // 1. Validação primária
    const initialValidation = OutputValidator.validate(spec, rawOutput);
    if (initialValidation.valid) {
      return {
        success: true,
        output: rawOutput,
        repaired: false,
        fallbackUsed: false,
        attempts: 0,
      };
    }

    // 2. Exatamente 1 tentativa de reparo
    const repairPrompt = this.buildRepairPrompt(spec, rawOutput, initialValidation.errors);
    let repairedOutput = "";
    try {
      repairedOutput = await repairFn(repairPrompt);
    } catch {
      // Se a chamada de reparo lançar erro, ativa fallback imediato
      return {
        success: false,
        output: spec.fallback.content,
        repaired: true,
        fallbackUsed: true,
        errors: [...initialValidation.errors, "Falha na chamada de reparo."],
        attempts: 1,
      };
    }

    // 3. Validação da saída reparada
    const secondaryValidation = OutputValidator.validate(spec, repairedOutput);
    if (secondaryValidation.valid) {
      return {
        success: true,
        output: repairedOutput,
        repaired: true,
        fallbackUsed: false,
        attempts: 1,
      };
    }

    // 4. Reparo falhou: ativação do fallback seguro declarado
    return {
      success: false,
      output: spec.fallback.content,
      repaired: true,
      fallbackUsed: true,
      errors: secondaryValidation.errors,
      attempts: 1,
    };
  },
};
