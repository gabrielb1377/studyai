import { expect, test } from "@playwright/test";
import {
  compareSemver,
  DuplicateSkillError,
  InvalidSkillError,
  isSkillsEnabled,
  OutputValidator,
  setSkillsEnabledForTesting,
  SkillRegistry,
  SkillRepairService,
  type SkillSpec,
} from "../src/features/ai/skills";
import { TeacherPromptBuilder } from "../src/features/teacher/TeacherPromptBuilder";
import {
  teacherActions,
  teacherLevels,
  teacherMethods,
  teacherSummaryStyles,
  type TeacherRequest,
} from "../src/features/teacher/types";

test.describe("IE-1: SkillSpec e SkillRegistry", () => {
  test.afterEach(() => {
    setSkillsEnabledForTesting(null);
  });

  test("compara versões semver corretamente", () => {
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(compareSemver("1.0.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareSemver("0.1.0", "0.2.0")).toBeLessThan(0);
    expect(compareSemver("1.2.3", "1.2.4")).toBeLessThan(0);
    expect(compareSemver("2.0.0", "1.99.99")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0", "1.0.0-alpha")).toBeGreaterThan(0);
  });

  test("as 13 skills do Teacher estão registradas por padrão na versão 1.0.0", () => {
    for (const action of teacherActions) {
      const skillId = `teacher.${action}`;
      expect(SkillRegistry.has(skillId, "1.0.0")).toBe(true);
      const spec = SkillRegistry.get(skillId);
      expect(spec).toBeDefined();
      expect(spec?.id).toBe(skillId);
      expect(spec?.version).toBe("1.0.0");
      expect(spec?.tokenBudget.input).toBeGreaterThan(0);
      expect(spec?.tokenBudget.output).toBeGreaterThan(0);
      expect(spec?.safety.doNotLeakInstructions).toBe(true);
      expect(spec?.fallback.content).toBeTruthy();
    }
  });

  test("recusa especificações com id, versão ou campos obrigatórios inválidos", () => {
    const baseValidSpec: SkillSpec = {
      id: "test.valid",
      version: "1.0.0",
      objective: "Objetivo de teste",
      triggers: [{ type: "action", value: "test" }],
      inputs: { schema: { type: "object" } },
      allowedContext: ["study"],
      allowedTools: ["library"],
      output: { type: "text" },
      tokenBudget: { input: 1000, output: 500 },
      safety: { doNotLeakInstructions: true },
      qualityCriteria: { criteria: ["Critério 1"] },
      fallback: { type: "text", content: "Fallback seguro" },
    };

    expect(() => {
      SkillRegistry.register({ ...baseValidSpec, id: "INVALID ID!" });
    }).toThrow(InvalidSkillError);

    expect(() => {
      SkillRegistry.register({ ...baseValidSpec, id: "test.invalid-semver", version: "v1.0" });
    }).toThrow(InvalidSkillError);

    expect(() => {
      SkillRegistry.register({ ...baseValidSpec, id: "test.no-objective", objective: "" });
    }).toThrow(InvalidSkillError);

    expect(() => {
      SkillRegistry.register({ ...baseValidSpec, id: "test.no-triggers", triggers: [] });
    }).toThrow(InvalidSkillError);

    expect(() => {
      SkillRegistry.register({
        ...baseValidSpec,
        id: "test.negative-budget",
        tokenBudget: { input: -10, output: 500 },
      });
    }).toThrow(InvalidSkillError);
  });

  test("rejeita duplicidade de registro (mesmo id e mesma versão)", () => {
    const customSpec: SkillSpec = {
      id: "test.custom-duplicate",
      version: "0.1.0",
      objective: "Teste de duplicidade",
      triggers: [{ type: "explicit", value: "test" }],
      inputs: { schema: {} },
      allowedContext: ["study"],
      allowedTools: ["library"],
      output: { type: "text" },
      tokenBudget: { input: 1000, output: 500 },
      safety: {},
      qualityCriteria: { criteria: [] },
      fallback: { type: "text", content: "Fallback" },
    };

    SkillRegistry.register(customSpec);
    expect(() => {
      SkillRegistry.register(customSpec);
    }).toThrow(DuplicateSkillError);
  });

  test("garante imutabilidade absoluta da especificação registrada (freeze)", () => {
    const spec = SkillRegistry.get("teacher.dialogue");
    expect(spec).toBeDefined();
    expect(Object.isFrozen(spec)).toBe(true);
    expect(Object.isFrozen(spec?.tokenBudget)).toBe(true);
    expect(Object.isFrozen(spec?.safety)).toBe(true);

    expect(() => {
      (spec as unknown as Record<string, unknown>).objective = "Mutação proibida";
    }).toThrow();
  });

  test("resolve a versão semver mais recente quando versão é omitida", () => {
    const v1: SkillSpec = {
      id: "test.version-resolution",
      version: "1.0.0",
      objective: "Versão 1.0.0",
      triggers: [{ type: "action", value: "v1" }],
      inputs: { schema: {} },
      allowedContext: ["study"],
      allowedTools: ["library"],
      output: { type: "text" },
      tokenBudget: { input: 1000, output: 500 },
      safety: {},
      qualityCriteria: { criteria: [] },
      fallback: { type: "text", content: "Fallback v1" },
    };

    const v2: SkillSpec = {
      ...v1,
      version: "1.2.0",
      objective: "Versão 1.2.0",
    };

    const v09: SkillSpec = {
      ...v1,
      version: "0.9.0",
      objective: "Versão 0.9.0",
    };

    SkillRegistry.register(v1);
    SkillRegistry.register(v2);
    SkillRegistry.register(v09);

    const latest = SkillRegistry.get("test.version-resolution");
    expect(latest?.version).toBe("1.2.0");
    expect(latest?.objective).toBe("Versão 1.2.0");

    const exactV09 = SkillRegistry.get("test.version-resolution", "0.9.0");
    expect(exactV09?.version).toBe("0.9.0");

    const versions = SkillRegistry.listVersions("test.version-resolution");
    expect(versions).toEqual(["0.9.0", "1.0.0", "1.2.0"]);
  });
});

test.describe("IE-1: OutputValidator", () => {
  const jsonSpec: SkillSpec = {
    id: "test.json-spec",
    version: "1.0.0",
    objective: "Validar JSON",
    triggers: [{ type: "action", value: "json" }],
    inputs: { schema: {} },
    allowedContext: ["study"],
    allowedTools: ["library"],
    output: {
      type: "json",
      requiredKeys: ["understood", "gaps"],
    },
    tokenBudget: { input: 1000, output: 500 },
    safety: {},
    qualityCriteria: { criteria: [], maxOutputWords: 50 },
    fallback: { type: "json", content: "{}" },
  };

  test("valida JSON bem formatado e extrai de bloco markdown", () => {
    const rawMarkdown = "```json\n{\n  \"understood\": [\"ponto 1\"],\n  \"gaps\": []\n}\n```";
    const res = OutputValidator.validate(jsonSpec, rawMarkdown);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.parsed).toEqual({ understood: ["ponto 1"], gaps: [] });
  });

  test("rejeita JSON mal formatado ou com chaves obrigatórias ausentes", () => {
    const invalidJson = "{ invalid json ";
    const res1 = OutputValidator.validate(jsonSpec, invalidJson);
    expect(res1.valid).toBe(false);
    expect(res1.errors.some((e) => e.includes("JSON inválido"))).toBe(true);

    const missingKey = "{\"understood\": []}";
    const res2 = OutputValidator.validate(jsonSpec, missingKey);
    expect(res2.valid).toBe(false);
    expect(res2.errors.some((e) => e.includes("gaps"))).toBe(true);
  });

  test("valida saída Mermaid e rejeita formato não compatível", () => {
    const mermaidSpec: SkillSpec = {
      id: "test.mermaid-spec",
      version: "1.0.0",
      objective: "Validar Mermaid",
      triggers: [{ type: "action", value: "diagram" }],
      inputs: { schema: {} },
      allowedContext: ["study"],
      allowedTools: ["diagram"],
      output: { type: "mermaid" },
      tokenBudget: { input: 1000, output: 500 },
      safety: {},
      qualityCriteria: { criteria: [] },
      fallback: { type: "text", content: "flowchart TD\nA-->B" },
    };

    const validMermaid = "```mermaid\nflowchart TD\n  A[Início] --> B[Fim]\n```";
    expect(OutputValidator.validate(mermaidSpec, validMermaid).valid).toBe(true);

    const validBareMermaid = "mindmap\n  root((Conceito))\n    ideia1\n    ideia2";
    expect(OutputValidator.validate(mermaidSpec, validBareMermaid).valid).toBe(true);

    const invalidMermaid = "Aqui está o resumo dos conceitos em texto puro sem diagrama.";
    const invalidRes = OutputValidator.validate(mermaidSpec, invalidMermaid);
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.errors.some((e) => e.includes("Mermaid"))).toBe(true);
  });

  test("respeita limite máximo de palavras (maxOutputWords)", () => {
    const longText = Array(60).fill("palavra").join(" ");
    const res = OutputValidator.validate(jsonSpec, longText);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("excedeu o limite máximo"))).toBe(true);
  });
});

