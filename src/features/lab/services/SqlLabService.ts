import type { Database, SqlJsStatic } from "sql.js";
import type { LabExecutionResult } from "../types";

let runtime: Promise<SqlJsStatic> | undefined;
function loadRuntime() {
  runtime ??= import("sql.js").then((module) => module.default({ locateFile: () => "/vendor/sql-wasm.wasm" }));
  return runtime;
}

const forbidden = /\b(?:ATTACH|DETACH|LOAD_EXTENSION)\b/i;

export class SqlLabSession {
  private database?: Database;

  async execute(sql: string): Promise<LabExecutionResult> {
    const started = performance.now();
    const createdAt = new Date().toISOString();
    if (sql.length > 40_000) return { status: "error", output: [], error: "A consulta excede o limite seguro.", durationMs: 0, createdAt };
    if (forbidden.test(sql)) return { status: "error", output: [], error: "Este comando não é permitido no ambiente SQL local.", durationMs: 0, createdAt };
    try {
      this.database ??= new (await loadRuntime()).Database();
      const sets = this.database.exec(sql);
      const last = sets.at(-1);
      return {
        status: "success",
        output: last ? [`${last.values.length} linha(s)`] : ["Comando executado."],
        columns: last?.columns,
        rows: last?.values as Array<Array<string | number | null>> | undefined,
        durationMs: Math.round(performance.now() - started),
        createdAt,
      };
    } catch (error) {
      return { status: "error", output: [], error: error instanceof Error ? error.message : "Erro ao executar SQL.", durationMs: Math.round(performance.now() - started), createdAt };
    }
  }

  reset() { this.database?.close(); this.database = undefined; }
  dispose() { this.reset(); }
}
