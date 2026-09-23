import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Telemetry } from "@/server/observability/Telemetry";

type ObjectStorageMode = "s3" | "database";

let client: S3Client | undefined;

function configured() {
  return Boolean(
    process.env.S3_BUCKET
      && process.env.S3_ACCESS_KEY_ID
      && process.env.S3_SECRET_ACCESS_KEY,
  );
}

function s3() {
  if (!configured()) throw new Error("Object Storage não foi configurado.");
  client ??= new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
  return client;
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export const ObjectStorage = {
  mode(): ObjectStorageMode {
    return configured() ? "s3" : "database";
  },

  key(userId: string, id: string, hash: string) {
    return `users/${safeSegment(userId)}/materials/${safeSegment(id)}/${safeSegment(hash)}`;
  },

  async health() {
    if (!configured()) return { available: false, mode: "database" as const };
    const startedAt = performance.now();
    try {
      await s3().send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET! }));
      return { available: true, mode: "s3" as const, latencyMs: Math.round(performance.now() - startedAt) };
    } catch (error) {
      return {
        available: false,
        mode: "s3" as const,
        latencyMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : "Object Storage indisponível.",
      };
    }
  },

  async put(key: string, content: Buffer, contentType: string, metadata: Record<string, string> = {}) {
    await Telemetry.measure("object-storage.put", () => s3().send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
      Body: content,
      ContentType: contentType,
      CacheControl: "private, max-age=31536000, immutable",
      Metadata: metadata,
      ServerSideEncryption: process.env.S3_SERVER_SIDE_ENCRYPTION === "none" ? undefined : "AES256",
    })));
  },

  async get(key: string) {
    const result = await Telemetry.measure("object-storage.get", () => s3().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key })));
    if (!result.Body) throw new Error("Arquivo vazio no Object Storage.");
    return Buffer.from(await result.Body.transformToByteArray());
  },

  async delete(key: string) {
    await Telemetry.measure("object-storage.delete", () => s3().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key })));
  },
};
