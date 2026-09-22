import "server-only";
import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const encoder = new TextEncoder();
const base64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");

function secret() {
  const value = process.env.AUTH_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET deve possuir ao menos 32 caracteres em produção.");
  return "studyai-development-secret-change-before-production";
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt.toString("base64url")}:${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, saltValue, hashValue] = stored.split(":");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = await scrypt(password, Buffer.from(saltValue, "base64url"), expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function randomToken(bytes = 32) { return randomBytes(bytes).toString("base64url"); }
export function hashToken(token: string) { return createHash("sha256").update(token).digest("base64url"); }

export function signJwt(payload: Record<string, unknown>, expiresInSeconds: number) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(JSON.stringify({ ...payload, iss: "studyai", aud: "studyai-web", iat: now, exp: now + expiresInSeconds }));
  const signature = createHmac("sha256", secret()).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifyJwt<T extends Record<string, unknown>>(token: string): T | null {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) return null;
  const expected = createHmac("sha256", secret()).update(`${header}.${body}`).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number; iss?: string; aud?: string };
    if (payload.iss !== "studyai" || payload.aud !== "studyai-web" || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

export function secureHash(value: unknown) {
  const content = typeof value === "string"
    ? value
    : ArrayBuffer.isView(value)
      ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
      : JSON.stringify(value);
  return createHash("sha256").update(content).digest("base64url");
}

export function constantTimeEqual(left: string, right: string) {
  const a = encoder.encode(left); const b = encoder.encode(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
