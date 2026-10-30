import { NextResponse } from "next/server";
import packageJson from "../../../../../package.json";

export const dynamic = "force-dynamic";

/**
 * Liveness probe.
 *
 * Deve responder 200 enquanto o processo HTTP estiver vivo. Não consulta
 * PostgreSQL, S3, schema ou qualquer dependência externa: uma indisponibilidade
 * temporária de storage não pode fazer o orquestrador reiniciar a aplicação.
 *
 * A readiness continua em `GET /api/health` (banco + schema + storage).
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      check: "liveness",
      version: packageJson.version,
      environment: process.env.NODE_ENV ?? "development",
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: { "cache-control": "no-store" },
    },
  );
}
