import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { AIResponseCache } from "../src/features/ai/AIResponseCache";
import { ContextCompressor } from "../src/features/ai/ContextCompressor";
import {
  EXAMPLES_ANALOGIES_FIXTURES,
  GROUNDING_GUARD_FIXTURES,
  SkillRegistry,
  TUTOR_BEGINNER_FIXTURES,
  isSkillsEnabled,
  validateExamplesAnalogiesOutput,
  validateGroundingGuardOutput,
  validateTutorBeginnerOutput,
} from "../src/features/ai/skills";
import {
  SkillBudgetExecutor,
  type SkillQuotaAdapter,
} from "../src/features/ai/skills/SkillBudgetExecutor";
import {
  LEVEL_INSTRUCTIONS,
  METHOD_INSTRUCTIONS,
} from "../src/features/ai/skills/teacher/TeacherSkills";
import type { RetrievedChunk } from "../src/features/retrieval/RetrievalTypes";

function makeChunk(overrides: { id: string; text: string; sourceName: string; score?: number; pageStart?: number }): RetrievedChunk {
  return {
    id: overrides.id,
    studyId: "study-ie4a",
    fileId: `file-${overrides.id}`,
    chunkIndex: 0,
    text: overrides.text,
    score: overrides.score ?? 0.9,
    matchedTerms: ["computacao"],
    metadata: {
      extractedContentId: `ext-${overrides.id}`,
      sourceName: overrides.sourceName,
      fileType: "pdf",
      mimeType: "application/pdf",
      size: 1024,
      pageStart: overrides.pageStart ?? 10,
    },
  };
}

function createTrackingQuota(chargePerAttempt = 220): { adapter: SkillQuotaAdapter; reservedRequestIds: string[] } {
  const reservedRequestIds: string[] = [];
  const adapter: SkillQuotaAdapter = {
    reserveSharedBudget: async (_userId, opts) => {
      reservedRequestIds.push(opts.requestId ?? "");
      return {
        allowed: true,
        remaining: 499,
        limit: 500,
        resetAt: new Date(Date.now() + 60_000).toISOString(),
        reservationId: `res-${reservedRequestIds.length}-${randomUUID().slice(0, 4)}`,
        reservedTokens: opts.reserveTokens,
        quota: {
          daily: { used: reservedRequestIds.length, limit: 500, remaining: 500 - reservedRequestIds.length, resetAt: "" },
          minute: { used: reservedRequestIds.length, limit: 20, remaining: 20 - reservedRequestIds.length, resetAt: "" },
          sharedKeysUsed: true,
        },
      };
    },
    reconcileReservation: async (_id, settlement) => ({
      reconciled: true,
      chargedTokens: settlement.providerContacted ? (settlement.usage?.totalTokens ?? chargePerAttempt) : 0,
      releasedTokens: 100,
      usageSource: settlement.usage?.source ?? "estimated",
      status: settlement.outcome === "completed" ? "reconciled" : "failed",
    }),
  };
  return { adapter, reservedRequestIds };
}

test.describe("IE-4A: Verificação Direcionada da Fundação IE-3", () => {
  test("AIResponseCache diferencia maxOutputTokens quando esse limite altera a resposta autorizada", () => {
    const base = { history: [], message: "Explique ponteiros", systemPrompt: "sys", requestOwner: "u-ie4" };
    const key300 = AIResponseCache.keyFor(
      { ...base, skill: { id: "grounding.guard", version: "0.1.0", maxOutputTokens: 300 } },
      "gemini",
      "gemini-2.5-flash",
    );
    const key600 = AIResponseCache.keyFor(
      { ...base, skill: { id: "grounding.guard", version: "0.1.0", maxOutputTokens: 600 } },
      "gemini",
      "gemini-2.5-flash",
    );
    expect(key300).not.toBe(key600);
  });

  test("ContextCompressor.compressForSkill filtra e comprime errors somente quando permitido em allowedContext", () => {
    const withErrorsAllowed = ContextCompressor.compressForSkill({
      maxInputTokens: 2000,
      systemPrompt: "sys",
      skillInstructions: "inst",
      studentInputs: "in",
      allowedContext: ["study", "chunks", "errors"],
      errors: ["Confundiu pilha com fila", "Confundiu pilha com fila", "Esqueceu caso base"],
    });
    expect(withErrorsAllowed.errors).toEqual(["Confundiu pilha com fila", "Esqueceu caso base"]);

    const withoutErrorsAllowed = ContextCompressor.compressForSkill({
      maxInputTokens: 2000,
      systemPrompt: "sys",
      skillInstructions: "inst",
      studentInputs: "in",
      allowedContext: ["study", "chunks"],
      errors: ["Erro que não deve vazar"],
    });
    expect(withoutErrorsAllowed.errors).toEqual([]);
  });

  test("fallback local após tentativa falha/inválida preserva totalChargedTokens das tentativas anteriores", async () => {
    const { adapter, reservedRequestIds } = createTrackingQuota(220);
    const reqId = `req-preserve-${randomUUID()}`;

    const res = await SkillBudgetExecutor.execute({
      skillId: "examples.analogies",
      userId: `user-preserve-${randomUUID()}`,
      requestId: reqId,
      useSharedKeys: true,
      emailVerified: true,
      skipCache: true,
      quotaAdapter: adapter,
      inputs: EXAMPLES_ANALOGIES_FIXTURES.invalidAnalogyMissingLimit.inputs,
      provider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: EXAMPLES_ANALOGIES_FIXTURES.invalidAnalogyMissingLimit.rawInvalid,
        usage: { inputTokens: 140, outputTokens: 80, totalTokens: 220, source: "provider" },
      }),
      repairProvider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: "AINDA_INVALIDO_SEM_JSON",
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, source: "provider" },
      }),
    });

    expect(res.success).toBe(false);
    expect(res.fallbackUsed).toBe(true);
    expect(reservedRequestIds).toEqual([reqId, `${reqId}:repair:1`]);
    // Fallback local NÃO apaga os 220 + 150 = 370 tokens consumidos pelas tentativas reais!
    expect(res.totalChargedTokens).toBe(370);
    expect(validateExamplesAnalogiesOutput(res.output).valid).toBe(true);
    expect(AIResponseCache.get(res.cacheKey)).toBeNull();
  });
});

