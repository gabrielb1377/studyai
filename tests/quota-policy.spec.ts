import { expect, test } from "@playwright/test";
import {
  FALLBACK_ORDER,
  needsSharedQuota,
  providersToCheckFor,
} from "../src/server/ai/quota-policy";

const gemini = { gemini: "AIza-test" };
const allCloud = { gemini: "AIza-test", groq: "gsk-test", openrouter: "sk-or-test" };

test.describe("Política de quota por credencial (Cenários 6 e 7)", () => {
  test("manual com BYOK do provider escolhido não consome quota compartilhada", () => {
    expect(needsSharedQuota(providersToCheckFor("manual", "gemini"), gemini)).toBe(false);
  });

  test("manual sem BYOK consome quota compartilhada", () => {
    expect(needsSharedQuota(providersToCheckFor("manual", "gemini"), {})).toBe(true);
  });

  test("manual groq com BYOK groq não consome quota compartilhada", () => {
    expect(needsSharedQuota(providersToCheckFor("manual", "groq"), { groq: "gsk-test" })).toBe(false);
  });

  test("ollama é keyless e nunca consome quota compartilhada", () => {
    expect(providersToCheckFor("manual", "ollama")).toEqual(["ollama"]);
    expect(needsSharedQuota(["ollama"], {})).toBe(false);
    // Mesmo na cadeia automática, ollama não é o provider que exige chave.
    expect(needsSharedQuota(["ollama", "gemini", "groq", "openrouter"], allCloud)).toBe(false);
  });

  test("automático sem nenhuma chave consome quota compartilhada", () => {
    expect(needsSharedQuota(providersToCheckFor("automatic", undefined), {})).toBe(true);
  });

  test("automático com BYOK para todos os providers cloud não consome quota", () => {
    expect(needsSharedQuota(providersToCheckFor("automatic", undefined), allCloud)).toBe(false);
  });

  test("automático com BYOK parcial consome quota de forma conservadora", () => {
    // Cenário 6: Gemini BYOK pode vencer, mas Groq/OpenRouter compartilhados
    // ainda podem ser acionados pelo fallback; a quota é autorizada antes.
    expect(needsSharedQuota(providersToCheckFor("automatic", undefined), gemini)).toBe(true);
  });

  test("modo ausente espelha ProviderManager (manual, default gemini)", () => {
    expect(providersToCheckFor(undefined, undefined)).toEqual(["gemini"]);
    expect(needsSharedQuota(providersToCheckFor(undefined, undefined), gemini)).toBe(false);
    expect(needsSharedQuota(providersToCheckFor(undefined, undefined), {})).toBe(true);
  });

  test("apenas 'automatic' percorre a cadeia completa de fallback", () => {
    expect(providersToCheckFor("automatic", "groq")).toEqual([...FALLBACK_ORDER]);
    expect(providersToCheckFor("manual", "groq")).toEqual(["groq"]);
    expect(providersToCheckFor("qualquer-outro", "openrouter")).toEqual(["openrouter"]);
  });

  test("chave vazia não conta como BYOK", () => {
    expect(needsSharedQuota(providersToCheckFor("manual", "gemini"), { gemini: "" })).toBe(true);
  });
});
