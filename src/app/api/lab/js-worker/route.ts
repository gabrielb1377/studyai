import { NextResponse } from "next/server";
import {
  HARDENED_JS_WORKER_CSP,
  buildHardenedWorkerBootstrapScript,
} from "@/features/lab/services/SafeExecutionService";

export const runtime = "nodejs";

/**
 * Serve o script estático do Web Worker endurecido para execução restrita de JS,
 * aplicando cabeçalho HTTP Content-Security-Policy próprio (`connect-src 'none'`,
 * `worker-src 'none'`, `child-src 'none'`) para contenção nativa pelo navegador.
 */
export async function GET() {
  return new NextResponse(buildHardenedWorkerBootstrapScript(), {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Content-Security-Policy": HARDENED_JS_WORKER_CSP,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
