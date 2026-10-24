import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
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

function apiKeysEncryptionSecret(): string | undefined {
  return process.env.API_KEYS_ENCRYPTION_KEY;
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

const ENCRYPTION_SALT_V1 = Buffer.from("studyai-api-key-encryption-v1", "utf8");
const ENCRYPTION_SALT_V2 = Buffer.from("studyai-api-key-encryption-v2", "utf8");

async function encryptionKeyV1(): Promise<Buffer> {
  return scrypt(secret(), ENCRYPTION_SALT_V1, 32) as Promise<Buffer>;
}

async function encryptionKeyV2(): Promise<Buffer> {
  const apiKeySecret = apiKeysEncryptionSecret();
  if (apiKeySecret) {
    return scrypt(apiKeySecret, ENCRYPTION_SALT_V2, 32) as Promise<Buffer>;
  }
  // Fallback to v1 key for backward compatibility during migration
  return encryptionKeyV1();
}

export async function encryptSecret(plaintext: string): Promise<string> {
  // Use v2 if API_KEYS_ENCRYPTION_KEY is configured, otherwise v1
  const useV2 = !!apiKeysEncryptionSecret();
  if (useV2) {
    const key = await encryptionKeyV2();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:v2:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
  } else {
    // Legacy v1 encryption
    const key = await encryptionKeyV1();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
  }
}

export async function decryptSecret(payload: string): Promise<string> {
  const parts = payload.split(":");
  if (parts.length !== 5 || parts[0] !== "enc") throw new Error("Formato de segredo inválido.");
  const version = parts[1];
  if (version === "v1") {
    // Legacy v1 decryption
    const key = await encryptionKeyV1();
    const iv = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    const ciphertext = Buffer.from(parts[4], "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } else if (version === "v2") {
    // New v2 decryption
    const key = await encryptionKeyV2();
    const iv = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    const ciphertext = Buffer.from(parts[4], "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } else {
    throw new Error(`Versão de criptografia não suportada: ${version}`);
  }
}

export function getEncryptionVersion(payload: string): "v1" | "v2" | "unknown" {
  const parts = payload.split(":");
  if (parts.length !== 5 || parts[0] !== "enc") return "unknown";
  if (parts[1] === "v1") return "v1";
  if (parts[1] === "v2") return "v2";
  return "unknown";
}

export function isV1Encryption(payload: string): boolean {
  return getEncryptionVersion(payload) === "v1";
}

export function isV2Encryption(payload: string): boolean {
  return getEncryptionVersion(payload) === "v2";
}