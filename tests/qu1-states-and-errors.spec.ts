import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const CORE_ROUTES = [
  "academy",
  "aprendizagem",
  "biblioteca",
  "configuracoes",
  "conta",
  "estudo",
  "importar",
  "lab",
  "organizar",
  "planejamento",
  "provas",
  "salas",
  "storage",
  "tutor",
] as const;

test.describe("QU-1 — Quality Upgrade: Estados de Carregamento, Erro e Vazio", () => {
  test("Q-02: Todas as rotas principais possuem loading.tsx com role='status' e acessibilidade", () => {
    for (const route of CORE_ROUTES) {
      const loadingPath = `src/app/${route}/loading.tsx`;
      expect(existsSync(path.join(process.cwd(), loadingPath)), `loading.tsx deve existir em ${route}`).toBe(true);

      const source = readFileSync(path.join(process.cwd(), loadingPath), "utf8");

      // Deve exportar default component
      expect(source).toContain("export default function");

      // Deve usar RouteLoading, LibraryLoading ou div com role="status"
      const hasStatusRole =
        source.includes("RouteLoading") ||
        source.includes("LibraryLoading") ||
        source.includes('role="status"');
      expect(hasStatusRole, `loading de ${route} deve garantir role="status"`).toBe(true);

      // Deve conter indicador visual de carregamento (Skeleton ou animate-pulse)
      const hasVisualSkeleton =
        source.includes("Skeleton") ||
        source.includes("animate-pulse") ||
        source.includes("LibraryLoading");
      expect(hasVisualSkeleton, `loading de ${route} deve utilizar Skeleton ou animate-pulse`).toBe(true);
    }
  });

  test("Q-02: Todas as rotas principais possuem error.tsx com 'use client', role='alert' e ação de retry", () => {
    for (const route of CORE_ROUTES) {
      const errorPath = `src/app/${route}/error.tsx`;
      expect(existsSync(path.join(process.cwd(), errorPath)), `error.tsx deve existir em ${route}`).toBe(true);

      const source = readFileSync(path.join(process.cwd(), errorPath), "utf8");

      // Next.js App Router error boundaries devem ser Client Components
      expect(source).toContain('"use client"');
      expect(source).toContain("export default function");

      // Deve receber prop reset e repassar ao botão de ação
      expect(source).toMatch(/reset\s*[:}]/);

      // Deve delegar para RouteErrorState, LibraryErrorState ou EmptyState com botão
      const hasStructuredError =
        source.includes("RouteErrorState") ||
        source.includes("LibraryErrorState") ||
        source.includes("EmptyState");
      expect(hasStructuredError, `error de ${route} deve usar primitiva estruturada de erro`).toBe(true);

      // Deve associar a ação de reset ao retry
      const hasRetryAction =
        source.includes("onRetry={reset}") ||
        source.includes("onClick={reset}") ||
        source.includes("onRetry={");
      expect(hasRetryAction, `error de ${route} deve conectar reset à ação de retry`).toBe(true);
    }
  });

  test("Q-02: global-error.tsx existe na raiz do app com 'use client', boundary HTML e retry", () => {
    const globalErrorPath = "src/app/global-error.tsx";
    expect(existsSync(path.join(process.cwd(), globalErrorPath))).toBe(true);

    const source = readFileSync(path.join(process.cwd(), globalErrorPath), "utf8");

    expect(source).toContain('"use client"');
    expect(source).toContain('import "@/styles/globals.css"');
    expect(source).toContain("export default function GlobalError");
    expect(source).toContain("<html lang=");
    expect(source).toContain("<body");
    expect(source).toContain('role="alert"');
    expect(source).toContain("reset()");
    expect(source).toContain("Recarregar aplicação");
    expect(source).not.toContain("error.message");
    expect(source).not.toContain("error.stack");
  });

  test("Q-02: Primitivas RouteLoading e RouteErrorState cumprem o contrato ARIA", () => {
    const routeStatesSource = readFileSync(path.join(process.cwd(), "src/components/route-states.tsx"), "utf8");

    expect(routeStatesSource).toContain('role="status"');
    expect(routeStatesSource).toContain('aria-label={label}');
    expect(routeStatesSource).toContain('className="sr-only"');
    expect(routeStatesSource).toContain('role="alert"');
    expect(routeStatesSource).toContain("Tentar novamente");
    expect(routeStatesSource).toContain("EmptyState");
    expect(routeStatesSource).toContain("Skeleton");
  });

  test("Q-08: ExamWorkspace utiliza EmptyState e Skeleton unificados sem cartões ou parágrafos ad-hoc", () => {
    const source = readFileSync(path.join(process.cwd(), "src/features/exam/ExamWorkspace.tsx"), "utf8");

    expect(source).toContain('import { EmptyState } from "@/components/empty-state";');
    expect(source).toContain('import { Skeleton } from "@/components/ui/skeleton";');

    expect(source).toContain("<EmptyState");
    expect(source).toContain('title="Nenhuma prova cadastrada"');

    expect(source).toContain('role="status" aria-label="Carregando registros autorizados"');
    expect(source).toContain('role="status" aria-label="Carregando materiais vinculados"');
    expect(source).not.toContain('<p className="mt-5 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Carregando registros autorizados…');
    expect(source).not.toContain('<p className="text-sm text-muted-foreground text-center py-4">Carregando materiais vinculados...');
  });

  test("Q-08: StudyDashboard e AcademyLabOverview utilizam Skeleton nas fronteiras de carregamento", () => {
    const dashboardSource = readFileSync(path.join(process.cwd(), "src/features/dashboard/StudyDashboard.tsx"), "utf8");
    const overviewSource = readFileSync(path.join(process.cwd(), "src/features/dashboard/AcademyLabOverview.tsx"), "utf8");

    expect(dashboardSource).toContain('import { Skeleton } from "@/components/ui/skeleton";');
    expect(dashboardSource).toContain('<Skeleton className="h-40 rounded-2xl" />');
    expect(dashboardSource).toContain('<Skeleton className="h-44 rounded-2xl" />');
    expect(dashboardSource).not.toContain('animate-pulse rounded-2xl border bg-muted/30');

    expect(overviewSource).toContain('import { Skeleton } from "@/components/ui/skeleton";');
    expect(overviewSource).toContain('<Skeleton aria-label="Carregando Academy e Laboratório" className="h-44 rounded-2xl" />');
  });

  test("Q-08: CollaborationPage adota EmptyState e Skeleton nas transições de sala e autenticação", () => {
    const collabSource = readFileSync(path.join(process.cwd(), "src/features/collaboration/CollaborationPage.tsx"), "utf8");

    expect(collabSource).toContain('import { EmptyState } from "@/components/empty-state";');
    expect(collabSource).toContain('import { Skeleton } from "@/components/ui/skeleton";');
    expect(collabSource).toContain('title="Escolha ou crie uma sala"');
    expect(collabSource).toContain('role="status" aria-label="Carregando colaboração"');
    expect(collabSource).not.toContain('border-dashed p-12 text-center"><UsersRound');
  });

  test("Q-02/Q-08: organizar/loading.tsx possui role='status' e utiliza Skeleton canônico", () => {
    const orgLoadingSource = readFileSync(path.join(process.cwd(), "src/app/organizar/loading.tsx"), "utf8");

    expect(orgLoadingSource).toContain('import { RouteLoading } from "@/components/route-states";');
    expect(orgLoadingSource).toContain('import { Skeleton } from "@/components/ui/skeleton";');
    expect(orgLoadingSource).toContain('label="Carregando organização"');
  });

  test("Navegação real: rotas com novos loading e error boundaries carregam sem quebra visual no cliente", async ({ page }) => {
    const routesToVisit = ["/lab", "/provas", "/configuracoes", "/storage", "/academy"];
    for (const route of routesToVisit) {
      const response = await page.goto(route);
      expect(response?.status(), `Rota ${route} deve responder HTTP 200`).toBe(200);
      await expect(page.locator("main, [role='status'], [role='alert']").first()).toBeVisible();
    }
  });

  test("Comportamento real em navegador: error.tsx captura falha transitória sem vazar detalhes sensíveis e recupera com Tentar novamente", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __qu1FailStorageRender?: boolean }).__qu1FailStorageRender = true;
      const originalEstimate = navigator.storage?.estimate?.bind(navigator.storage);
      if (navigator.storage) {
        Object.defineProperty(navigator.storage, "estimate", {
          configurable: true,
          value: async () => {
            if (originalEstimate) {
              const res = await originalEstimate();
              return { usage: Math.max(res.usage ?? 0, 4096), quota: Math.max(res.quota ?? 0, 1048576) };
            }
            return { usage: 4096, quota: 1048576 };
          },
        });
      }

      const originalToLocaleString = Number.prototype.toLocaleString;
      Number.prototype.toLocaleString = function (locales?: Intl.LocalesArgument, options?: Intl.NumberFormatOptions) {
        if (
          (window as unknown as { __qu1FailStorageRender?: boolean }).__qu1FailStorageRender &&
          window.location.pathname === "/storage" &&
          locales === "pt-BR"
        ) {
          throw new Error("SENSITIVE_INTERNAL_SECRET_8492 at /internal/db/secret-path:42");
        }
        return originalToLocaleString.call(this, locales, options);
      };
    });

    await page.goto("/storage");

    const errorAlert = page.getByRole("alert").filter({ hasText: "Não foi possível carregar o Diagnóstico de Storage" });
    await expect(errorAlert).toBeVisible({ timeout: 15_000 });

    // Garante que detalhes sensíveis do erro não vazam na UI renderizada
    const alertText = await errorAlert.innerText();
    expect(alertText).not.toContain("SENSITIVE_INTERNAL_SECRET_8492");
    expect(alertText).not.toContain("/internal/db/secret-path");

    // Encerra a falha transitória antes de acionar "Tentar novamente" (reset())
    await page.evaluate(() => {
      (window as unknown as { __qu1FailStorageRender?: boolean }).__qu1FailStorageRender = false;
    });
    await errorAlert.getByRole("button", { name: "Tentar novamente" }).click();

    await expect(page.getByText("Object Stores")).toBeVisible({ timeout: 15_000 });
    await expect(errorAlert).toBeHidden();
  });
});
