import { expect, test } from "@playwright/test";
import { isSkillsEnabled } from "../src/features/ai/skills";
import {
  CALCULATOR_MAX_EXPRESSION_LENGTH,
  ToolGateway,
  ToolRegistry,
  ToolTurnManager,
  calculatorToolSpec,
  defaultToolGateway,
  executeCalculatorTool,
  isToolsEnabled,
  setToolsEnabledForTesting,
  type CalculatorToolOutput,
  type ToolAuditEvent,
  type ToolTrustedContext,
} from "../src/features/ai/tools";
import { MathLabService } from "../src/features/lab/services/MathLabService";

function makeMathContext(overrides: Partial<ToolTrustedContext> = {}): ToolTrustedContext {
  return {
    userId: "user-te2-a",
    sessionId: "sess-te2-1",
    turnId: "turn-te2-1",
    skillId: "math.step-by-step", // allowedTools: ["calculator"]
    grantedScopes: ["account"],
    grantedPermissions: ["read"],
    ...overrides,
  };
}

test.afterEach(() => {
  setToolsEnabledForTesting(null);
});

test.describe("TE-2: Registro Único, Flag Desligada e Autorização", () => {
  test("registra exclusivamente calculator@0.1.0 (classe read), respeita tools.enabled=false e recusa skills não autorizadas", async () => {
    expect(isToolsEnabled()).toBe(false);
    expect(isSkillsEnabled()).toBe(false);
    expect(ToolRegistry.has("calculator")).toBe(true);
    expect(ToolRegistry.list().every((t) => t.class === "read")).toBe(true);

    const entry = ToolRegistry.get("calculator")!;
    expect(entry.spec.version).toBe("0.1.0");
    expect(entry.spec.class).toBe("read");
    expect(entry.spec.requiresConfirmation).toBe(false);
    expect(Object.isFrozen(entry.spec)).toBe(true);
    expect(calculatorToolSpec.limits.maxCallsPerTurn).toBe(3);

    // 1. Flag desligada recusa execução mesmo para math.step-by-step
    const disabledRes = await defaultToolGateway.execute(
      JSON.stringify({ tool: "calculator", args: { expression: "2 + 2" } }),
      makeMathContext({ turnId: "t-disabled" }),
    );
    expect(disabledRes.ok).toBe(false);
    expect(disabledRes.denialReason).toBe("tools_disabled");

    // 2. Com flag ligada, skill sem permissão ('tutor.beginner') é recusada
    setToolsEnabledForTesting(true);
    const unauthSkill = await defaultToolGateway.execute(
      JSON.stringify({ tool: "calculator", args: { expression: "2 + 2" } }),
      makeMathContext({ turnId: "t-unauth", skillId: "tutor.beginner" }),
    );
    expect(unauthSkill.ok).toBe(false);
    expect(unauthSkill.denialReason).toBe("tool_not_authorized_for_skill");

    // 3. Argumentos inválidos e campos extras recusados
    const extraArg = await defaultToolGateway.execute(
      JSON.stringify({ tool: "calculator", args: { expression: "2 + 2", precisionOverride: 10 } }),
      makeMathContext({ turnId: "t-extra" }),
    );
    expect(extraArg.ok).toBe(false);
    expect(extraArg.denialReason).toBe("invalid_arguments");
  });
});

