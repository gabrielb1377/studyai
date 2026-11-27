import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { isSkillsEnabled, SkillRegistry } from "../src/features/ai/skills";
import { isToolsEnabled, ToolRegistry } from "../src/features/ai/tools";
import {
  buildAIUsageBudgetViewModel,
  STALE_THRESHOLD_MS,
  type AIQuotaApiPayload,
} from "../src/features/settings/aiUsageViewModel";
import type { QuotaService as QuotaServiceType } from "../src/server/ai/QuotaService";

const testRequire = createRequire(__filename);

function loadQuotaService(): typeof QuotaServiceType {
  const source = readFileSync(path.join(process.cwd(), "src/server/ai/QuotaService.ts"), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const compiled = { exports: {} as { QuotaService: typeof QuotaServiceType } };
  const pgStub = {
    hasPostgres: () => false,
    query: async () => {
      throw new Error("no pg in unit test");
    },
    transaction: async () => {
      throw new Error("no pg in unit test");
    },
  };
  const resolvedDeps: Record<string, unknown> = {
    "server-only": {},
    "@/server/database/Postgres": pgStub,
  };
  vm.runInContext(
    js,
    vm.createContext({
      module: compiled,
      exports: compiled.exports,
      require: (id: string) => (id in resolvedDeps ? resolvedDeps[id] : testRequire(id)),
      Buffer,
      Date,
      URL,
      setTimeout,
      clearTimeout,
      crypto: globalThis.crypto,
      process: { env: { NODE_ENV: "test" } },
      console,
    }),
  );
  return compiled.exports.QuotaService;
}

const QuotaService = loadQuotaService();

const BASE_NOW = Date.parse("2026-11-27T18:00:00.000Z");

function makeBasePayload(overrides: Partial<AIQuotaApiPayload> = {}): AIQuotaApiPayload {
  return {
    fetchedAt: "2026-11-27T18:00:00.000Z",
    mode: "shared",
    emailVerified: true,
    sharedAvailable: true,
    byokProviders: [],
    hasAnyBYOK: false,
    daily: {
      used: 0,
      limit: 500,
      remaining: 500,
      percent: 0,
      resetAt: "2026-11-28T00:00:00.000Z",
    },
    minute: {
      used: 0,
      limit: 20,
      remaining: 20,
      percent: 0,
      resetAt: "2026-11-27T18:01:00.000Z",
    },
    tokens: {
      used: 0,
      reserved: 0,
      limit: 250_000,
      remaining: 250_000,
      percent: 0,
      resetAt: "2026-11-28T00:00:00.000Z",
    },
    accounting: {
      date: "2026-11-27",
      observedTokens: 0,
      estimatedTokens: 0,
      pendingReservedTokens: 0,
      pendingReservationsCount: 0,
      reconciledCount: 0,
      zeroTokenReconciledCount: 0,
      failedOrCancelledCount: 0,
      byProviderModel: [],
      source: "reservations",
    },
    usageStats: [],
    warning: "none",
    ...overrides,
  };
}

test.describe("AL-2: Contabilização Real, ViewModel e Isolamento de QuotaService", () => {
  test("preserva catálogo oficial (33 skills + 10 tools) e flags desligadas", () => {
    expect(isSkillsEnabled()).toBe(false);
    expect(isToolsEnabled()).toBe(false);
    expect(SkillRegistry.list().length).toBe(33);
    expect(ToolRegistry.list().length).toBe(10);
  });

  test("diferencia uso zero vs ausência de histórico, limite normal, próximo e atingido sem forçar compra/upgrade", () => {
    // 1. Sem histórico
    const noHistory = buildAIUsageBudgetViewModel(makeBasePayload(), { nowMs: BASE_NOW });
    expect(noHistory.overallState).toBe("no_history");
    expect(noHistory.history30d.hasHistory).toBe(false);
    expect(noHistory.history30d.chart.dataStatus).toBe("no_data");

    // 2. Uso zero hoje, mas com histórico anterior
    const zeroToday = buildAIUsageBudgetViewModel(
      makeBasePayload({
        usageStats: [{ date: "2026-11-25", requests: 12, tokens: 8_400 }],
      }),
      { nowMs: BASE_NOW },
    );
    expect(zeroToday.overallState).toBe("zero_usage");
    expect(zeroToday.history30d.hasHistory).toBe(true);
    expect(zeroToday.history30d.totalTokens).toBe(8_400);

    // 3. Limite próximo (>= 75%)
    const approaching = buildAIUsageBudgetViewModel(
      makeBasePayload({
        daily: { used: 400, limit: 500, remaining: 100, percent: 80, resetAt: "2026-11-28T00:00:00.000Z" },
      }),
      { nowMs: BASE_NOW },
    );
    expect(approaching.overallState).toBe("approaching_limit");
    expect(approaching.daily.status).toBe("approaching");
    expect(approaching.minute.status).toBe("ok"); // status independente por janela!
    expect(approaching.guidanceMessage).toBeTruthy();
    expect(approaching.guidanceMessage).not.toMatch(/ilimitad|gratuit|compre|assine|upgrade/i);

    // 4. Limite atingido (100%)
    const reached = buildAIUsageBudgetViewModel(
      makeBasePayload({
        tokens: {
          used: 250_000,
          reserved: 0,
          limit: 250_000,
          remaining: 0,
          percent: 100,
          resetAt: "2026-11-28T00:00:00.000Z",
        },
      }),
      { nowMs: BASE_NOW },
    );
    expect(reached.overallState).toBe("limit_reached");
    expect(reached.tokens.status).toBe("limit_reached");
    expect(reached.guidanceMessage).not.toMatch(/ilimitad|gratuit|compre|assine|upgrade/i);
  });

  test("separa reservas em andamento de consumo realizado, trata limites desconhecidos, stale e valores inválidos", () => {
    // Reservas em andamento não são somadas como consumo realizado
    const reservedVm = buildAIUsageBudgetViewModel(
      makeBasePayload({
        daily: { used: 2, limit: 500, remaining: 498, percent: 0, resetAt: "2026-11-28T00:00:00.000Z" },
        tokens: {
          used: 10_000,
          reserved: 5_000,
          limit: 250_000,
          remaining: 235_000,
          percent: 6,
          resetAt: "2026-11-28T00:00:00.000Z",
        },
        accounting: {
          date: "2026-11-27",
          observedTokens: 7_500,
          estimatedTokens: 2_500,
          pendingReservedTokens: 5_000,
          pendingReservationsCount: 1,
          reconciledCount: 2,
          zeroTokenReconciledCount: 1,
          failedOrCancelledCount: 0,
          byProviderModel: [
            {
              provider: "gemini",
              model: "gemini-2.5-flash",
              credentialOrigin: "shared",
              requests: 2,
              totalTokens: 10_000,
              observedTokens: 7_500,
              estimatedTokens: 2_500,
            },
          ],
          source: "reservations",
        },
      }),
      { nowMs: BASE_NOW },
    );
    expect(reservedVm.overallState).toBe("reservations_in_flight");
    expect(reservedVm.tokens.used).toBe(10_000);
    expect(reservedVm.tokens.reserved).toBe(5_000);
    expect(reservedVm.tokens.remaining).toBe(235_000);
    expect(reservedVm.accounting.observedTokens).toBe(7_500);
    expect(reservedVm.accounting.estimatedTokens).toBe(2_500);
    expect(reservedVm.accounting.zeroTokenReconciledCount).toBe(1);
    expect(reservedVm.unavailableNotices.some((n) => n.includes("cache"))).toBe(true);

    // Transparência de BYOK e Ollama: limite desconhecido = "Não disponível" (nunca "ilimitado")
    const byokRow = reservedVm.providerTransparency.find((r) => r.id === "byok")!;
    const ollamaRow = reservedVm.providerTransparency.find((r) => r.id === "ollama")!;
    expect(byokRow.limitSummary).toBe("Não disponível");
    expect(ollamaRow.limitSummary).toBe("Não disponível");

    // Dados parciais + limite desconhecido + entradas NaN/Infinity/negativas + stale (>2min)
    const malformed = buildAIUsageBudgetViewModel(
      makeBasePayload({
        fetchedAt: new Date(BASE_NOW - STALE_THRESHOLD_MS - 10_000).toISOString(),
        daily: {
          used: Number.NaN,
          limit: -10,
          remaining: Number.POSITIVE_INFINITY,
          percent: Number.NaN,
          resetAt: "invalid-date",
        },
        tokens: undefined,
        accounting: undefined,
        usageStats: [
          { date: "2026-11-26", requests: Number.NaN, tokens: -999 },
          { date: "2026-11-27", requests: 3, tokens: Number.POSITIVE_INFINITY },
        ],
      }),
      { nowMs: BASE_NOW },
    );
    expect(malformed.isStale).toBe(true);
    expect(malformed.overallState).toBe("partial_data");
    expect(malformed.daily.used).toBe(0);
    expect(malformed.daily.limit).toBeNull();
    expect(malformed.daily.remaining).toBeNull();
    expect(malformed.daily.status).toBe("unknown");
    expect(malformed.tokens.limit).toBeNull();
    expect(malformed.accounting.available).toBe(false);
    // Garante ausência total de NaN/Infinity no gráfico gerado
    expect(JSON.stringify(malformed)).not.toMatch(/NaN|Infinity/);
  });

  test("QuotaService separa observado vs estimado, reserva pendente, cache hit sem dupla cobrança e isola Conta A→B", async () => {
    const userA = `al2-user-a-${Date.now()}`;
    const userB = `al2-user-b-${Date.now()}`;

    // 1. Reserva + reconciliação com métricas observadas pelo provedor
    const r1 = await QuotaService.reserveSharedBudget(userA, {
      provider: "gemini",
      model: "gemini-2.5-flash",
      requestId: `req-obs-${Date.now()}`,
      reserveTokens: 3_000,
      useSharedKeys: true,
    });
    expect(r1.allowed).toBe(true);
    expect(r1.reservationId).toBeTruthy();

    await QuotaService.reconcileReservation(r1.reservationId!, {
      provider: "gemini",
      outcome: "completed",
      providerContacted: true,
      emittedOutput: true,
      model: "gemini-2.5-flash",
      usage: { source: "provider", inputTokens: 800, outputTokens: 400, totalTokens: 1_200 },
    });

    // 2. Reserva + reconciliação estimada conservadoramente (sem metadata do provider)
    const r2 = await QuotaService.reserveSharedBudget(userA, {
      provider: "groq",
      model: "llama-3.3-70b",
      requestId: `req-est-${Date.now()}`,
      reserveTokens: 2_000,
      useSharedKeys: true,
    });
    expect(r2.allowed).toBe(true);
    const estRes = await QuotaService.reconcileReservation(
      r2.reservationId!,
      {
        provider: "groq",
        outcome: "completed",
        providerContacted: true,
        emittedOutput: true,
        emittedText: "Resposta estimada conservadoramente sem metadados oficiais do provedor.",
      },
      { inputEstimate: 300 },
    );
    expect(estRes.usageSource).toBe("estimated");
    expect(estRes.chargedTokens).toBeGreaterThan(0);

    // 3. Reconciliação sem cobrança (cache hit + resposta concluída com 0 tokens):
    // ambas somam em zeroTokenReconciledCount (sem assumir inequivocamente que toda cobrança 0 é cache hit).
    const r3 = await QuotaService.reserveSharedBudget(userA, {
      provider: "gemini",
      model: "gemini-2.5-flash",
      requestId: `req-cache-${Date.now()}`,
      reserveTokens: 1_500,
      useSharedKeys: true,
    });
    expect(r3.allowed).toBe(true);
    const cacheRes = await QuotaService.reconcileReservation(r3.reservationId!, {
      provider: "gemini",
      outcome: "cached",
      providerContacted: false,
      emittedOutput: true,
    });
    expect(cacheRes.chargedTokens).toBe(0);

    const r3b = await QuotaService.reserveSharedBudget(userA, {
      provider: "gemini",
      model: "gemini-2.5-flash",
      requestId: `req-zero-provider-${Date.now()}`,
      reserveTokens: 1_000,
      useSharedKeys: true,
    });
    expect(r3b.allowed).toBe(true);
    const zeroProviderRes = await QuotaService.reconcileReservation(r3b.reservationId!, {
      provider: "gemini",
      outcome: "completed",
      providerContacted: true,
      emittedOutput: false,
      usage: { source: "provider", inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    expect(zeroProviderRes.chargedTokens).toBe(0);

    // 4. Reserva pendente ainda em andamento
    const r4 = await QuotaService.reserveSharedBudget(userA, {
      provider: "gemini",
      model: "gemini-2.5-flash",
      requestId: `req-pending-${Date.now()}`,
      reserveTokens: 2_500,
      useSharedKeys: true,
    });
    expect(r4.allowed).toBe(true);

    // Verifica breakdown da Conta A (somente leitura, sem nova cobrança)
    const infoA1 = await QuotaService.getQuotaInfo(userA);
    const infoA2 = await QuotaService.getQuotaInfo(userA);
    expect(infoA2.daily.used).toBe(infoA1.daily.used);
    expect(infoA1.tokens?.reserved).toBe(2_500);
    expect(infoA1.tokens?.used).toBe(1_200 + estRes.chargedTokens);

    const breakdownA = await QuotaService.getUsageBreakdown(userA);
    expect(breakdownA.observedTokens).toBe(1_200);
    expect(breakdownA.estimatedTokens).toBe(estRes.chargedTokens);
    expect(breakdownA.pendingReservedTokens).toBe(2_500);
    expect(breakdownA.pendingReservationsCount).toBe(1);
    expect(breakdownA.zeroTokenReconciledCount).toBe(2);
    expect(breakdownA.byProviderModel.length).toBeGreaterThanOrEqual(2);
    expect(breakdownA.byProviderModel.every((row) => row.credentialOrigin === "shared")).toBe(true);

    // Verifica isolamento absoluto da Conta B (zero vazamento da Conta A)
    const infoB = await QuotaService.getQuotaInfo(userB);
    const breakdownB = await QuotaService.getUsageBreakdown(userB);
    expect(infoB.daily.used).toBe(0);
    expect(infoB.tokens?.used).toBe(0);
    expect(infoB.tokens?.reserved).toBe(0);
    expect(breakdownB.observedTokens).toBe(0);
    expect(breakdownB.estimatedTokens).toBe(0);
    expect(breakdownB.pendingReservedTokens).toBe(0);
    expect(breakdownB.byProviderModel).toEqual([]);

    // Limpa reserva pendente de teste para não afetar orçamento local compartilhado
    await QuotaService.reconcileReservation(r4.reservationId!, {
      provider: "gemini",
      outcome: "cancelled",
      providerContacted: false,
      emittedOutput: false,
    });
  });
});

test.describe("AL-2: Endpoint Protegido e Painel em Navegador Real (Acessibilidade, Temas, Responsividade e A→B)", () => {
  test("endpoint /api/settings/ai/quota falha fechado sem autenticação, ignora userId arbitrário, não vaza segredos nem orçamento global e é somente leitura", async ({
    request,
    baseURL,
  }) => {
    test.skip(!baseURL, "Requer servidor da aplicação (playwright.config.ts).");

    // 1. Sem autenticação -> 401 fail-closed + headers privados
    const unauth = await request.get("/api/settings/ai/quota");
    expect(unauth.status()).toBe(401);
    expect(unauth.headers()["cache-control"] ?? "").toContain("no-store");

    // 2. Registra Conta A e consulta /api/settings/ai/quota?userId=outra-conta
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const emailA = `al2-a-${suffix}@example.com`;
    const regA = await request.post("/auth/register", {
      headers: { "x-forwarded-for": `198.51.100.${(Date.now() % 200) + 10}` },
      data: { name: "Aluno AL2 A", email: emailA, password: "Password123!" },
    });
    expect([200, 201]).toContain(regA.status());

    const res1 = await request.get("/api/settings/ai/quota?userId=arbitrary-other-user-id");
    expect(res1.status()).toBe(200);
    expect(res1.headers()["cache-control"] ?? "").toContain("no-store");
    expect(res1.headers()["cache-control"] ?? "").toContain("private");

    const body1 = await res1.json();
    const raw1 = JSON.stringify(body1);

    // Nenhum dado de orçamento global interno nem chaves/prompts
    expect(raw1).not.toContain("globalDailyTokenBudget");
    expect(raw1).not.toContain("5000000");
    expect(raw1).not.toContain("ai_global_daily_budgets");
    expect(body1.daily.used).toBe(0);
    expect(body1.accounting.source).toBe("reservations");
    expect(body1.availability.cacheHitsTracked).toBe(false);
    expect(body1.availability.externalProviderLimitsTracked).toBe(false);
    expect(body1.availability.monetaryCostTracked).toBe(false);

    // 3. Consulta repetida não consome cota nem dispara IA
    const res2 = await request.get("/api/settings/ai/quota");
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    expect(body2.daily.used).toBe(body1.daily.used);
    expect(body2.minute.used).toBe(body1.minute.used);
    expect(body2.tokens.used).toBe(body1.tokens.used);
  });

  test("renderiza painel AL-2 em /configuracoes (IA), cobre reservas, limite atingido, erro, troca A→B, teclado, tabela equivalente, dark mode e 320..1280px", async ({
    page,
    baseURL,
  }) => {
    test.skip(!baseURL, "Requer servidor da aplicação (playwright.config.ts).");

    let scenario: "rich" | "limit_reached" | "error" | "account_b" = "rich";
    let quotaCalls = 0;

    await page.route("**/api/settings/ai/quota", async (route) => {
      quotaCalls += 1;
      if (scenario === "error") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Indisponível" }),
        });
        return;
      }
      if (scenario === "limit_reached") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            makeBasePayload({
              daily: {
                used: 500,
                limit: 500,
                remaining: 0,
                percent: 100,
                resetAt: "2026-11-28T00:00:00.000Z",
              },
              tokens: {
                used: 250_000,
                reserved: 0,
                limit: 250_000,
                remaining: 0,
                percent: 100,
                resetAt: "2026-11-28T00:00:00.000Z",
              },
              warning: "critical",
            }),
          ),
        });
        return;
      }
      if (scenario === "account_b") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            makeBasePayload({
              mode: "byok",
              hasAnyBYOK: true,
              byokProviders: ["gemini"],
              daily: { used: 1, limit: 500, remaining: 499, percent: 0, resetAt: "2026-11-28T00:00:00.000Z" },
              tokens: {
                used: 420,
                reserved: 0,
                limit: 250_000,
                remaining: 249_580,
                percent: 0,
                resetAt: "2026-11-28T00:00:00.000Z",
              },
              accounting: {
                date: "2026-11-27",
                observedTokens: 420,
                estimatedTokens: 0,
                pendingReservedTokens: 0,
                pendingReservationsCount: 0,
                reconciledCount: 1,
                zeroTokenReconciledCount: 0,
                failedOrCancelledCount: 0,
                byProviderModel: [
                  {
                    provider: "gemini",
                    model: "gemini-2.5-flash",
                    credentialOrigin: "shared",
                    requests: 1,
                    totalTokens: 420,
                    observedTokens: 420,
                    estimatedTokens: 0,
                  },
                ],
                source: "reservations",
              },
              usageStats: [{ date: "2026-11-27", requests: 1, tokens: 420 }],
            }),
          ),
        });
        return;
      }

      // Cenário rico: observado vs estimado + reserva pendente + cache hit + histórico SVG
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          makeBasePayload({
            daily: { used: 14, limit: 500, remaining: 486, percent: 3, resetAt: "2026-11-28T00:00:00.000Z" },
            minute: { used: 2, limit: 20, remaining: 18, percent: 10, resetAt: "2026-11-27T18:01:00.000Z" },
            tokens: {
              used: 18_500,
              reserved: 2_500,
              limit: 250_000,
              remaining: 229_000,
              percent: 8,
              resetAt: "2026-11-28T00:00:00.000Z",
            },
            accounting: {
              date: "2026-11-27",
              observedTokens: 15_000,
              estimatedTokens: 3_500,
              pendingReservedTokens: 2_500,
              pendingReservationsCount: 1,
              reconciledCount: 12,
              zeroTokenReconciledCount: 2,
              failedOrCancelledCount: 0,
              byProviderModel: [
                {
                  provider: "gemini",
                  model: "gemini-2.5-flash",
                  credentialOrigin: "shared",
                  requests: 10,
                  totalTokens: 15_000,
                  observedTokens: 15_000,
                  estimatedTokens: 0,
                },
                {
                  provider: "groq",
                  model: "llama-3.3-70b",
                  credentialOrigin: "shared",
                  requests: 4,
                  totalTokens: 3_500,
                  observedTokens: 0,
                  estimatedTokens: 3_500,
                },
              ],
              source: "reservations",
            },
            usageStats: [
              { date: "2026-11-25", requests: 8, tokens: 9_200 },
              { date: "2026-11-26", requests: 11, tokens: 12_400 },
              { date: "2026-11-27", requests: 14, tokens: 18_500 },
            ],
          }),
        ),
      });
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/configuracoes");
    await page.getByRole("button", { name: "IA", exact: true }).click();

    const panel = page.locator('section[aria-labelledby="al2-usage-budget-heading"]');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-al2-state", "reservations_in_flight");

    // 1. Verifica separação explícita de consumido vs reservado, observado vs estimado, reconciliações 0-token e BYOK/Ollama Não disponível
    await expect(panel).toContainText("18.500 tokens");
    await expect(panel).toContainText("2.500 tokens (1 ativa)");
    await expect(panel).toContainText("15.000 tokens");
    await expect(panel).toContainText("3.500 tokens");
    await expect(panel).toContainText("Reconciliações sem cobrança (0 tokens)");
    await expect(panel).toContainText("Limite: Não disponível");
    await expect(panel).not.toContainText("sem limites");

    // 2. Gráfico SVG acessível sem NaN/Infinity + navegação por teclado + tabela equivalente
    const historySvg = panel.locator('svg[role="img"]').first();
    await expect(historySvg).toBeVisible();
    const invalidSvgAttrs = await historySvg.evaluate((svg) => {
      const bad: string[] = [];
      for (const el of [svg, ...Array.from(svg.querySelectorAll("*"))]) {
        for (const attr of Array.from(el.attributes)) {
          if (/\b(?:NaN|Infinity)\b/.test(attr.value)) bad.push(`${el.tagName}@${attr.name}`);
        }
      }
      return bad;
    });
    expect(invalidSvgAttrs).toEqual([]);

    const activeBar = historySvg.locator('g[role="button"][tabindex="0"]').first();
    await activeBar.focus();
    await expect(activeBar).toBeFocused();
    const labelBefore = await activeBar.getAttribute("aria-label");
    await page.keyboard.press("ArrowLeft");
    const movedBar = historySvg.locator('g[role="button"][tabindex="0"]').first();
    await expect(movedBar).toBeFocused();
    expect(await movedBar.getAttribute("aria-label")).not.toBe(labelBefore);

    const tableBtn = panel.getByRole("button", { name: "Ver tabela" });
    const tableControlsId = await tableBtn.getAttribute("aria-controls");
    expect(tableControlsId).toBeTruthy();
    const stableTableBtn = panel.locator(`button[aria-controls="${tableControlsId}"]`);
    await stableTableBtn.click();
    await expect(stableTableBtn).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("table", { name: "Tabela equivalente: Histórico diário de uso de IA" })).toBeVisible();

    // 3. Dark mode + reduced-motion + Responsividade 320/360/390/768/1280px (tabela aberta e fechada)
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    for (const width of [320, 360, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 780 });
      const dims = await page.evaluate(async () => {
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth };
      });
      expect(dims.scrollWidth, `Overflow em /configuracoes (IA) com tabela aberta em ${width}px`).toBeLessThanOrEqual(
        dims.innerWidth + 1,
      );
    }
    await stableTableBtn.click();
    await expect(stableTableBtn).toHaveAttribute("aria-expanded", "false");
    await page.setViewportSize({ width: 320, height: 780 });
    const closed320 = await page.evaluate(async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth };
    });
    expect(closed320.scrollWidth).toBeLessThanOrEqual(closed320.innerWidth + 1);

    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await page.setViewportSize({ width: 1280, height: 800 });

    // 4. Estado de limite atingido
    scenario = "limit_reached";
    await panel.getByRole("button", { name: "Atualizar uso" }).click();
    await expect(panel).toHaveAttribute("data-al2-state", "limit_reached");
    await expect(panel).toContainText("Limite atingido");
    await expect(panel).not.toContainText("sem limites");

    // 5. Falha de backend preserva último snapshot com badge "Dados desatualizados" + botão Tentar novamente
    scenario = "error";
    await panel.getByRole("button", { name: "Atualizar uso" }).click();
    await expect(panel).toContainText("Dados desatualizados");
    await expect(panel).toContainText("Tentar novamente");

    // 6. Recuperação para Conta B (sem vazar números da Conta A)
    scenario = "account_b";
    await panel.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(panel).toContainText("BYOK configurado");
    await expect(panel).toContainText("420 tokens");
    await expect(panel).not.toContainText("18.500 tokens");
    expect(quotaCalls).toBeGreaterThanOrEqual(4);
  });
});

