/**
 * StudyAI — Tool Engine (TE-1)
 * Ponto de entrada público do subsistema Tool Gateway.
 *
 * Na TE-1 nenhuma ferramenta real está conectada ao registro de produção (`ToolRegistry.size() === 0`).
 * A flag `tools.enabled` permanece `false` por padrão.
 */

export * from "./config";
export * from "./types";
export * from "./ToolSchemaValidator";
export * from "./ToolRegistry";
export * from "./ToolTurnState";
export * from "./ToolGateway";
