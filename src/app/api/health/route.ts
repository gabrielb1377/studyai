import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";
import { postgresHealth } from "@/server/database/Postgres";
import { ObjectStorage } from "@/server/storage/ObjectStorage";
import { Telemetry } from "@/server/observability/Telemetry";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const [database, storage] = await Promise.all([
    postgresHealth(),
    ObjectStorage.health(),
  ]);
  const includeRuntime = process.env.NODE_ENV !== "production" || Boolean(process.env.HEALTH_SECRET && request.headers.get("x-health-secret") === process.env.HEALTH_SECRET);
  const production = process.env.NODE_ENV === "production";
  const configuredUrl = process.env.APP_URL?.trim();
  let publicUrlReady = !production;
  if (configuredUrl) {
    try {
      publicUrlReady = new URL(configuredUrl).protocol === "https:";
    } catch {
      publicUrlReady = false;
    }
  }
  const ready = production
    ? publicUrlReady && database.available && database.schemaReady && storage.available
    : true;
  const publicDatabase = {
    available: database.available,
    configured: database.configured,
    schemaReady: database.schemaReady,
    mode: database.mode,
    ...(typeof database.latencyMs === "number" ? { latencyMs: database.latencyMs } : {}),
  };
  const publicStorage = {
    available: storage.available,
    mode: storage.mode,
    ...(typeof storage.latencyMs === "number" ? { latencyMs: storage.latencyMs } : {}),
  };
  return NextResponse.json({
    status: ready ? "ok" : "degraded",
    version: packageJson.version,
    environment: process.env.NODE_ENV ?? "development",
    timestamp: new Date().toISOString(),
    database: database.mode,
    objectStorage: publicStorage,
    checks: {
      application: { publicUrlConfigured: publicUrlReady },
      database: includeRuntime ? database : publicDatabase,
      objectStorage: includeRuntime ? storage : publicStorage,
    },
    ...(includeRuntime ? { runtime: Telemetry.snapshot() } : {}),
  }, {
    status: ready ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
