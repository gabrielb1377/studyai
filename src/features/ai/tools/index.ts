/**
 * StudyAI — Tool Engine (TE-1 / TE-2)
 * Ponto de entrada público do subsistema Tool Gateway.
 *
 * Na TE-2, apenas a ferramenta de leitura `calculator` está registrada em produção
 * (`ToolRegistry.size() === 1`), permanecendo inacessível enquanto `tools.enabled = false`.
 */

import { ToolRegistry } from "./ToolRegistry";
import { registerCalculatorTool } from "./calculator";

// Registra exclusivamente a 1ª ferramenta real (TE-2: Calculadora) no registro de produção
registerCalculatorTool(ToolRegistry);

export * from "./config";
export * from "./types";
export * from "./ToolSchemaValidator";
export * from "./ToolRegistry";
export * from "./ToolTurnState";
export * from "./ToolGateway";
export * from "./calculator";
