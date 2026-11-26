/**
 * StudyAI — Intelligence Engine (IE-2 / IE-3)
 * Validação determinística de fundamentação (`sourceRef`) contra o contexto autorizado.
 *
 * Não trata a simples presença de uma string não-vazia como prova de fundamentação:
 * quando trechos autorizados (`RetrievedChunk[]`) são fornecidos, cada `sourceRef`
 * emitido deve corresponder a uma fonte realmente presente no contexto autorizado
 * (ou declarar explicitamente "sem apoio no material", quando permitido pela skill).
 */

import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";

function normalizeRef(value: string): string {
  return value.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

/**
 * Extrai os identificadores e rótulos de origem autorizados presentes nos chunks.
 */
export function extractAuthorizedSourceLabels(chunks: readonly RetrievedChunk[]): readonly string[] {
  const labels = new Set<string>();
  chunks.forEach((chunk, index) => {
    labels.add(normalizeRef(`Trecho ${index + 1}`));
    if (chunk.fileId) labels.add(normalizeRef(chunk.fileId));
    if (chunk.id) labels.add(normalizeRef(chunk.id));
    if (chunk.metadata.sourceName) labels.add(normalizeRef(chunk.metadata.sourceName));
    if (chunk.metadata.title) labels.add(normalizeRef(chunk.metadata.title));
    if (chunk.metadata.chapter) labels.add(normalizeRef(chunk.metadata.chapter));
    if (chunk.metadata.section) labels.add(normalizeRef(chunk.metadata.section));
    if (chunk.metadata.pageStart) {
      labels.add(normalizeRef(`página ${chunk.metadata.pageStart}`));
      labels.add(normalizeRef(`p. ${chunk.metadata.pageStart}`));
    }
  });
  return Array.from(labels).filter((label) => label.length > 0);
}

/**
 * Verifica se um `sourceRef` corresponde a alguma fonte autorizada no contexto.
 */
export function isSourceRefGrounded(
  sourceRef: string,
  authorizedLabels: readonly string[],
  options: { allowExplicitNoSupport?: boolean } = {},
): boolean {
  const normalized = normalizeRef(sourceRef);
  if (!normalized) return false;
  if (options.allowExplicitNoSupport && normalized === "sem apoio no material") {
    return true;
  }
  if (authorizedLabels.length === 0) {
    // Sem contexto de chunks fornecido: não é possível comprovar contra fontes ausentes.
    return options.allowExplicitNoSupport ? normalized === "sem apoio no material" : false;
  }
  return authorizedLabels.some(
    (label) => normalized.includes(label) || label.includes(normalized),
  );
}

/**
 * Valida todos os `sourceRef` encontrados na saída estruturada de uma skill piloto
 * contra os chunks autorizados fornecidos na chamada.
 */
export function validateParsedSourceRefs(
  skillId: string,
  parsed: unknown,
  chunks?: readonly RetrievedChunk[],
): { valid: boolean; errors: string[] } {
  if (!parsed || typeof parsed !== "object") {
    return { valid: true, errors: [] };
  }
  const hasChunks = Boolean(chunks && chunks.length > 0);
  if (!hasChunks && skillId !== "grounding.guard") {
    return { valid: true, errors: [] };
  }

  const authorizedLabels = hasChunks ? extractAuthorizedSourceLabels(chunks!) : [];
  const errors: string[] = [];

  if (skillId === "technique.active-recall") {
    const questions = (parsed as { questions?: Array<{ id?: string; sourceRef?: string }> }).questions;
    if (Array.isArray(questions)) {
      questions.forEach((q, idx) => {
        if (!q.sourceRef || !isSourceRefGrounded(q.sourceRef, authorizedLabels, { allowExplicitNoSupport: false })) {
          errors.push(
            `Questão ${idx + 1} (${q.id ?? "sem-id"}) cita sourceRef "${q.sourceRef ?? ""}" não encontrado no contexto autorizado.`,
          );
        }
      });
    }
  } else if (skillId === "technique.feynman") {
    const gaps = (parsed as { gaps?: Array<{ point?: string; sourceRef?: string }> }).gaps;
    if (Array.isArray(gaps)) {
      gaps.forEach((gap, idx) => {
        if (gap.sourceRef && !isSourceRefGrounded(gap.sourceRef, authorizedLabels, { allowExplicitNoSupport: true })) {
          errors.push(
            `Lacuna ${idx + 1} cita sourceRef "${gap.sourceRef}" não encontrado no contexto autorizado.`,
          );
        }
      });
    }
  } else if (skillId === "grounding.guard") {
    const claims = (parsed as { claims?: Array<{ statement?: string; grounded?: boolean; sourceRef?: string }> }).claims;
    if (Array.isArray(claims)) {
      claims.forEach((claim, idx) => {
        if (claim.grounded && (!claim.sourceRef || !isSourceRefGrounded(claim.sourceRef, authorizedLabels, { allowExplicitNoSupport: false }))) {
          errors.push(
            `Afirmação ${idx + 1} marcada como fundamentada cita sourceRef "${claim.sourceRef ?? ""}" ausente no contexto efetivamente autorizado.`,
          );
        }
      });
    }
  } else if (skillId === "tutor.beginner") {
    const sourceRefs = (parsed as { sourceRefs?: string[] }).sourceRefs;
    if (Array.isArray(sourceRefs)) {
      sourceRefs.forEach((ref, idx) => {
        if (!isSourceRefGrounded(ref, authorizedLabels, { allowExplicitNoSupport: true })) {
          errors.push(
            `Referência ${idx + 1} ("${ref}") não encontrada no contexto efetivamente autorizado.`,
          );
        }
      });
    }
  } else if (skillId === "examples.analogies") {
    const items = (parsed as { items?: Array<{ sourceRef?: string }> }).items;
    if (Array.isArray(items)) {
      items.forEach((item, idx) => {
        if (item.sourceRef && !isSourceRefGrounded(item.sourceRef, authorizedLabels, { allowExplicitNoSupport: true })) {
          errors.push(
            `Exemplo/Analogia ${idx + 1} cita sourceRef "${item.sourceRef}" não encontrado no contexto efetivamente autorizado.`,
          );
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
