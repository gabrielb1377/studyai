import { expect, test } from "@playwright/test";
import {
  ACTIVE_RECALL_FIXTURES,
  FEYNMAN_FIXTURES,
  OutputValidator,
  SOCRATIC_FIXTURES,
  SkillExecutionHarness,
  SkillRegistry,
  validateActiveRecallOutput,
  validateFeynmanOutput,
  validateSocraticOutput,
  type FeynmanOutput,
  type SocraticOutput,
} from "../src/features/ai/skills";

test.describe("IE-2: Registro e Contratos Canônicos das Skills Piloto", () => {
  const pilotIds = ["technique.feynman", "technique.socratic", "technique.active-recall"] as const;

  test("as 3 skills piloto estão registradas com id único e versão 0.1.0", () => {
    for (const id of pilotIds) {
      expect(SkillRegistry.has(id, "0.1.0")).toBe(true);
      const spec = SkillRegistry.get(id);
      expect(spec).toBeDefined();
      expect(spec?.id).toBe(id);
      expect(spec?.version).toBe("0.1.0");
    }
  });

  test("as 3 skills piloto coexistem harmonicamente com as 13 skills do Teacher", () => {
    const allSkills = SkillRegistry.list();
    // 13 teacher + 3 piloto = 16 skills distintas
    expect(allSkills.length).toBeGreaterThanOrEqual(16);

    for (const id of pilotIds) {
      expect(allSkills.some((s) => s.id === id)).toBe(true);
    }
    expect(allSkills.some((s) => s.id === "teacher.dialogue")).toBe(true);
  });

  test("imutabilidade das especificações das skills piloto (freeze recursivo)", () => {
    for (const id of pilotIds) {
      const spec = SkillRegistry.get(id);
      expect(spec).toBeDefined();
      expect(Object.isFrozen(spec)).toBe(true);
      expect(Object.isFrozen(spec?.tokenBudget)).toBe(true);
      expect(Object.isFrozen(spec?.safety)).toBe(true);
      expect(Object.isFrozen(spec?.qualityCriteria)).toBe(true);

      expect(() => {
        (spec as unknown as Record<string, unknown>).objective = "Tentativa de mutação";
      }).toThrow();
    }
  });

  test("declarações de tokenBudget e contexto respeitam o catálogo oficial", () => {
    const feynman = SkillRegistry.get("technique.feynman")!;
    expect(feynman.tokenBudget).toEqual({ input: 2500, output: 700 });
    expect(feynman.allowedContext).toContain("study");
    expect(feynman.allowedContext).toContain("chunks");
    expect(feynman.allowedTools).toEqual(["library"]);

    const socratic = SkillRegistry.get("technique.socratic")!;
    expect(socratic.tokenBudget).toEqual({ input: 2500, output: 500 });
    expect(socratic.allowedContext).toContain("history");
    expect(socratic.allowedTools).toEqual(["library"]);

    const activeRecall = SkillRegistry.get("technique.active-recall")!;
    expect(activeRecall.tokenBudget).toEqual({ input: 2000, output: 500 });
    expect(activeRecall.allowedContext).toContain("errors");
    expect(activeRecall.allowedTools).toContain("flashcards");
  });
});