function isDisposableLocalPostgres(url: string | undefined): url is string {
  if (!url || process.env.STUDYAI_ALLOW_LOCAL_DB_TESTS !== "1") return false;
  try {
    const parsed = new URL(url);
    return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function loadPgModule(
  file: string,
  dependencies: Record<string, unknown>,
  env: Record<string, string | undefined>,
) {
  const source = readFileSync(path.join(process.cwd(), file), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const compiled = { exports: {} as Record<string, unknown> };
  const resolvedDeps: Record<string, unknown> = { "server-only": {}, ...dependencies };
  vm.runInContext(
    js,
    vm.createContext({
      module: compiled,
      exports: compiled.exports,
      require: (id: string) => (id in resolvedDeps ? resolvedDeps[id] : testRequire(id)),
      Buffer,
      Date,
      URL,
      setTimeout,
      clearTimeout,
      crypto: globalThis.crypto,
      process: { env },
      console: { ...console, warn: () => undefined, info: () => undefined, error: () => undefined },
    }),
  );
  return compiled.exports;
}

test.describe("AL-2: PostgreSQL Real (PG-AL2)", () => {
  const databaseUrl = process.env.DATABASE_URL;
  const hasLocalPg = isDisposableLocalPostgres(databaseUrl);

  test("PG-AL2-1: getUsageBreakdown, getQuotaInfo e getUsageStats validam isolamento A/B, provider/model/credentialOrigin, observado vs estimado, pendentes, janelas UTC, idempotência, ausência de orçamento global e consistência com histórico", async () => {
    test.skip(!hasLocalPg, "Requer DATABASE_URL local descartável com STUDYAI_ALLOW_LOCAL_DB_TESTS=1");
    const pg = testRequire("pg") as typeof import("pg");
    const adminPool = new pg.Pool({ connectionString: databaseUrl, max: 2, ssl: false });
    const env = {
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl,
      DATABASE_SSL: "false",
      AI_USER_DAILY_TOKEN_LIMIT: "100000",
      AI_GLOBAL_DAILY_TOKEN_BUDGET: "500000",
    };
    const pgMod = loadPgModule("src/server/database/Postgres.ts", {}, env) as {
      postgresPool: () => import("pg").Pool;
    };
    const quotaMod = loadPgModule(
      "src/server/ai/QuotaService.ts",
      { "@/server/database/Postgres": pgMod },
      env,
    ) as { QuotaService: typeof QuotaServiceType };
    const PgQuota = quotaMod.QuotaService;

    const userA = `al2_pg_a_${Date.now()}_${randomUUID().slice(0, 6)}`;
    const userB = `al2_pg_b_${Date.now()}_${randomUUID().slice(0, 6)}`;
    const todayUtc = new Date().toISOString().split("T")[0];
    const yesterdayUtc = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    try {
      const schemaSql = readFileSync(path.join(process.cwd(), "src/server/database/schema.sql"), "utf8");
      const mig0003 = readFileSync(
        path.join(process.cwd(), "migrations/0003_lote3_ai_budgets_and_storage_quotas.sql"),
        "utf8",
      );
      await adminPool.query(schemaSql);
      await adminPool.query(mig0003);

      await adminPool.query(
        `INSERT INTO users (id, email, password_hash, email_verified_at)
         VALUES ($1, $2, 'hash', NOW()), ($3, $4, 'hash', NOW())`,
        [userA, `${userA}@example.com`, userB, `${userB}@example.com`],
      );

      // 1. Registro em janela UTC anterior (ontem) para userA: deve aparecer no histórico 30d, mas NÃO no breakdown de hoje
      await adminPool.query(
        `INSERT INTO usage_quotas (user_id, date, minute_bucket, requests_count, tokens_count, reserved_tokens)
         VALUES ($1, $2::date, 0, 3, 4500, 0)`,
        [userA, yesterdayUtc],
      );
      await adminPool.query(
        `INSERT INTO ai_token_reservations (
           id, request_id, user_id, usage_date, provider, model, credential_origin,
           reserved_tokens, actual_input_tokens, actual_output_tokens, actual_total_tokens,
           usage_source, status, expires_at, reconciled_at
         ) VALUES (
           $1, $2, $3, $4::date, 'gemini', 'gemini-2.5-flash', 'shared',
           5000, 3000, 1500, 4500, 'provider', 'reconciled', NOW() + INTERVAL '5 minutes', NOW()
         )`,
        [`res-yest-${randomUUID()}`, `req-yest-${randomUUID()}`, userA, yesterdayUtc],
      );

      // 2. Reserva + reconciliação observada (provider) para userA + idempotência de requestId e reconcileReservation
      const obsReqId = `pg-al2-obs-${randomUUID()}`;
      const rObs = await PgQuota.reserveSharedBudget(userA, {
        provider: "gemini",
        model: "gemini-2.5-flash",
        requestId: obsReqId,
        reserveTokens: 3_000,
        useSharedKeys: true,
      });
      expect(rObs.allowed).toBe(true);
      const rObsDup = await PgQuota.reserveSharedBudget(userA, {
        provider: "gemini",
        model: "gemini-2.5-flash",
        requestId: obsReqId,
        reserveTokens: 3_000,
        useSharedKeys: true,
      });
      expect(rObsDup.deduplicated).toBe(true);
      expect(rObsDup.reservationId).toBe(rObs.reservationId);

      const recObs = await PgQuota.reconcileReservation(rObs.reservationId!, {
        provider: "gemini",
        model: "gemini-2.5-flash",
        outcome: "completed",
        providerContacted: true,
        emittedOutput: true,
        usage: { source: "provider", inputTokens: 900, outputTokens: 300, totalTokens: 1_200 },
      });
      expect(recObs.reconciled).toBe(true);
      expect(recObs.chargedTokens).toBe(1_200);

      // Reconciliação duplicada -> idempotente (zero duplicação)
      const recObsDup = await PgQuota.reconcileReservation(rObs.reservationId!, {
        provider: "gemini",
        model: "gemini-2.5-flash",
        outcome: "completed",
        providerContacted: true,
        emittedOutput: true,
        usage: { source: "provider", inputTokens: 900, outputTokens: 300, totalTokens: 1_200 },
      });
      expect(recObsDup.alreadySettled).toBe(true);
      expect(recObsDup.chargedTokens).toBe(0);

      // 3. Reserva + reconciliação estimada conservadoramente (outro provedor/modelo) para userA
      const rEst = await PgQuota.reserveSharedBudget(userA, {
        provider: "groq",
        model: "llama-3.3-70b",
        requestId: `pg-al2-est-${randomUUID()}`,
        reserveTokens: 2_000,
        useSharedKeys: true,
      });
      expect(rEst.allowed).toBe(true);
      const recEst = await PgQuota.reconcileReservation(
        rEst.reservationId!,
        {
          provider: "groq",
          model: "llama-3.3-70b",
          outcome: "completed",
          providerContacted: true,
          emittedOutput: true,
          emittedText: "Texto de resposta estimada para validar separação observado vs estimado no PostgreSQL.",
        },
        { inputEstimate: 400 },
      );
      expect(recEst.usageSource).toBe("estimated");
      expect(recEst.chargedTokens).toBeGreaterThan(0);

      // 4. Duas reconciliações sem cobrança (0 tokens): uma cached e uma completed com totalTokens=0
      const rCache = await PgQuota.reserveSharedBudget(userA, {
        provider: "gemini",
        model: "gemini-2.5-flash",
        requestId: `pg-al2-cache-${randomUUID()}`,
        reserveTokens: 1_500,
        useSharedKeys: true,
      });
      await PgQuota.reconcileReservation(rCache.reservationId!, {
        provider: "gemini",
        outcome: "cached",
        providerContacted: false,
        emittedOutput: true,
      });

      const rZero = await PgQuota.reserveSharedBudget(userA, {
        provider: "gemini",
        model: "gemini-2.5-flash",
        requestId: `pg-al2-zero-${randomUUID()}`,
        reserveTokens: 1_000,
        useSharedKeys: true,
      });
      await PgQuota.reconcileReservation(rZero.reservationId!, {
        provider: "gemini",
        outcome: "completed",
        providerContacted: true,
        emittedOutput: false,
        usage: { source: "provider", inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });

      // 5. Reserva pendente ativa + reserva falhada/cancelada + registro distinto de credential_origin ('byok') no mesmo provider/model
      const rPending = await PgQuota.reserveSharedBudget(userA, {
        provider: "gemini",
        model: "gemini-2.5-flash",
        requestId: `pg-al2-pending-${randomUUID()}`,
        reserveTokens: 2_200,
        useSharedKeys: true,
      });
      expect(rPending.allowed).toBe(true);

      const rCancel = await PgQuota.reserveSharedBudget(userA, {
        provider: "groq",
        model: "llama-3.3-70b",
        requestId: `pg-al2-cancel-${randomUUID()}`,
        reserveTokens: 900,
        useSharedKeys: true,
      });
      await PgQuota.reconcileReservation(rCancel.reservationId!, {
        provider: "groq",
        outcome: "cancelled",
        providerContacted: false,
        emittedOutput: false,
      });

      // Inserção controlada de linha com credential_origin='byok' no mesmo provider/model para validar GROUP BY credential_origin
      await adminPool.query(
        `INSERT INTO ai_token_reservations (
           id, request_id, user_id, usage_date, provider, model, credential_origin,
           reserved_tokens, actual_input_tokens, actual_output_tokens, actual_total_tokens,
           usage_source, status, expires_at, reconciled_at
         ) VALUES (
           $1, $2, $3, $4::date, 'gemini', 'gemini-2.5-flash', 'byok',
           0, 100, 50, 150, 'provider', 'reconciled', NOW() + INTERVAL '5 minutes', NOW()
         )`,
        [`res-byok-${randomUUID()}`, `req-byok-${randomUUID()}`, userA, todayUtc],
      );

      // 6. Consumo isolado para userB
      const rB = await PgQuota.reserveSharedBudget(userB, {
        provider: "openrouter",
        model: "deepseek-r1",
        requestId: `pg-al2-b-${randomUUID()}`,
        reserveTokens: 1_800,
        useSharedKeys: true,
      });
      await PgQuota.reconcileReservation(rB.reservationId!, {
        provider: "openrouter",
        model: "deepseek-r1",
        outcome: "completed",
        providerContacted: true,
        emittedOutput: true,
        usage: { source: "provider", inputTokens: 200, outputTokens: 100, totalTokens: 300 },
      });

      // Verificações para userA (somente leitura)
      const [infoA, breakdownA, statsA] = await Promise.all([
        PgQuota.getQuotaInfo(userA),
        PgQuota.getUsageBreakdown(userA),
        PgQuota.getUsageStats(userA, 30),
      ]);

      expect(breakdownA.source).toBe("reservations");
      expect(breakdownA.date).toBe(todayUtc);
      // Observado hoje: 1200 (shared) + 150 (byok) = 1350 (ontem 4500 NÃO entra no breakdown de hoje)
      expect(breakdownA.observedTokens).toBe(1_350);
      expect(breakdownA.estimatedTokens).toBe(recEst.chargedTokens);
      expect(breakdownA.pendingReservedTokens).toBe(2_200);
      expect(breakdownA.pendingReservationsCount).toBe(1);
      expect(breakdownA.reconciledCount).toBe(5); // obs + est + cache + zero + byok
      expect(breakdownA.zeroTokenReconciledCount).toBe(2); // cache + zero
      expect(breakdownA.failedOrCancelledCount).toBe(1);

      // Agregação separada por provider / model / credentialOrigin
      const geminiShared = breakdownA.byProviderModel.find(
        (row) => row.provider === "gemini" && row.model === "gemini-2.5-flash" && row.credentialOrigin === "shared",
      );
      const geminiByok = breakdownA.byProviderModel.find(
        (row) => row.provider === "gemini" && row.model === "gemini-2.5-flash" && row.credentialOrigin === "byok",
      );
      const groqShared = breakdownA.byProviderModel.find(
        (row) => row.provider === "groq" && row.model === "llama-3.3-70b" && row.credentialOrigin === "shared",
      );
      expect(geminiShared).toMatchObject({ requests: 3, observedTokens: 1_200, estimatedTokens: 0 });
      expect(geminiByok).toMatchObject({ requests: 1, observedTokens: 150, estimatedTokens: 0 });
      expect(groqShared).toMatchObject({ requests: 2, observedTokens: 0, estimatedTokens: recEst.chargedTokens });

      // Consistência entre usage_quotas (shared) e histórico 30d (inclui ontem + hoje UTC)
      const expectedSharedTodayTokens = 1_200 + recEst.chargedTokens;
      expect(infoA.tokens?.used).toBe(expectedSharedTodayTokens);
      expect(infoA.tokens?.reserved).toBe(2_200);
      expect(infoA.daily.used).toBe(6); // 6 reservas shared hoje (duplicada não conta)

      const statToday = statsA.find((s) => s.date === todayUtc);
      const statYesterday = statsA.find((s) => s.date === yesterdayUtc);
      expect(statToday).toEqual({ date: todayUtc, requests: 6, tokens: expectedSharedTodayTokens });
      expect(statYesterday).toEqual({ date: yesterdayUtc, requests: 3, tokens: 4_500 });

      // Ausência de vazamento de orçamento global nos retornos
      const serializedA = JSON.stringify({ infoA, breakdownA, statsA });
      expect(serializedA).not.toContain("500000");
      expect(serializedA).not.toContain("globalDailyTokenBudget");
      expect(serializedA).not.toContain("ai_global_daily_budgets");

      // Isolamento absoluto de userB (zero vazamento de userA)
      const [infoB, breakdownB, statsB] = await Promise.all([
        PgQuota.getQuotaInfo(userB),
        PgQuota.getUsageBreakdown(userB),
        PgQuota.getUsageStats(userB, 30),
      ]);
      expect(infoB.daily.used).toBe(1);
      expect(infoB.tokens?.used).toBe(300);
      expect(infoB.tokens?.reserved).toBe(0);
      expect(breakdownB.observedTokens).toBe(300);
      expect(breakdownB.estimatedTokens).toBe(0);
      expect(breakdownB.pendingReservedTokens).toBe(0);
      expect(breakdownB.zeroTokenReconciledCount).toBe(0);
      expect(breakdownB.byProviderModel).toEqual([
        {
          provider: "openrouter",
          model: "deepseek-r1",
          credentialOrigin: "shared",
          requests: 1,
          totalTokens: 300,
          observedTokens: 300,
          estimatedTokens: 0,
        },
      ]);
      expect(statsB).toEqual([{ date: todayUtc, requests: 1, tokens: 300 }]);
    } finally {
      await adminPool.query("DELETE FROM users WHERE id IN ($1, $2)", [userA, userB]).catch(() => undefined);
      await pgMod.postgresPool().end().catch(() => undefined);
      await adminPool.end().catch(() => undefined);
    }
  });
});
