/**
 * StudyAI — Tool Engine (TE-5)
 * Registro da ferramenta canônica `diagram@0.1.0`.
 */

import type { ToolRegistryImpl } from "../ToolRegistry";
import { diagramToolSpec, executeDiagramTool } from "./diagramTool";

export function registerDiagramTool(registry: ToolRegistryImpl): void {
  if (!registry.has("diagram")) {
    registry.register(diagramToolSpec, executeDiagramTool);
  }
}

export * from "./diagramTool";
