import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { AIRouter, type AIRoutingCandidate } from "../src/features/ai/AIRouter";
import { AIResponseCache } from "../src/features/ai/AIResponseCache";
import type { AITaskDescription } from "../src/features/ai/AIProvider";

const educationalTask: AITaskDescription = {
  category: "educational_explanation",
  requiredCapabilities: ["text"],
  estimatedInputTokens: 900,
  maxOutputTokens: 1_800,
};

function candidate(
  provider: AIRoutingCandidate["provider"],
  model: string,
  options: Partial<AIRoutingCandidate> = {},
): AIRoutingCandidate {
  return {
    provider,
    model: { name: model, contextWindow: 16_384, outputTokenLimit: 4_096 },
    available: true,
    capabilities: ["text", "structured_text", "long_context"],
    credential: provider === "ollama" ? "local" : "shared_quota",
    sharedQuota: "available",
    ...options,
  };
}

test("escolha manual de provider e modelo é preservada", () => {
  const result = AIRouter.select({
    mode: "manual",
    preferredProvider: "groq",
    preferredModel: "llama-manual",
    task: educationalTask,
    candidates: [candidate("gemini", "gemini-auto")],
  });

  expect(result.decision).toMatchObject({
    provider: "groq",
    model: "llama-manual",
    selection: "manual",
    reason: "Escolha manual preservada.",
  });
});

test("seleção automática é determinística e favorece execução local elegível", () => {
  const candidates = [
    candidate("groq", "groq-shared"),
    candidate("ollama", "qwen-local"),
    candidate("gemini", "gemini-byok", { credential: "byok" }),
  ];
  const first = AIRouter.select({ mode: "automatic", preferredProvider: "gemini", task: educationalTask, candidates });
  const second = AIRouter.select({ mode: "automatic", preferredProvider: "gemini", task: educationalTask, candidates: [...candidates].reverse() });

  expect(first.decision).toEqual(second.decision);
  expect(first.decision).toMatchObject({ provider: "ollama", model: "qwen-local", credential: "local" });
});

test("preferência do usuário desempata candidatos com o mesmo impacto", () => {
  const result = AIRouter.select({
    mode: "automatic",
    preferredProvider: "groq",
    preferredModel: "groq-preferido",
    task: educationalTask,
    candidates: [
      candidate("gemini", "gemini-byok", { credential: "byok" }),
      candidate("groq", "groq-outro", { credential: "byok" }),
      candidate("groq", "groq-preferido", { credential: "byok" }),
    ],
  });

  expect(result.decision).toMatchObject({ provider: "groq", model: "groq-preferido" });
});

test("modelo sem capacidade ou janela suficiente é rejeitado", () => {
  const multimodal: AITaskDescription = {
    category: "multimodal_input",
    requiredCapabilities: ["text", "multimodal"],
    estimatedInputTokens: 1_000,
    maxOutputTokens: 1_600,
  };
  const result = AIRouter.select({
    mode: "automatic",
    task: multimodal,
    candidates: [
      candidate("gemini", "text-only", { capabilities: ["text"] }),
      candidate("groq", "too-small", {
        capabilities: ["text", "multimodal"],
        model: { name: "too-small", contextWindow: 2_000, outputTokenLimit: 2_000 },
      }),
    ],
  });

  expect(result.decision).toBeUndefined();
  expect(result.rejected.map((item) => item.reason)).toEqual(["capability", "context"]);
});

test("quota compartilhada esgotada elimina o candidato sem bloquear BYOK", () => {
  const result = AIRouter.select({
    mode: "automatic",
    task: educationalTask,
    candidates: [
      candidate("gemini", "shared", { sharedQuota: "exhausted" }),
      candidate("groq", "personal", { credential: "byok", sharedQuota: "unknown" }),
    ],
  });

  expect(result.decision).toMatchObject({ provider: "groq", credential: "byok" });
  expect(result.rejected).toContainEqual({ provider: "gemini", model: "shared", reason: "quota_exhausted" });
});

test("quota desconhecida não é interpretada como ilimitada", () => {
  const result = AIRouter.select({
    mode: "automatic",
    task: educationalTask,
    candidates: [candidate("openrouter", "shared", { sharedQuota: "unknown" })],
  });

  expect(result.decision).toBeUndefined();
  expect(result.rejected).toEqual([{ provider: "openrouter", model: "shared", reason: "quota_unknown" }]);
});

test("descrição do Tutor estima tokens e aplica limites por categoria sem chamada de IA", () => {
  const simple = AIRouter.describeTutorTask({ message: "Olá, pode me ajudar?", history: [], promptTokens: 17, contextTokens: 0 });
  const math = AIRouter.describeTutorTask({ message: "Calcule a integral de x²", history: [], promptTokens: 120, contextTokens: 0 });
  const long = AIRouter.describeTutorTask({ message: "Explique o material", history: [], promptTokens: 5_200, contextTokens: 4_300 });

  expect(simple).toMatchObject({ category: "simple_conversation", estimatedInputTokens: 17, maxOutputTokens: 700 });
  expect(math).toMatchObject({ category: "math_reasoning", maxOutputTokens: 2_200 });
  expect(long).toMatchObject({ category: "long_material_analysis", maxOutputTokens: 2_600 });
});