test.describe("TE-2: Paridade Direta com MathLabService (Operações Reais Suportadas)", () => {
  test("produz resultado idêntico ao MathLabService.execute para precedência, funções suportadas e aproximações", async () => {
    setToolsEnabledForTesting(true);
    const gateway = new ToolGateway({ registry: ToolRegistry, turnManager: new ToolTurnManager() });

    const cases: ReadonlyArray<{
      expr: string;
      expected: number;
      expectedPrecision: "exact" | "approximate";
    }> = [
      { expr: "(2 + 3) * 4", expected: 20, expectedPrecision: "exact" },
      { expr: "2 + 3 * 4 ^ 2", expected: 50, expectedPrecision: "exact" },
      { expr: "10 % 3", expected: 1, expectedPrecision: "exact" },
      { expr: "sqrt(2)", expected: 1.4142, expectedPrecision: "approximate" },
      { expr: "abs(-7.5) + max(3, 9, 2)", expected: 16.5, expectedPrecision: "exact" },
      { expr: "pow(2, 5) + sin(0)", expected: 32, expectedPrecision: "approximate" },
    ];

    for (let i = 0; i < cases.length; i += 1) {
      const tc = cases[i]!;
      // Referência real direta do MathLabService
      const directMathLab = MathLabService.execute(tc.expr);
      expect(directMathLab.status).toBe("success");
      const directVal = Number(directMathLab.metrics?.find((m) => m.label === "Resultado")?.value);
      expect(directVal).toBe(tc.expected);

      // Caminho oficial: math.step-by-step -> ToolGateway -> MathLabService -> resultado validado e delimitado
      const res = await gateway.execute(
        JSON.stringify({ tool: "calculator", args: { expression: tc.expr } }),
        makeMathContext({ turnId: `t-parity-${i}` }),
      );
      expect(res.ok).toBe(true);
      const out = res.output as CalculatorToolOutput;
      expect(out.status).toBe("success");
      expect(out.numericResult).toBe(directVal);
      expect(out.precision).toBe(tc.expectedPrecision);
      expect(res.wrappedOutput).toContain("<UNTRUSTED_MATERIAL_DATA>");
      expect(res.wrappedOutput).toContain("</UNTRUSTED_MATERIAL_DATA>");
    }
  });
});

test.describe("TE-2: Erros Matemáticos, Segurança e Limites Computacionais", () => {
  test("recusa divisão por zero, domínio inválido, Infinity/NaN, entradas maliciosas, excesso de tamanho e profundidade AST", async () => {
    setToolsEnabledForTesting(true);
    const gateway = new ToolGateway({ registry: ToolRegistry, turnManager: new ToolTurnManager() });

    // 1. Divisão por zero
    const divZero = await gateway.execute(
      JSON.stringify({ tool: "calculator", args: { expression: "10 / 0" } }),
      makeMathContext({ turnId: "t-err-1" }),
    );
    expect(divZero.ok).toBe(true);
    expect((divZero.output as CalculatorToolOutput).status).toBe("error");
    expect((divZero.output as CalculatorToolOutput).errorCategory).toBe("division_by_zero");
    expect((divZero.output as CalculatorToolOutput).numericResult).toBeUndefined();

    // 2. Domínio inválido (raiz negativa / log negativo)
    const badDomain = await gateway.execute(
      JSON.stringify({ tool: "calculator", args: { expression: "sqrt(-4)" } }),
      makeMathContext({ turnId: "t-err-2" }),
    );
    expect(badDomain.ok).toBe(true);
    expect((badDomain.output as CalculatorToolOutput).status).toBe("error");
    expect((badDomain.output as CalculatorToolOutput).errorCategory).toBe("invalid_domain");

    // 3. Resultado não finito (Infinity) nunca retornado como número válido
    const overflowNum = await gateway.execute(
      JSON.stringify({ tool: "calculator", args: { expression: "10 ^ 400" } }),
      makeMathContext({ turnId: "t-err-3" }),
    );
    expect(overflowNum.ok).toBe(true);
    expect((overflowNum.output as CalculatorToolOutput).status).toBe("error");
    expect((overflowNum.output as CalculatorToolOutput).errorCategory).toBe("non_finite_result");
    expect((overflowNum.output as CalculatorToolOutput).numericResult).toBeUndefined();

    // 4. Expressões maliciosas recusadas
    const maliciousExpressions = [
      'eval("1 + 1")',
      'new Function("return 1")()',
      "<script>alert(1)</script>",
      "process.exit(1)",
      "SELECT * FROM users",
    ];
    for (let i = 0; i < maliciousExpressions.length; i += 1) {
      const res = await gateway.execute(
        JSON.stringify({ tool: "calculator", args: { expression: maliciousExpressions[i] } }),
        makeMathContext({ turnId: `t-mal-${i}` }),
      );
      expect(res.ok).toBe(true);
      expect((res.output as CalculatorToolOutput).status).toBe("error");
      expect((res.output as CalculatorToolOutput).errorCategory).toBe("unsupported_operation");
    }

    // 5. Profundidade AST excessiva (> 64) bloqueada deterministicamente pelo MathLabService
    const deepExpr = `${"(".repeat(80)}1${")".repeat(80)}`;
    const deepRes = await gateway.execute(
      JSON.stringify({ tool: "calculator", args: { expression: deepExpr } }),
      makeMathContext({ turnId: "t-deep" }),
    );
    expect(deepRes.ok).toBe(true);
    expect((deepRes.output as CalculatorToolOutput).status).toBe("error");
    expect((deepRes.output as CalculatorToolOutput).errorCategory).toBe("complexity_limit_exceeded");

    // 6. Entrada > 40.000 caracteres recusada tanto pelo Gateway quanto pelo adaptador direto
    const hugeExpr = `1${"+1".repeat(CALCULATOR_MAX_EXPRESSION_LENGTH / 2 + 10)}`;
    const hugeGateway = await gateway.execute(
      JSON.stringify({ tool: "calculator", args: { expression: hugeExpr } }),
      makeMathContext({ turnId: "t-huge" }),
    );
    expect(hugeGateway.ok).toBe(false);

    const hugeDirect = executeCalculatorTool(
      { expression: hugeExpr },
      { userId: "u", sessionId: "s", turnId: "t", skillId: "math.step-by-step" },
    ) as CalculatorToolOutput;
    expect(hugeDirect.status).toBe("error");
    expect(hugeDirect.errorCategory).toBe("length_limit_exceeded");
  });
});

