import type { FullConfig } from "@playwright/test";

/**
 * Pré-compila as rotas usadas pela suíte antes do primeiro teste.
 *
 * O `next dev` compila sob demanda; sem warm-up, o primeiro teste de cada rota
 * paga a compilação e pode estourar o timeout de ações (flakes de ambiente que
 * já apareceram em product-polish/conta). O warm-up é sequencial para evitar
 * compilações concorrentes no mesmo processo do Next.
 */
const pageRoutes = [
  "/",
  "/academy",
  "/academy/studio",
  "/aprendizagem",
  "/biblioteca",
  "/configuracoes",
  "/conta",
  "/estudo",
  "/importar",
  "/lab",
  "/organizar",
  "/planejamento",
  "/provas",
  "/salas",
  "/storage",
  "/tutor",
  "/compartilhar/warmup",
];

const apiRoutes = [
  "/api/health/live",
  "/api/health",
  "/api/ai/manager",
  "/api/tutor",
  "/auth/login",
  "/auth/register",
  "/auth/recover",
  "/auth/session",
];

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3000";
  const routes = [...pageRoutes, ...apiRoutes];
  const setupStartedAt = performance.now();
  const log = (message: string) => {
    const timestamp = new Date().toISOString();
    console.info(`[e2e ${timestamp} +${Math.round(performance.now() - setupStartedAt)}ms] ${message}`);
  };

  log(`globalSetup iniciado; warm-up de ${routes.length} rotas em ${baseURL}`);

  for (const route of routes) {
    const routeStartedAt = performance.now();
    log(`warm-up iniciado: ${route}`);
    try {
      const response = await fetch(new URL(route, baseURL), {
        redirect: "manual",
        signal: AbortSignal.timeout(120_000),
      });
      await response.text();
      log(`warm-up concluído: ${route}; HTTP ${response.status}; ${Math.round(performance.now() - routeStartedAt)}ms`);
    } catch (error) {
      const duration = Math.round(performance.now() - routeStartedAt);
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      log(`warm-up ${timedOut ? "timeout" : "erro"}: ${route}; ${duration}ms; ${error instanceof Error ? error.name : "erro desconhecido"}`);
    }
  }

  log(`globalSetup concluído; ${Math.round(performance.now() - setupStartedAt)}ms`);
}
