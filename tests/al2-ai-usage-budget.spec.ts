import { expect, test } from "@playwright/test";
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
      cacheHitsCount: 0,
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
          cacheHitsCount: 1,
          failedOrCancelledCount: 0,
          byProviderModel: [
            {
              provider: "gemini",
              model: "gemini-2.5-flash",
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
    expect(reservedVm.accounting.cacheHitsCount).toBe(1);

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

    // 3. Cache hit reconciliado com 0 tokens (sem cobrança duplicada)
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
    expect(breakdownA.cacheHitsCount).toBe(1);
    expect(breakdownA.byProviderModel.length).toBeGreaterThanOrEqual(2);

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
                cacheHitsCount: 0,
                failedOrCancelledCount: 0,
                byProviderModel: [
                  {
                    provider: "gemini",
                    model: "gemini-2.5-flash",
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
              cacheHitsCount: 2,
              failedOrCancelledCount: 0,
              byProviderModel: [
                {
                  provider: "gemini",
                  model: "gemini-2.5-flash",
                  requests: 10,
                  totalTokens: 15_000,
                  observedTokens: 15_000,
                  estimatedTokens: 0,
                },
                {
                  provider: "groq",
                  model: "llama-3.3-70b",
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

    // 1. Verifica separação explícita de consumido vs reservado, observado vs estimado, cache hit e BYOK/Ollama Não disponível
    await expect(panel).toContainText("18.500 tokens");
    await expect(panel).toContainText("2.500 tokens (1 ativa)");
    await expect(panel).toContainText("15.000 tokens");
    await expect(panel).toContainText("3.500 tokens");
    await expect(panel).toContainText("Cache hits sem nova cobrança");
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