test.describe("IE-2: Validação Pedagógica e Comportamental — Feynman", () => {
  const spec = SkillRegistry.get("technique.feynman")!;

  test("valida saída correta completa e critérios de qualidade", () => {
    const fixture = FEYNMAN_FIXTURES.validCorrect;
    const res = validateFeynmanOutput(fixture.simulatedOutput);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);

    const parsed = res.parsed as FeynmanOutput;
    expect(parsed.understood.length).toBeGreaterThan(0);
    expect(parsed.confidence).toBe("high");
    expect(parsed.simplifiedVersion.split(/\s+/).length).toBeLessThanOrEqual(120);

    // Validador genérico OutputValidator também aprova
    const generalRes = OutputValidator.validate(spec, fixture.simulatedOutput);
    expect(generalRes.valid).toBe(true);
  });

  test("identifica lacunas conceituais e exige fundamentação no material", () => {
    const fixture = FEYNMAN_FIXTURES.conceptualGap;
    const res = validateFeynmanOutput(fixture.simulatedOutput);
    expect(res.valid).toBe(true);

    const parsed = res.parsed as FeynmanOutput;
    expect(parsed.gaps.length).toBeGreaterThan(0);
    expect(parsed.gaps[0].point).toContain("Confusão");
    expect(parsed.gaps[0].sourceRef).toBeDefined();
    expect(parsed.confidence).toBe("low");
  });

  test("rejeita saída que excede o limite máximo de 120 palavras na simplificação", () => {
    const longSimplified = Array(125).fill("palavra").join(" ");
    const invalidOutput = JSON.stringify({
      understood: ["ok"],
      gaps: [],
      simplifiedVersion: longSimplified,
      followUpQuestion: "Pergunta?",
      confidence: "medium",
    });

    const res = validateFeynmanOutput(invalidOutput);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("excedeu 120 palavras"))).toBe(true);
  });

  test("rejeita saída que viole regras de segurança (conteúdo proibido)", () => {
    const pejorativeOutput = JSON.stringify({
      understood: [],
      gaps: [],
      simplifiedVersion: "O estudante possui classificações pejorativas do estudante e não tem capacidade.",
      followUpQuestion: "Como prosseguir?",
      confidence: "low",
    });

    const res = OutputValidator.validate(spec, pejorativeOutput);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("conteúdo proibido"))).toBe(true);
  });
});

test.describe("IE-2: Validação Pedagógica e Comportamental — Socrática", () => {
  const spec = SkillRegistry.get("technique.socratic")!;

  test("valida pergunta socrática aberta na etapa inicial (step 1)", () => {
    const fixture = SOCRATIC_FIXTURES.step1Reasoning;
    const res = validateSocraticOutput(fixture.simulatedOutput);
    expect(res.valid).toBe(true);

    const generalRes = OutputValidator.validate(spec, fixture.simulatedOutput);
    expect(generalRes.valid).toBe(true);

    const parsed = res.parsed as SocraticOutput;
    expect(parsed.nextStep).toBe(2);
    expect(parsed.revealsSolution).toBe(false);
    expect(parsed.guidingQuestion).toBeTruthy();
  });

  test("rejeita rigorosamente entrega antecipada da solução antes do passo final", () => {
    const violationFixture = SOCRATIC_FIXTURES.forbiddenPrematureSolution;
    const res = validateSocraticOutput(violationFixture.rawViolation);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("proíbe revelar a solução prematuramente"))).toBe(true);
  });
});

test.describe("IE-2: Validação Pedagógica e Comportamental — Active Recall", () => {
  const spec = SkillRegistry.get("technique.active-recall")!;

  test("valida lista estruturada de questões de recuperação ativa com sourceRef", () => {
    const fixture = ACTIVE_RECALL_FIXTURES.validSet;
    const res = validateActiveRecallOutput(fixture.simulatedOutput);
    expect(res.valid).toBe(true);

    const parsed = res.parsed as { questions: Array<{ id: string; prompt: string; expectedAnswer: string; sourceRef: string }> };
    expect(parsed.questions).toHaveLength(3);
    for (const q of parsed.questions) {
      expect(q.prompt).toBeTruthy();
      expect(q.expectedAnswer).toBeTruthy();
      expect(q.sourceRef).toBeTruthy();
    }
  });

  test("rejeita questão sem sourceRef para garantir fundamentação", () => {
    const violationFixture = ACTIVE_RECALL_FIXTURES.missingSourceRefViolation;
    const res = validateActiveRecallOutput(violationFixture.rawViolation);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("'sourceRef' é obrigatório"))).toBe(true);
  });

  test("fallback seguro de Active Recall possui formato JSON válido e questão reflexiva", () => {
    const fallbackValidation = validateActiveRecallOutput(spec.fallback.content);
    expect(fallbackValidation.valid).toBe(true);
    expect(fallbackValidation.errors).toHaveLength(0);
  });
});

