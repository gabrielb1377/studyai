import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";
import { hasPostgres } from "@/server/database/Postgres";
import { ObjectStorage } from "@/server/storage/ObjectStorage";
import { Telemetry } from "@/server/observability/Telemetry";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const storage = await ObjectStorage.health();
  const includeRuntime = process.env.NODE_ENV !== "production" || Boolean(process.env.HEALTH_SECRET && request.headers.get("x-health-secret") === process.env.HEALTH_SECRET);
  return NextResponse.json({
    status: "ok",
    version: packageJson.version,
    timestamp: new Date().toISOString(),
    database: hasPostgres() ? "postgres" : "memory",
    objectStorage: storage,
    ...(includeRuntime ? { runtime: Telemetry.snapshot() } : {}),
  }, { headers: { "cache-control": "no-store" } });
}
