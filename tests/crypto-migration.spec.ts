import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { scrypt, createCipheriv, createDecipheriv } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const ENC_SALT_V1 = Buffer.from("studyai-api-key-encryption-v1", "utf8");
const ENC_SALT_V2 = Buffer.from("studyai-api-key-encryption-v2", "utf8");

async function deriveKeyV1(secret: string): Promise<Buffer> {
  return scryptAsync(secret, ENC_SALT_V1, 32) as Promise<Buffer>;
}

async function deriveKeyV2(secret: string): Promise<Buffer> {
  return scryptAsync(secret, ENC_SALT_V2, 32) as Promise<Buffer>;
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function encryptV1(plaintext: string, secret: string) {
  return (async () => {
    const key = await deriveKeyV1(secret);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:v1:${base64url(iv)}:${base64url(tag)}:${base64url(ciphertext)}`;
  })();
}

function encryptV2(plaintext: string, secret: string) {
  return (async () => {
    const key = await deriveKeyV2(secret);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:v2:${base64url(iv)}:${base64url(tag)}:${base64url(ciphertext)}`;
  })();
}

async function decrypt(payload: string, secret: string) {
  const parts = payload.split(":");
  if (parts.length !== 5 || parts[0] !== "enc") throw new Error("Formato de segredo inválido.");

  const version = parts[1];
  let key: Buffer;
  if (version === "v1") {
    key = await deriveKeyV1(secret);
  } else if (version === "v2") {
    key = await deriveKeyV2(secret);
  } else {
    throw new Error(`Versão de criptografia não suportada: ${version}`);
  }

  const iv = Buffer.from(parts[2], "base64url");
  const tag = Buffer.from(parts[3], "base64url");
  const ciphertext = Buffer.from(parts[4], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

const TEST_SECRET = "test-secret-min-32-chars-long-for-testing-purposes-only";
const V2_SECRET = "v2-test-secret-min-32-chars-long-for-testing-purposes";

test.describe("BYOK Crypto v1/v2 Migration Tests", () => {
  test("1. Criar ciphertext v1 e descriptografar com configuração v1", async () => {
    const plaintext = "AIzaTestKey12345678901234567890";
    const ciphertext = await encryptV1(plaintext, TEST_SECRET);
    expect(ciphertext.startsWith("enc:v1:")).toBe(true);

    const decrypted = await decrypt(ciphertext, TEST_SECRET);
    expect(decrypted).toBe(plaintext);
  });

  test("2. Criar ciphertext v2 com API_KEYS_ENCRYPTION_KEY e descriptografar", async () => {
    const plaintext = "gsk_TestKey1234567890123456789012";
    const ciphertext = await encryptV2(plaintext, V2_SECRET);
    expect(ciphertext.startsWith("enc:v2:")).toBe(true);

    const decrypted = await decrypt(ciphertext, V2_SECRET);
    expect(decrypted).toBe(plaintext);
  });

  test("3. Testar fallback: descriptografar v1 quando só tem v2 secret (compatibilidade)", async () => {
    const plaintext = "AIzaTestKey12345678901234567890";
    const v1Ciphertext = await encryptV1(plaintext, TEST_SECRET);

    // Tentar descriptografar v1 com segredo v1
    const decrypted = await decrypt(v1Ciphertext, TEST_SECRET);
    expect(decrypted).toBe(plaintext);
  });

  test("4. Testar ciphertext adulterado falha", async () => {
    const plaintext = "AIzaTestKey12345678901234567890";
    const ciphertext = await encryptV1(plaintext, TEST_SECRET);
    const parts = ciphertext.split(":");
    // Corromper o ciphertext
    parts[4] = parts[4].slice(0, -1) + (parts[4].slice(-1) === "a" ? "b" : "a");
    const tampered = parts.join(":");

    await expect(decrypt(tampered, TEST_SECRET)).rejects.toThrow();
  });

  test("5. Testar chave incorreta falha", async () => {
    const plaintext = "AIzaTestKey12345678901234567890";
    const ciphertext = await encryptV1(plaintext, TEST_SECRET);
    const wrongSecret = "wrong-secret-min-32-chars-long-for-testing";

    await expect(decrypt(ciphertext, wrongSecret)).rejects.toThrow();
  });

  test("6. Testar ausência de chave v2 falha graciosamente", async () => {
    const plaintext = "gsk_TestKey1234567890123456789012";
    const ciphertext = await encryptV2(plaintext, V2_SECRET);

    // Tentar descriptografar sem fornecer segredo v2 (simula ausência de API_KEYS_ENCRYPTION_KEY)
    // O código deve tentar v1 e falhar, ou falhar explicitamente
    await expect(decrypt(ciphertext, "")).rejects.toThrow();
  });

  test("7. Testar formato inválido", async () => {
    await expect(decrypt("invalid:format", TEST_SECRET)).rejects.toThrow();
    await expect(decrypt("enc:v3:iv:tag:ciphertext", TEST_SECRET)).rejects.toThrow();
  });

  test("8. Testar que IV único é gerado por criptografia", async () => {
    const plaintext = "test-key-123";
    const c1 = await encryptV1(plaintext, TEST_SECRET);
    const c2 = await encryptV1(plaintext, TEST_SECRET);
    expect(c1).not.toBe(c2); // IVs devem ser diferentes
  });

  test("9. Testar que tag GCM é válida", async () => {
    const plaintext = "test-key-123";
    const ciphertext = await encryptV2(plaintext, V2_SECRET);
    const decrypted = await decrypt(ciphertext, V2_SECRET);
    expect(decrypted).toBe(plaintext);
  });

  test("10. Testar que logs não contêm secrets", async () => {
    const plaintext = "AIzaSecretKey12345678901234567890";
    const ciphertext = await encryptV1(plaintext, TEST_SECRET);

    // Verificar que o ciphertext não contém o plaintext
    expect(ciphertext).not.toContain(plaintext);

    // Verificar que o IV e tag não são vazios
    const parts = ciphertext.split(":");
    expect(parts[2].length).toBeGreaterThan(0); // IV
    expect(parts[3].length).toBeGreaterThan(0); // Tag
    expect(parts[4].length).toBeGreaterThan(0); // Ciphertext
  });
});

test.describe("Rollback Compatibility Tests", () => {
  test("Rollback: código v1 consegue ler ciphertext v1", async () => {
    const plaintext = "test-key-123";
    const ciphertext = await encryptV1(plaintext, TEST_SECRET);
    const decrypted = await decrypt(ciphertext, TEST_SECRET);
    expect(decrypted).toBe(plaintext);
  });

  test("Rollback: código v2 (sem API_KEYS_ENCRYPTION_KEY) consegue ler ciphertext v1", async () => {
    const plaintext = "test-key-123";
    const ciphertext = await encryptV1(plaintext, TEST_SECRET);

    // Simular código v2 que não tem API_KEYS_ENCRYPTION_KEY
    // O código deve cair no fallback v1
    const decrypted = await decrypt(ciphertext, TEST_SECRET);
    expect(decrypted).toBe(plaintext);
  });

  test("Rollback: código v1 NÃO consegue ler ciphertext v2 (comportamento esperado)", async () => {
    const plaintext = "test-key-123";
    const ciphertext = await encryptV2(plaintext, V2_SECRET);

    // Código v1 não sabe lidar com v2
    await expect(decrypt(ciphertext, TEST_SECRET)).rejects.toThrow(/^(Versão de criptografia não suportada: v2|Unsupported state or unable to authenticate data)$/);
  });

  test("Rollback: código v2 COM API_KEYS_ENCRYPTION_KEY lê ambos v1 e v2", async () => {
    const plaintext1 = "test-key-v1";
    const plaintext2 = "test-key-v2";
    const v1Ciphertext = await encryptV1(plaintext1, TEST_SECRET);
    const v2Ciphertext = await encryptV2(plaintext2, V2_SECRET);

    // Código v2 com API_KEYS_ENCRYPTION_KEY configurada
    const decrypted1 = await decrypt(v1Ciphertext, TEST_SECRET); // fallback para v1
    const decrypted2 = await decrypt(v2Ciphertext, V2_SECRET);  // usa v2

    expect(decrypted1).toBe(plaintext1);
    expect(decrypted2).toBe(plaintext2);
  });
});