test.describe("IE-2: Harness de Execução Isolado com Provedor Simulado (R$ 0)", () => {
  test("execução com resposta válida direta (0 reparos)", async () => {
    const fixture = FEYNMAN_FIXTURES.validCorrect;
    const result = await SkillExecutionHarness.execute({
      skillId: "technique.feynman",
      inputs: fixture.inputs,
      provider: async () => fixture.simulatedOutput,
    });

    expect(result.success).toBe(true);
    expect(result.repaired).toBe(false);
    expect(result.fallbackUsed).toBe(false);
    expect(result.attempts).toBe(0);
    expect(result.parsed).toBeDefined();
    expect(result.promptBuilt).toContain("Habilidade pedagógica ativa: technique.feynman");
    expect(result.promptBuilt).toContain("<UNTRUSTED_MATERIAL_DATA>");
  });

  test("execução com saída malformada aciona exatamente 1 reparo com sucesso", async () => {
    const fixture = FEYNMAN_FIXTURES.malformedOutput;
    let repairAttempts = 0;

    const result = await SkillExecutionHarness.execute({
      skillId: "technique.feynman",
      inputs: fixture.inputs,
      provider: async () => fixture.rawMalformed,
      repairProvider: async (prompt) => {
        repairAttempts++;
        expect(prompt).toContain("violou as regras de validação estrutural");
        return fixture.repairedOutput;
      },
    });

    expect(result.success).toBe(true);
    expect(result.repaired).toBe(true);
    expect(result.fallbackUsed).toBe(false);
    expect(result.attempts).toBe(1);
    expect(repairAttempts).toBe(1); // exatamente 1 tentativa
  });

  test("execução com reparo malsucedido ativa fallback seguro (sem loops)", async () => {
    const fixture = SOCRATIC_FIXTURES.forbiddenPrematureSolution;
    let repairAttempts = 0;

    const result = await SkillExecutionHarness.execute({
      skillId: "technique.socratic",
      inputs: fixture.inputs,
      provider: async () => fixture.rawViolation,
      repairProvider: async () => {
        repairAttempts++;
        return "saída ainda completamente inválida";
      },
    });

    expect(result.success).toBe(false);
    expect(result.repaired).toBe(true);
    expect(result.fallbackUsed).toBe(true);
    expect(result.attempts).toBe(1);
    expect(repairAttempts).toBe(1); // estritamente 1 tentativa de reparo
    expect(result.output).toBe(SkillRegistry.get("technique.socratic")?.fallback.content);
  });

  test("rejeita execução quando parâmetro obrigatório de entrada estiver ausente", async () => {
    await expect(
      SkillExecutionHarness.execute({
        skillId: "technique.active-recall",
        inputs: {}, // ausente studyId obrigatório
        provider: async () => "{}",
      }),
    ).rejects.toThrow(/Parâmetro de entrada obrigatório ausente: "studyId"/);
  });

  test("preserva segurança contra prompt injection dentro de entradas não confiáveis", async () => {
    const fixture = FEYNMAN_FIXTURES.promptInjectionAttempt;
    const result = await SkillExecutionHarness.execute({
      skillId: "technique.feynman",
      inputs: fixture.inputs,
      provider: async () => fixture.simulatedOutput,
    });

    expect(result.success).toBe(true);
    // Assegura que o prompt construído neutralizou delimitadores injetados e envolveu em dados
    expect(result.promptBuilt).toContain("<UNTRUSTED_MATERIAL_DATA>");
    expect(result.skillId).toBe("technique.feynman");
    expect(result.version).toBe("0.1.0");
  });
});