test.describe("TE-2: Limite de Turno, Concorrência, Isolamento de Chaves e Auditoria Sanitizada", () => {
  test("aplica limite de 3 chamadas concorrentes, impede colisão de chaves de contexto e mantém auditoria sanitizada", async () => {
    setToolsEnabledForTesting(true);
    const auditEvents: ToolAuditEvent[] = [];
    const gateway = new ToolGateway({
      registry: ToolRegistry,
      turnManager: new ToolTurnManager(),
      auditSink: (e) => auditEvents.push(e),
    });

    // 1. Concorrência no limite (5 chamadas simultâneas no mesmo turno -> 3 executam, 2 recusadas)
    const batch = await Promise.all(
      ["1 + 1", "2 + 2", "3 + 3", "4 + 4", "5 + 5"].map((expression) =>
        gateway.execute(
          JSON.stringify({ tool: "calculator", args: { expression } }),
          makeMathContext({ userId: "user-conc-calc", turnId: "turn-conc-calc" }),
        ),
      ),
    );
    expect(batch.filter((r) => r.ok).length).toBe(3);
    expect(batch.filter((r) => r.denialReason === "turn_limit_exceeded").length).toBe(2);

    // 2. Proteção contra colisão de chaves de contexto ("a::b" + "c" != "a" + "b::c")
    const key1 = await gateway.execute(
      JSON.stringify({ tool: "calculator", args: { expression: "12345 * 6789" } }),
      makeMathContext({ userId: "a::b", sessionId: "c", turnId: "t-col" }),
    );
    const key2 = await gateway.execute(
      JSON.stringify({ tool: "calculator", args: { expression: "12345 * 6789" } }),
      makeMathContext({ userId: "a", sessionId: "b::c", turnId: "t-col" }),
    );
    expect(key1.ok).toBe(true);
    expect(key2.ok).toBe(true); // Não disparou loop_detected por colisão!

    // 3. Auditoria sanitizada não vaza expressões nem resultados
    const serializedAudit = JSON.stringify(auditEvents);
    expect(auditEvents.length).toBeGreaterThanOrEqual(7);
    expect(serializedAudit).not.toContain("12345 * 6789");
    expect(serializedAudit).not.toContain("83810205");
  });
});
