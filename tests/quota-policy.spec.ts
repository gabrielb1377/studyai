import { expect, test } from "@playwright/test";
import {
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

  test("modo automático legado permanece no provider primário", () => {
    expect(providersToCheckFor("automatic", "gemini")).toEqual(["gemini"]);
    expect(needsSharedQuota(providersToCheckFor("automatic", "gemini"), {})).toBe(true);
  });

  test("automático com BYOK do provider primário não consome quota", () => {
    expect(needsSharedQuota(providersToCheckFor("automatic", "gemini"), allCloud)).toBe(false);
  });

  test("fallback consentido verifica somente a alternativa autorizada", () => {
    expect(providersToCheckFor("manual", "gemini", "groq")).toEqual(["groq"]);
    expect(needsSharedQuota(providersToCheckFor("manual", "gemini", "groq"), gemini)).toBe(true);
    expect(needsSharedQuota(providersToCheckFor("manual", "gemini", "groq"), { groq: "gsk-test" })).toBe(false);
  });

  test("modo ausente espelha ProviderManager (manual, default gemini)", () => {
    expect(providersToCheckFor(undefined, undefined)).toEqual(["gemini"]);
    expect(needsSharedQuota(providersToCheckFor(undefined, undefined), gemini)).toBe(false);
    expect(needsSharedQuota(providersToCheckFor(undefined, undefined), {})).toBe(true);
  });

  test("nenhum modo percorre cadeia de fallback sem consentimento", () => {
    expect(providersToCheckFor("automatic", "groq")).toEqual(["groq"]);
    expect(providersToCheckFor("manual", "groq")).toEqual(["groq"]);
    expect(providersToCheckFor("qualquer-outro", "openrouter")).toEqual(["openrouter"]);
  });

  test("chave vazia não conta como BYOK", () => {
    expect(needsSharedQuota(providersToCheckFor("manual", "gemini"), { gemini: "" })).toBe(true);
  });
});
