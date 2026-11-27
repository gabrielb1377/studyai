/**
 * StudyAI — Tool Engine (TE-1 / TE-2 / TE-3 / TE-4 / TE-5)
 * Ponto de entrada público do subsistema Tool Gateway.
 *
 * Na TE-5, exatamente 10 ferramentas canônicas estão registradas em produção:
 * - Leitura (5): `calculator`, `library`, `performance`, `errors`, `doc_reader`
 * - Transformação (4): `flashcards`, `quiz`, `plan`, `diagram`
 * - Execução restrita (1): `js_execution`
 * Todas permanecem inacessíveis enquanto `tools.enabled = false`.
 * `audio` (Fase 3 / fora do escopo TE-1..TE-5) segue não registrada.
 */

import { ToolRegistry } from "./ToolRegistry";
import { registerCalculatorTool } from "./calculator";
import { registerDiagramTool } from "./diagram";
import { registerExecutionTools } from "./execution";
import { registerReadTools } from "./read";
import { registerTransformTools } from "./transform";

// Registra exclusivamente as 10 ferramentas canônicas autorizadas (TE-2..TE-5)
registerCalculatorTool(ToolRegistry);
registerReadTools(ToolRegistry);
registerTransformTools(ToolRegistry);
registerDiagramTool(ToolRegistry);
registerExecutionTools(ToolRegistry);

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
export * from "./diagram";
export * from "./execution";
