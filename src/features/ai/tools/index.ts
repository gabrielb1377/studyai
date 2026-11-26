/**
 * StudyAI — Tool Engine (TE-1 / TE-2 / TE-3)
 * Ponto de entrada público do subsistema Tool Gateway.
 *
 * Na TE-3, exatamente 4 ferramentas de leitura estão registradas em produção
 * (`calculator`, `library`, `performance`, `errors`), permanecendo todas
 * inacessíveis enquanto `tools.enabled = false`.
 */

import { ToolRegistry } from "./ToolRegistry";
import { registerCalculatorTool } from "./calculator";
import { registerReadTools } from "./read";

// Registra exclusivamente as 4 ferramentas de leitura autorizadas (TE-2 + TE-3)
registerCalculatorTool(ToolRegistry);
registerReadTools(ToolRegistry);

export * from "./config";
export * from "./types";
export * from "./ToolSchemaValidator";
export * from "./ToolRegistry";
export * from "./ToolTurnState";
export * from "./ToolGateway";
export * from "./calculator";
export * from "./read";