test.describe("IE-1: SkillRepairService e Fallback", () => {
  const testSpec: SkillSpec = {
    id: "test.repair-spec",
    version: "1.0.0",
    objective: "Testar reparo determinístico",
    triggers: [{ type: "action", value: "repair" }],
    inputs: { schema: {} },
    allowedContext: ["study"],
    allowedTools: ["library"],
    output: {
      type: "json",
      requiredKeys: ["result"],
    },
    tokenBudget: { input: 1000, output: 500 },
    safety: {},
    qualityCriteria: { criteria: [] },
    fallback: {
      type: "json",
      content: JSON.stringify({ result: "fallback_padrao_seguro" }),
    },
  };

  test("retorna diretamente se a saída inicial já for válida (0 tentativas de reparo)", async () => {
    let repairCalls = 0;
    const repairFn = async () => {
      repairCalls++;
      return "{}";
    };

    const res = await SkillRepairService.validateOrRepair({
      spec: testSpec,
      rawOutput: JSON.stringify({ result: "ok" }),
      repairFn,
    });

    expect(res.success).toBe(true);
    expect(res.repaired).toBe(false);
    expect(res.fallbackUsed).toBe(false);
    expect(res.attempts).toBe(0);
    expect(repairCalls).toBe(0);
  });

  test("executa exatamente 1 tentativa de reparo quando a saída inicial é inválida", async () => {
    let repairCalls = 0;
    let receivedPrompt = "";

    const repairFn = async (prompt: string) => {
      repairCalls++;
      receivedPrompt = prompt;
      return JSON.stringify({ result: "corrigido_com_sucesso" });
    };

    const res = await SkillRepairService.validateOrRepair({
      spec: testSpec,
      rawOutput: "saida inicial inválida sem JSON",
      repairFn,
    });

    expect(res.success).toBe(true);
    expect(res.repaired).toBe(true);
    expect(res.fallbackUsed).toBe(false);
    expect(res.attempts).toBe(1);
    expect(repairCalls).toBe(1);
    expect(receivedPrompt).toContain("violou as regras de validação estrutural");
    expect(res.output).toContain("corrigido_com_sucesso");
  });

  test("ativa fallback seguro e encerra se o reparo também falhar (sem loop infinito)", async () => {
    let repairCalls = 0;
    const repairFn = async () => {
      repairCalls++;
      return "ainda_invalido_sem_json";
    };

    const res = await SkillRepairService.validateOrRepair({
      spec: testSpec,
      rawOutput: "primeira_tentativa_invalida",
      repairFn,
    });

    expect(res.success).toBe(false);
    expect(res.repaired).toBe(true);
    expect(res.fallbackUsed).toBe(true);
    expect(res.attempts).toBe(1);
    expect(repairCalls).toBe(1); // estritamente 1 tentativa de reparo, sem loop
    expect(res.output).toBe(testSpec.fallback.content);
  });

  test("ativa fallback imediato se repairFn lançar exceção", async () => {
    const repairFn = async () => {
      throw new Error("Falha de rede simulada");
    };

    const res = await SkillRepairService.validateOrRepair({
      spec: testSpec,
      rawOutput: "invalido",
      repairFn,
    });

    expect(res.success).toBe(false);
    expect(res.fallbackUsed).toBe(true);
    expect(res.output).toBe(testSpec.fallback.content);
  });
});

