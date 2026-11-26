/**
 * StudyAI — Tool Engine (TE-1 / TE-2 / TE-3 / TE-4)
 * Ponto de entrada público do subsistema Tool Gateway.
 *
 * Na TE-4, exatamente 8 ferramentas canônicas estão registradas em produção:
 * - Leitura (5): `calculator`, `library`, `performance`, `errors`, `doc_reader`
 * - Transformação com escrita confirmada (3): `flashcards`, `quiz`, `plan`
 * Todas permanecem inacessíveis enquanto `tools.enabled = false`.
 * Ferramentas da TE-5/Fase 3 (`diagram`, `js_execution`, `audio`) continuam não registradas.
 */

import { ToolRegistry } from "./ToolRegistry";
import { registerCalculatorTool } from "./calculator";
import { registerReadTools } from "./read";
import { registerTransformTools } from "./transform";

// Registra exclusivamente as ferramentas canônicas autorizadas (TE-2 + TE-3 + TE-4)
registerCalculatorTool(ToolRegistry);
registerReadTools(ToolRegistry);
registerTransformTools(ToolRegistry);

export * from "./config";
export * from "./types";
export * from "./ToolCrypto";
export * from "./ToolConfirmationService";
export * from "./ToolSchemaValidator";
export * from "./ToolRegistry";
export * from "./ToolTurnState";
export * from "./ToolGateway";
export * from "./calculator";
export * from "./read";
export * from "./transform";
