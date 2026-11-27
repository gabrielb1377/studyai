/**
 * StudyAI — Tool Engine (TE-5)
 * Registro da ferramenta canônica `js_execution@0.1.0`.
 */

import type { ToolRegistryImpl } from "../ToolRegistry";
import { executeJsExecutionTool, jsExecutionToolSpec } from "./jsExecutionTool";

export function registerExecutionTools(registry: ToolRegistryImpl): void {
  if (!registry.has("js_execution")) {
    registry.register(jsExecutionToolSpec, executeJsExecutionTool);
  }
}

export * from "./jsExecutionTool";
