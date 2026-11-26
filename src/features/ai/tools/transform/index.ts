/**
 * StudyAI — Tool Engine (TE-4)
 * Registro das 4 ferramentas oficiais da Fase 2 / TE-4:
 * `doc_reader` (leitura), `flashcards` (transformação + escrita confirmada),
 * `quiz` (transformação + correção + escrita confirmada) e
 * `plan` (planejamento determinístico + escrita confirmada).
 */

import type { ToolRegistryImpl } from "../ToolRegistry";
import { docReaderToolSpec, executeDocReaderTool } from "./docReaderTool";
import { executeFlashcardsTool, flashcardsToolSpec } from "./flashcardsTool";
import { executePlanTool, planToolSpec } from "./planTool";
import { executeQuizTool, quizToolSpec } from "./quizTool";

export function registerTransformTools(registry: ToolRegistryImpl): void {
  if (!registry.has("doc_reader")) {
    registry.register(docReaderToolSpec, executeDocReaderTool);
  }
  if (!registry.has("flashcards")) {
    registry.register(flashcardsToolSpec, executeFlashcardsTool);
  }
  if (!registry.has("quiz")) {
    registry.register(quizToolSpec, executeQuizTool);
  }
  if (!registry.has("plan")) {
    registry.register(planToolSpec, executePlanTool);
  }
}

export * from "./AccountTransformProvider";
export * from "./docReaderTool";
export * from "./flashcardsTool";
export * from "./quizTool";
export * from "./planTool";
