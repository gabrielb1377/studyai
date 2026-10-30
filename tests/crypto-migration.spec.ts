import { expect, test } from "@playwright/test";
import { randomBytes } from "node:crypto";
import {
  decryptApiKey,
  encryptApiKey,
  getEncryptionVersion,
  isV1Encryption,
  isV2Encryption,
  type ApiKeySecrets,
} from "../src/server/security/crypto-core";

const AUTH_SECRET = "test-auth-secret-min-32-chars-long-for-testing-purposes";
const V2_SECRET = "v2-test-secret-min-32-chars-long-for-testing-purposes";
const OTHER_V2_SECRET = "v2-rotated-secret-min-32-chars-long-for-testing";

const v1Only: ApiKeySecrets = { authSecret: AUTH_SECRET };
const withV2: ApiKeySecrets = { authSecret: AUTH_SECRET, apiKeysEncryptionKey: V2_SECRET };

const PLAINTEXT = "AIzaTestKey12345678901234567890";

function tamperCiphertext(payload: string) {
  const parts = payload.split(":");
  const bytes = Buffer.from(parts[4], "base64url");
  for (let i = 0; i < Math.min(bytes.length, 16); i++) bytes[i] = ~bytes[i] & 0xff;
  parts[4] = bytes.toString("base64url");
  return parts.join(":");
}

function tamperTag(payload: string) {
  const parts = payload.split(":");
  const bytes = Buffer.from(parts[3], "base64url");
  bytes[0] = bytes[0] ^ 0xff;
  parts[3] = bytes.toString("base64url");
  return parts.join(":");
}