test.describe("IE-1: Paridade Estrita do TeacherPromptBuilder e Feature Flag", () => {
  test.afterEach(() => {
    setSkillsEnabledForTesting(null);
  });

  test("feature flag isSkillsEnabled respeita override e padrão false", () => {
    setSkillsEnabledForTesting(null);
    delete process.env.NEXT_PUBLIC_ENABLE_AI_SKILLS;
    expect(isSkillsEnabled()).toBe(false);

    setSkillsEnabledForTesting(true);
    expect(isSkillsEnabled()).toBe(true);

    setSkillsEnabledForTesting(false);
    expect(isSkillsEnabled()).toBe(false);
  });

  test("paridade estrita em todas as 13 ações, 5 níveis e 7 métodos entre flag ligada e desligada", () => {
    for (const action of teacherActions) {
      for (const level of teacherLevels) {
        for (const method of teacherMethods) {
          const req: TeacherRequest = {
            mode: "teacher",
            action,
            level,
            method,
            summaryStyle: "medium",
          };

          // Com flag desligada (legado)
          setSkillsEnabledForTesting(false);
          const legacyInstruction = TeacherPromptBuilder.instruction(req);
          const legacyActionMsg = TeacherPromptBuilder.actionMessage(action);

          // Com flag ligada (skills registry)
          setSkillsEnabledForTesting(true);
          const skillsInstruction = TeacherPromptBuilder.instruction(req);
          const skillsActionMsg = TeacherPromptBuilder.actionMessage(action);

          expect(skillsInstruction).toBe(legacyInstruction);
          expect(skillsActionMsg).toBe(legacyActionMsg);
        }
      }
    }
  });

  test("paridade estrita com exerciseStage progressivo (etapas 1, 2 e 3)", () => {
    for (const stage of [1, 2, 3]) {
      const req: TeacherRequest = {
        mode: "teacher",
        action: "exercise",
        level: "intermediate",
        method: "step_by_step",
        summaryStyle: "medium",
        exerciseStage: stage,
      };

      setSkillsEnabledForTesting(false);
      const legacy = TeacherPromptBuilder.instruction(req);
      const legacyMsg = TeacherPromptBuilder.actionMessage("exercise", null, undefined, stage);

      setSkillsEnabledForTesting(true);
      const modern = TeacherPromptBuilder.instruction(req);
      const modernMsg = TeacherPromptBuilder.actionMessage("exercise", null, undefined, stage);

      expect(modern).toBe(legacy);
      expect(modernMsg).toBe(legacyMsg);
      expect(modern).toContain(`Etapa ${stage}`);
    }
  });

  test("paridade estrita em todos os formatos de adaptive_summary", () => {
    for (const summaryStyle of teacherSummaryStyles) {
      const req: TeacherRequest = {
        mode: "teacher",
        action: "adaptive_summary",
        level: "intermediate",
        method: "traditional",
        summaryStyle,
      };

      setSkillsEnabledForTesting(false);
      const legacy = TeacherPromptBuilder.instruction(req);
      const legacyMsg = TeacherPromptBuilder.actionMessage("adaptive_summary", null, summaryStyle);

      setSkillsEnabledForTesting(true);
      const modern = TeacherPromptBuilder.instruction(req);
      const modernMsg = TeacherPromptBuilder.actionMessage("adaptive_summary", null, summaryStyle);

      expect(modern).toBe(legacy);
      expect(modernMsg).toBe(legacyMsg);
    }
  });

  test("paridade estrita em audio_lesson com preferências de áudio", () => {
    const req: TeacherRequest = {
      mode: "teacher",
      action: "audio_lesson",
      level: "advanced",
      method: "socratic",
      summaryStyle: "medium",
      voice: "pt-BR-FranciscaNeural",
      rate: 1.25,
      autoplay: true,
    };

    setSkillsEnabledForTesting(false);
    const legacy = TeacherPromptBuilder.instruction(req);

    setSkillsEnabledForTesting(true);
    const modern = TeacherPromptBuilder.instruction(req);

    expect(modern).toBe(legacy);
    expect(modern).toContain("pt-BR-FranciscaNeural");
    expect(modern).toContain("1.25x");
  });

  test("paridade estrita com trecho selecionado e opção omitSelection", () => {
    const req: TeacherRequest = {
      mode: "teacher",
      action: "explain_selection",
      level: "beginner",
      method: "analogies",
      summaryStyle: "medium",
      selection: {
        text: "Trecho importante sobre fotossíntese",
        sourceName: "Biologia Volume 1",
        page: 42,
        chapter: "Capítulo 3",
      },
    };

    // Sem omitSelection
    setSkillsEnabledForTesting(false);
    const legacyDefault = TeacherPromptBuilder.instruction(req);
    setSkillsEnabledForTesting(true);
    const modernDefault = TeacherPromptBuilder.instruction(req);
    expect(modernDefault).toBe(legacyDefault);
    expect(modernDefault).toContain("Trecho importante sobre fotossíntese");
    expect(modernDefault).toContain("Biologia Volume 1 · página 42 · Capítulo 3");

    // Com omitSelection: true
    setSkillsEnabledForTesting(false);
    const legacyOmitted = TeacherPromptBuilder.instruction(req, { omitSelection: true });
    setSkillsEnabledForTesting(true);
    const modernOmitted = TeacherPromptBuilder.instruction(req, { omitSelection: true });
    expect(modernOmitted).toBe(legacyOmitted);
    expect(modernOmitted).not.toContain("Trecho importante sobre fotossíntese");
  });
});
