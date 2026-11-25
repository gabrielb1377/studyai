/**
 * StudyAI — Intelligence Engine (IE-1)
 * Validador determinístico de saída para Skills Pedagógicas (OutputValidator).
 * 
 * Conforme STUDYAI_INTELLIGENCE_ENGINE.md:
 * - Valida saída contra esquema e formato declarado na SkillSpec.
 * - Validação estrutural de tipos: json, mermaid, text.
 * - Checagem de chaves obrigatórias e critérios de qualidade (ex: limite de palavras).
 * - Sem chamadas externas ou juiz pago na CI padrão.
 */

import type { SkillSpec, SkillValidationResult } from "./types";

const MERMAID_DIAGRAM_TYPES = [
  "flowchart",
  "graph",
  "mindmap",
  "timeline",
  "sequencediagram",
  "classdiagram",
  "statediagram",
  "erdiagram",
  "gantt",
  "pie",
];

export const OutputValidator = {
  /**
   * Extrai bloco JSON mesmo se o modelo envolver em blocos de markdown ```json ... ```.
   */
  extractJson(text: string): { jsonStr: string; extracted: boolean } {
    const trimmed = text.trim();
    const markdownMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch && markdownMatch[1]) {
      return { jsonStr: markdownMatch[1].trim(), extracted: true };
    }
    return { jsonStr: trimmed, extracted: false };
  },

  /**
   * Extrai bloco Mermaid se houver formatação com ```mermaid ... ```.
   */
  extractMermaid(text: string): string {
    const trimmed = text.trim();
    const markdownMatch = trimmed.match(/```(?:mermaid)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch && markdownMatch[1]) {
      return markdownMatch[1].trim();
    }
    return trimmed;
  },

  /**
   * Valida a saída gerada contra a especificação da skill.
   */
  validate(spec: SkillSpec, output: string): SkillValidationResult {
    const errors: string[] = [];
    if (!output || typeof output !== "string" || output.trim().length === 0) {
      return {
        valid: false,
        errors: ["A saída gerada está vazia."],
      };
    }

    const trimmed = output.trim();
    let parsed: unknown = undefined;

    // 1. Validação por tipo de saída
    if (spec.output.type === "json") {
      const { jsonStr } = this.extractJson(trimmed);
      try {
        parsed = JSON.parse(jsonStr);
      } catch (err) {
        errors.push(`Formato JSON inválido: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (parsed !== undefined) {
        if (typeof parsed !== "object" || parsed === null) {
          errors.push("A saída JSON deve ser um objeto ou array estruturado.");
        } else if (spec.output.requiredKeys && !Array.isArray(parsed)) {
          for (const key of spec.output.requiredKeys) {
            if (!(key in parsed) || (parsed as Record<string, unknown>)[key] === undefined) {
              errors.push(`Chave obrigatória ausente no JSON: "${key}".`);
            }
          }
        }
      }
    } else if (spec.output.type === "mermaid") {
      const mermaidContent = this.extractMermaid(trimmed);
      const firstLine = mermaidContent.split("\n")[0]?.trim().toLowerCase() || "";
      const hasValidStart = MERMAID_DIAGRAM_TYPES.some((diagramType) =>
        firstLine.startsWith(diagramType),
      );
      if (!hasValidStart && !trimmed.includes("```mermaid")) {
        errors.push(`A saída Mermaid deve iniciar com uma declaração de diagrama válida (${MERMAID_DIAGRAM_TYPES.slice(0, 4).join(", ")}) ou estar em bloco \`\`\`mermaid.`);
      }
    } else if (spec.output.type === "text") {
      if (spec.output.requiredKeys) {
        for (const req of spec.output.requiredKeys) {
          if (!trimmed.includes(req)) {
            errors.push(`Seção ou termo obrigatório ausente no texto: "${req}".`);
          }
        }
      }
    }

    // 2. Validação de qualidade / palavras máximas se configurado
    if (spec.qualityCriteria.maxOutputWords) {
      const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
      if (wordCount > spec.qualityCriteria.maxOutputWords) {
        errors.push(`Saída excedeu o limite máximo de palavras permitido (${wordCount} > ${spec.qualityCriteria.maxOutputWords}).`);
      }
    }

    // 3. Validação ativa de regras de segurança: termos ou padrões proibidos (forbiddenOutputs)
    if (spec.safety?.forbiddenOutputs && spec.safety.forbiddenOutputs.length > 0) {
      const lower = trimmed.toLowerCase();
      for (const forbidden of spec.safety.forbiddenOutputs) {
        if (lower.includes(forbidden.toLowerCase())) {
          errors.push(`A saída violou a regra de segurança ao conter conteúdo proibido: "${forbidden}".`);
        }
      }
    }

    // 4. Validador customizado fornecido pela própria especificação
    if (spec.output.validator) {
      try {
        const customResult = spec.output.validator(trimmed);
        if (!customResult.valid) {
          errors.push(...customResult.errors);
        }
      } catch (err) {
        errors.push(`Erro na execução do validador customizado: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      parsed,
    };
  },
};
