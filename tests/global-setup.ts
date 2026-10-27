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
  "/biblioteca",
  "/configuracoes",
  "/conta",
  "/estudo",
  "/importar",
  "/lab",
  "/organizar",
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

  for (const route of routes) {
    try {
      const response = await fetch(new URL(route, baseURL), {
        redirect: "manual",
        signal: AbortSignal.timeout(120_000),
      });
      await response.text();
    } catch (error) {
      // O warm-up é uma otimização; uma rota isolada indisponível não deve
      // impedir a suíte. O teste real correspondente ainda falhará se necessário.
      console.warn(`[e2e warmup] ${route}: ${error instanceof Error ? error.message : "falhou"}`);
    }
  }
}