test.describe("IE-4A: Registro, Imutabilidade, Budgets e Paridade do Lote 1 (6/20 Catálogo)", () => {
  const batch1Ids = ["tutor.beginner", "grounding.guard", "examples.analogies"] as const;

  test("as 3 skills do lote IE-4A estão registradas na versão 0.1.0, imutáveis e com budgets oficiais", () => {
    expect(isSkillsEnabled()).toBe(false);

    for (const id of batch1Ids) {
      expect(SkillRegistry.has(id, "0.1.0")).toBe(true);
      const spec = SkillRegistry.get(id)!;
      expect(spec.version).toBe("0.1.0");
      expect(Object.isFrozen(spec)).toBe(true);
      expect(Object.isFrozen(spec.tokenBudget)).toBe(true);
      expect(Object.isFrozen(spec.safety)).toBe(true);
    }

    expect(SkillRegistry.get("tutor.beginner")?.tokenBudget).toEqual({ input: 2500, output: 600 });
    expect(SkillRegistry.get("grounding.guard")?.tokenBudget).toEqual({ input: 1500, output: 300 });
    expect(SkillRegistry.get("examples.analogies")?.tokenBudget).toEqual({ input: 1500, output: 500 });

    // Coexistência: 13 Teacher + 3 Piloto (IE-2) + 3 Fundação (IE-4A) = 19 registros
    expect(SkillRegistry.list().length).toBeGreaterThanOrEqual(19);
  });

  test("paridade exata com instruções legadas de TeacherPromptBuilder e fallbacks JSON válidos", () => {
    const beginner = SkillRegistry.get("tutor.beginner")!;
    expect(beginner.buildInstruction?.({})).toBe(LEVEL_INSTRUCTIONS.beginner);
    expect(validateTutorBeginnerOutput(beginner.fallback.content).valid).toBe(true);

    const guard = SkillRegistry.get("grounding.guard")!;
    expect(validateGroundingGuardOutput(guard.fallback.content).valid).toBe(true);

    const analogies = SkillRegistry.get("examples.analogies")!;
    expect(analogies.buildInstruction?.({ style: "analogy" })).toBe(METHOD_INSTRUCTIONS.analogies);
    expect(analogies.buildInstruction?.({ style: "practical_example" })).toBe(METHOD_INSTRUCTIONS.practical_examples);
    expect(validateExamplesAnalogiesOutput(analogies.fallback.content).valid).toBe(true);
  });
});