test.describe("BYOK Crypto v1/v2 — implementação real (crypto-core)", () => {
  test("1. Sem API_KEYS_ENCRYPTION_KEY grava e lê ciphertext v1", async () => {
    const ciphertext = await encryptApiKey(PLAINTEXT, v1Only);
    expect(ciphertext.startsWith("enc:v1:")).toBe(true);
    expect(await decryptApiKey(ciphertext, v1Only)).toBe(PLAINTEXT);
  });

  test("2. Com API_KEYS_ENCRYPTION_KEY grava e lê ciphertext v2", async () => {
    const ciphertext = await encryptApiKey(PLAINTEXT, withV2);
    expect(ciphertext.startsWith("enc:v2:")).toBe(true);
    expect(await decryptApiKey(ciphertext, withV2)).toBe(PLAINTEXT);
  });

  test("3. Modo misto: ciphertext v1 continua legível com a chave v2 configurada", async () => {
    const legacy = await encryptApiKey(PLAINTEXT, v1Only);
    expect(await decryptApiKey(legacy, withV2)).toBe(PLAINTEXT);
  });

  test("4. Dois ciphertexts v1/v2 do mesmo texto usam IVs diferentes", async () => {
    const a = await encryptApiKey(PLAINTEXT, v1Only);
    const b = await encryptApiKey(PLAINTEXT, v1Only);
    const c = await encryptApiKey(PLAINTEXT, withV2);
    const d = await encryptApiKey(PLAINTEXT, withV2);
    expect(a).not.toBe(b);
    expect(c).not.toBe(d);
    expect(a.split(":")[2]).not.toBe(b.split(":")[2]);
    expect(c.split(":")[2]).not.toBe(d.split(":")[2]);
  });

  test("5. Ciphertext v2 não é legível sem API_KEYS_ENCRYPTION_KEY (risco de rollback)", async () => {
    const ciphertext = await encryptApiKey(PLAINTEXT, withV2);
    await expect(decryptApiKey(ciphertext, v1Only)).rejects.toThrow();
  });

  test("6. Chave v2 incorreta não descriptografa", async () => {
    const ciphertext = await encryptApiKey(PLAINTEXT, withV2);
    await expect(
      decryptApiKey(ciphertext, { authSecret: AUTH_SECRET, apiKeysEncryptionKey: OTHER_V2_SECRET })
    ).rejects.toThrow();
  });

  test("7. AUTH_SECRET incorreto não descriptografa ciphertext v1", async () => {
    const ciphertext = await encryptApiKey(PLAINTEXT, v1Only);
    await expect(
      decryptApiKey(ciphertext, { authSecret: "outro-auth-secret-com-32-caracteres-ou-mais" })
    ).rejects.toThrow();
  });

  test("8. Ciphertext adulterado falha (GCM)", async () => {
    const ciphertext = await encryptApiKey(PLAINTEXT, v1Only);
    await expect(decryptApiKey(tamperCiphertext(ciphertext), v1Only)).rejects.toThrow();
  });

  test("9. Auth tag adulterado falha (GCM)", async () => {
    const ciphertext = await encryptApiKey(PLAINTEXT, withV2);
    await expect(decryptApiKey(tamperTag(ciphertext), withV2)).rejects.toThrow();
  });

  test("10. Formato inválido é rejeitado", async () => {
    await expect(decryptApiKey("plain-text-key", v1Only)).rejects.toThrow(/Formato/);
    await expect(decryptApiKey("enc:v1:iv:tag", v1Only)).rejects.toThrow(/Formato/);
  });

  test("11. Versão desconhecida é rejeitada", async () => {
    await expect(decryptApiKey("enc:v3:a:b:c", withV2)).rejects.toThrow(/não suportada/);
  });

  test("12. Rotação de chave: nova API_KEYS_ENCRYPTION_KEY não lê v2 antigo", async () => {
    const ciphertext = await encryptApiKey(PLAINTEXT, withV2);
    await expect(
      decryptApiKey(ciphertext, { authSecret: AUTH_SECRET, apiKeysEncryptionKey: OTHER_V2_SECRET })
    ).rejects.toThrow();
  });

  test("13. Registros v1 e v2 coexistem no banco durante a migração", async () => {
    const legacy = await encryptApiKey("AIzaLegacy", v1Only);
    const modern = await encryptApiKey("AIzaModern", withV2);
    expect(await decryptApiKey(legacy, withV2)).toBe("AIzaLegacy");
    expect(await decryptApiKey(modern, withV2)).toBe("AIzaModern");
  });

  test("14. Cada segredo v2 produz ciphertext distinto para o mesmo texto", async () => {
    const a = await encryptApiKey(PLAINTEXT, withV2);
    const b = await encryptApiKey(PLAINTEXT, {
      authSecret: AUTH_SECRET,
      apiKeysEncryptionKey: OTHER_V2_SECRET,
    });
    expect(a).not.toBe(b);
    expect(await decryptApiKey(a, withV2)).toBe(PLAINTEXT);
    expect(
      await decryptApiKey(b, { authSecret: AUTH_SECRET, apiKeysEncryptionKey: OTHER_V2_SECRET })
    ).toBe(PLAINTEXT);
  });

  test("15. Classificação de versão do envelope", async () => {
    const v1 = await encryptApiKey(PLAINTEXT, v1Only);
    const v2 = await encryptApiKey(PLAINTEXT, withV2);
    expect(getEncryptionVersion(v1)).toBe("v1");
    expect(getEncryptionVersion(v2)).toBe("v2");
    expect(getEncryptionVersion("plain")).toBe("unknown");
    expect(isV1Encryption(v1)).toBe(true);
    expect(isV2Encryption(v1)).toBe(false);
    expect(isV2Encryption(v2)).toBe(true);
    expect(isV1Encryption(v2)).toBe(false);
  });

  test("16. IV tem 12 bytes e não se repete em 50 operações", async () => {
    const ivs = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const ciphertext = await encryptApiKey(PLAINTEXT, withV2);
      const iv = Buffer.from(ciphertext.split(":")[2], "base64url");
      expect(iv).toHaveLength(12);
      expect(randomBytes(12)).not.toEqual(iv);
      ivs.add(iv.toString("base64url"));
    }
    expect(ivs.size).toBe(50);
  });
});