test("ausência de candidatos elegíveis retorna decisão vazia e motivos explicáveis", () => {
  const result = AIRouter.select({
    mode: "automatic",
    task: educationalTask,
    candidates: [candidate("ollama", "offline", { available: false })],
  });

  expect(result.decision).toBeUndefined();
  expect(result.rejected).toEqual([{ provider: "ollama", model: "offline", reason: "unavailable" }]);
});

test("cache deduplica a mesma tarefa sem cruzar contas, providers ou modelos", () => {
  const request = { history: [], message: "Explique árvores", requestOwner: "account-a" };
  const first = AIResponseCache.keyFor(request, "gemini", "gemini-flash");
  expect(AIResponseCache.keyFor(request, "gemini", "gemini-flash")).toBe(first);
  expect(AIResponseCache.keyFor({ ...request, requestOwner: "account-b" }, "gemini", "gemini-flash")).not.toBe(first);
  expect(AIResponseCache.keyFor(request, "groq", "llama")).not.toBe(first);
  expect(AIResponseCache.keyFor(request, "gemini", "gemini-pro")).not.toBe(first);
});

test("Tutor integra o roteamento no servidor e mantém autenticação, CSRF e fallback consentido", () => {
  const route = readFileSync(path.join(process.cwd(), "src/app/api/tutor/route.ts"), "utf8");
  const middleware = readFileSync(path.join(process.cwd(), "src/server/ai/QuotaMiddleware.ts"), "utf8");
  const manager = readFileSync(path.join(process.cwd(), "src/features/ai/ProviderManager.ts"), "utf8");

  expect(route).toContain("AIRouter.describeTutorTask");
  expect(route).toContain('routingPolicy: "smart"');
  expect(route).toContain("withAIQuota(request");
  expect(middleware).toContain("requireCsrf(request)");
  expect(middleware).toContain("requireUser(request)");
  expect(middleware).toContain("AIRoutingService.resolve");
  expect(middleware).toContain("promptPrepared: Boolean(prepared)");
  expect(manager).toContain('request.fallbackPolicy !== "consent"');
  expect(manager).toContain("if (authorized.fallback) throw measured.error");
});

test("modo automático não fixa silenciosamente o modelo salvo do provider preferido", () => {
  const client = readFileSync(path.join(process.cwd(), "src/features/ai/AIClient.ts"), "utf8");
  expect(client).toContain('mode === "manual" ? settings.models');
  expect(client).not.toContain("model: payload.model ?? settings.models");
});

test("resposta do Tutor expõe decisão, modelo efetivo e limite sem dados sensíveis", () => {
  const service = readFileSync(path.join(process.cwd(), "src/features/tutor/services/TutorService.ts"), "utf8");
  const message = readFileSync(path.join(process.cwd(), "src/features/tutor/TutorMessage.tsx"), "utf8");
  expect(service).toContain("routingSelection");
  expect(service).toContain("routingReason");
  expect(message).toContain('message.metadata.routingSelection === "automatic"');
  expect(message).toContain("message.metadata.maxOutputTokens");
  expect(message).not.toContain("apiKey");
});

test("Tutor envia modo automático sem fixar modelo e mostra a decisão retornada", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("studyai:ai-settings", JSON.stringify({
      version: 3,
      mode: "automatic",
      provider: "gemini",
      models: { gemini: "modelo-salvo-manual" },
    }));
  });
  let requestBody: Record<string, unknown> | undefined;
  await page.route("**/api/tutor", async (route) => {
    requestBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        provider: "ollama",
        model: "qwen-local",
        text: "Resposta roteada com segurança.",
        usage: { inputTokens: 42, outputTokens: 12, estimated: true },
        execution: {
          fallbackUsed: false,
          routing: {
            selection: "automatic",
            reason: "Seleção automática: modelo local compatível e disponível.",
            maxOutputTokens: 700,
          },
        },
      }),
    });
  });

  await page.goto("/tutor");
  await page.getByRole("button", { name: "Nova conversa" }).first().click();
  await page.getByLabel("Mensagem para o Tutor IA").fill("Olá, pode me ajudar?");
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(page.getByText("Resposta roteada com segurança.", { exact: true })).toBeVisible();
  await expect(page.getByText(/ollama · qwen-local.*escolha automática.*Limite de saída 700/)).toBeVisible();
  expect(requestBody).toMatchObject({ mode: "automatic", provider: "gemini" });
  expect(requestBody).not.toHaveProperty("model");
});