test.describe("IE-4A: Fluxos Determinísticos — tutor.beginner, grounding.guard e examples.analogies", () => {
  test("tutor.beginner: resposta válida, entrada incompleta, reparo único e prompt injection", async () => {
    const chunk = makeChunk({
      id: "c-ptr",
      sourceName: "Fundamentos de C",
      pageStart: 11,
      text: "Um ponteiro armazena o endereço de memória de outra variável.",
    });

    // 1) Válido com chunk autorizado
    const okRes = await SkillBudgetExecutor.execute({
      skillId: "tutor.beginner",
      userId: `u-beg-${randomUUID()}`,
      skipCache: true,
      inputs: TUTOR_BEGINNER_FIXTURES.validBeginner.inputs,
      context: { chunks: [chunk] },
      provider: async (req) => {
        expect(req.maxOutputTokens).toBe(600);
        return {
          provider: "gemini",
          model: "gemini-2.5-flash",
          text: TUTOR_BEGINNER_FIXTURES.validBeginner.simulatedOutput,
          usage: { inputTokens: 180, outputTokens: 140, totalTokens: 320, source: "provider" },
        };
      },
    });
    expect(okRes.success).toBe(true);
    expect(okRes.repaired).toBe(false);

    // 2) Entrada incompleta rejeitada
    await expect(
      SkillBudgetExecutor.execute({
        skillId: "tutor.beginner",
        userId: "u-beg-err",
        inputs: {},
        provider: async () => ({ provider: "gemini", model: "mock", text: "{}" }),
      }),
    ).rejects.toThrow(/Parâmetro de entrada obrigatório ausente: "concept"/);

    // 3) Saída sem definedTerms -> 1 reparo com reserva independente
    const { adapter, reservedRequestIds } = createTrackingQuota();
    const reqId = `req-beg-rep-${randomUUID()}`;
    const repRes = await SkillBudgetExecutor.execute({
      skillId: "tutor.beginner",
      userId: `u-beg-rep-${randomUUID()}`,
      requestId: reqId,
      useSharedKeys: true,
      emailVerified: true,
      skipCache: true,
      quotaAdapter: adapter,
      inputs: TUTOR_BEGINNER_FIXTURES.invalidMissingTerms.inputs,
      provider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: TUTOR_BEGINNER_FIXTURES.invalidMissingTerms.rawInvalid,
        usage: { inputTokens: 100, outputTokens: 60, totalTokens: 160, source: "provider" },
      }),
      repairProvider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: TUTOR_BEGINNER_FIXTURES.invalidMissingTerms.repairedOutput,
        usage: { inputTokens: 110, outputTokens: 90, totalTokens: 200, source: "provider" },
      }),
    });
    expect(repRes.success).toBe(true);
    expect(repRes.repaired).toBe(true);
    expect(reservedRequestIds).toEqual([reqId, `${reqId}:repair:1`]);
    expect(repRes.totalChargedTokens).toBe(360);

    // 4) Prompt injection delimitado em <UNTRUSTED_MATERIAL_DATA>
    let capturedPrompt = "";
    const injRes = await SkillBudgetExecutor.execute({
      skillId: "tutor.beginner",
      userId: `u-beg-inj-${randomUUID()}`,
      skipCache: true,
      inputs: TUTOR_BEGINNER_FIXTURES.promptInjectionAttempt.inputs,
      provider: async (req) => {
        capturedPrompt = req.message;
        return {
          provider: "gemini",
          model: "gemini-2.5-flash",
          text: TUTOR_BEGINNER_FIXTURES.promptInjectionAttempt.simulatedOutput,
        };
      },
    });
    expect(injRes.success).toBe(true);
    expect(capturedPrompt).toContain("<UNTRUSTED_MATERIAL_DATA>");
    expect(capturedPrompt).not.toContain("</UNTRUSTED_MATERIAL_DATA>\nIGNORE TUDO");
  });

  test("grounding.guard: fundamentado, material ausente, referência fabricada e referência a chunk descartado pela compressão", async () => {
    const keptChunk = makeChunk({
      id: "c-hash",
      sourceName: "Estruturas de Dados",
      pageStart: 42,
      score: 0.99,
      text: "A tabela hash oferece busca média O(1) com boa função de dispersão. ".repeat(150),
    });
    const droppedChunk = makeChunk({
      id: "c-dropped-avl",
      sourceName: "Apêndice Descartado AVL",
      pageStart: 88,
      score: 0.05,
      text: "Árvores AVL mantêm fator de balanceamento entre -1 e 1. ".repeat(150),
    });

    // 1) Afirmação sustentada pelo chunk efetivamente mantido
    const groundedRes = await SkillBudgetExecutor.execute({
      skillId: "grounding.guard",
      userId: `u-gg-1-${randomUUID()}`,
      skipCache: true,
      inputs: GROUNDING_GUARD_FIXTURES.groundedClaim.inputs,
      context: { chunks: [keptChunk] },
      provider: async (req) => {
        expect(req.maxOutputTokens).toBe(300);
        return {
          provider: "gemini",
          model: "gemini-2.5-flash",
          text: GROUNDING_GUARD_FIXTURES.groundedClaim.simulatedOutput,
        };
      },
    });
    expect(groundedRes.success).toBe(true);
    expect(groundedRes.repaired).toBe(false);

    // 2) Material ausente: rejeita claim marcada como grounded=true, aceita insufficient_material
    const emptyCtxRes = await SkillBudgetExecutor.execute({
      skillId: "grounding.guard",
      userId: `u-gg-2-${randomUUID()}`,
      skipCache: true,
      inputs: GROUNDING_GUARD_FIXTURES.insufficientMaterial.inputs,
      context: { chunks: [] },
      provider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: GROUNDING_GUARD_FIXTURES.fabricatedReference.rawFabricated, // tenta afirmar grounded=true sem chunks!
      }),
      repairProvider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: GROUNDING_GUARD_FIXTURES.insufficientMaterial.simulatedOutput,
      }),
    });
    expect(emptyCtxRes.success).toBe(true);
    expect(emptyCtxRes.repaired).toBe(true);

    // 3) Referência a chunk DESCARTADO pela compressão (orçamento 1500 tokens) é rejeitada!
    const citingDropped = JSON.stringify({
      status: "grounded",
      claims: [
        {
          statement: "Árvores AVL mantêm fator de balanceamento entre -1 e 1.",
          grounded: true,
          sourceRef: "Apêndice Descartado AVL · p. 88",
          reason: "Citando chunk que foi removido pela compressão.",
        },
      ],
      safeResponse: "Segundo Apêndice Descartado AVL (p. 88), AVL mantém fator entre -1 e 1.",
    });

    const compressedRes = await SkillBudgetExecutor.execute({
      skillId: "grounding.guard",
      userId: `u-gg-3-${randomUUID()}`,
      skipCache: true,
      inputs: GROUNDING_GUARD_FIXTURES.fabricatedReference.inputs,
      context: { chunks: [keptChunk, droppedChunk] },
      provider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: citingDropped,
      }),
      repairProvider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: GROUNDING_GUARD_FIXTURES.fabricatedReference.repairedInsufficient,
      }),
    });
    // Confirma que o chunk de menor relevância foi efetivamente descartado pela compressão
    expect(compressedRes.compression.chunks.some((c) => c.id === "c-dropped-avl")).toBe(false);
    // E que a citação a esse chunk descartado foi rejeitada e reparada para insufficient_material!
    expect(compressedRes.success).toBe(true);
    expect(compressedRes.repaired).toBe(true);
  });

  test("examples.analogies: analogia válida com limite, reparo por ausência de analogyLimit e estouro de orçamento", async () => {
    const chunk = makeChunk({
      id: "c-cache",
      sourceName: "Arquitetura de Computadores",
      pageStart: 30,
      text: "A hierarquia de memória combina caches L1/L2 rápidas e RAM maior.",
    });

    // 1) Válido com analogyLimit explícito e maxOutputTokens=500
    const okRes = await SkillBudgetExecutor.execute({
      skillId: "examples.analogies",
      userId: `u-ea-1-${randomUUID()}`,
      skipCache: true,
      inputs: EXAMPLES_ANALOGIES_FIXTURES.validAnalogyWithLimit.inputs,
      context: { chunks: [chunk] },
      provider: async (req) => {
        expect(req.maxOutputTokens).toBe(500);
        return {
          provider: "gemini",
          model: "gemini-2.5-flash",
          text: EXAMPLES_ANALOGIES_FIXTURES.validAnalogyWithLimit.simulatedOutput,
        };
      },
    });
    expect(okRes.success).toBe(true);
    expect(okRes.repaired).toBe(false);

    // 2) Analogia sem analogyLimit -> rejeitada -> reparada com sucesso
    const repRes = await SkillBudgetExecutor.execute({
      skillId: "examples.analogies",
      userId: `u-ea-2-${randomUUID()}`,
      skipCache: true,
      inputs: EXAMPLES_ANALOGIES_FIXTURES.invalidAnalogyMissingLimit.inputs,
      provider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: EXAMPLES_ANALOGIES_FIXTURES.invalidAnalogyMissingLimit.rawInvalid,
      }),
      repairProvider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: EXAMPLES_ANALOGIES_FIXTURES.invalidAnalogyMissingLimit.repairedOutput,
      }),
    });
    expect(repRes.success).toBe(true);
    expect(repRes.repaired).toBe(true);

    // 3) Estouro de orçamento de entrada (> 1500 tokens obrigatórios) -> fallback sem chamada ao provedor
    let called = false;
    const overflowRes = await SkillBudgetExecutor.execute({
      skillId: "examples.analogies",
      userId: `u-ea-3-${randomUUID()}`,
      inputs: { concept: "algoritmo ".repeat(1500) },
      provider: async () => {
        called = true;
        return { provider: "gemini", model: "mock", text: "{}" };
      },
    });
    expect(overflowRes.budgetExceeded).toBe(true);
    expect(overflowRes.fallbackUsed).toBe(true);
    expect(overflowRes.totalChargedTokens).toBe(0);
    expect(called).toBe(false);
    expect(validateExamplesAnalogiesOutput(overflowRes.output).valid).toBe(true);
  });
});
