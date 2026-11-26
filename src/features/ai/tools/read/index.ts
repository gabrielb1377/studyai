/**
 * StudyAI — Tool Engine (TE-3)
 * Registro das 3 ferramentas de leitura no cliente:
 * - library (0.1.0)
 * - performance (0.1.0)
 * - errors (0.1.0)
 */

import type { ToolRegistryImpl } from "../ToolRegistry";
import { registerLibraryTool } from "./libraryTool";
import { registerPerformanceTool } from "./performanceTool";
import { registerErrorsTool } from "./errorsTool";

export function registerReadTools(registry: ToolRegistryImpl): void {
  registerLibraryTool(registry);
  registerPerformanceTool(registry);
  registerErrorsTool(registry);
}

export * from "./AccountReadProvider";
export * from "./libraryTool";
export * from "./performanceTool";
export * from "./errorsTool";
