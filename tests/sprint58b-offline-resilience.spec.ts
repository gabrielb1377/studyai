import { expect, test, type Page } from "@playwright/test";
import { createTextPdf } from "./helpers/pdf-file";
import { readIndexedDBStore } from "./helpers/indexed-db";
import { createRealStudy } from "./helpers/real-study";

const password = "StudyAI2026secure";
const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

async function register(page: Page, email: string, name = "Conta Offline") {
  await page.goto("/conta");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible();
}

async function ensureControlledByServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(
      async () => {
        try {
          return await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
        } catch {
          await page.waitForLoadState("domcontentloaded").catch(() => undefined);
          return false;
        }
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}

test.describe("Sprint 58B — Recursos offline e resiliência", () => {
  test("Service Worker precacheia rotas produtivas, nunca cacheia APIs sensíveis e entrega fallback /estudo offline", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await ensureControlledByServiceWorker(page);

    const studyId = await createRealStudy(page);
    await page.goto("/planejamento");
    await expect(page.getByRole("heading", { name: "Plano de Estudos" })).toBeVisible();
    await page.goto(`/estudo?tema=${studyId}`);
    await expect(page.getByRole("heading", { name: "Estruturas de dados" })).toBeVisible();

    const cacheInspect = await page.evaluate(async () => {
      await Promise.all([
        fetch("/api/health/live").catch(() => null),
        fetch("/auth/session").catch(() => null),
      ]);
      const keys = await caches.keys();
      const shellKey = keys.find((name) => name.startsWith("studyai-shell-"));
      const entries: string[] = [];
      for (const key of keys) {
        const cache = await caches.open(key);
        for (const req of await cache.keys()) {
          entries.push(new URL(requestUrl(req)).pathname);
        }
      }
      function requestUrl(req: Request) {
        return req.url;
      }
      return { shellKey, entries };
    });

    expect(cacheInspect.shellKey).toBeTruthy();
    expect(cacheInspect.entries).toEqual(
      expect.arrayContaining(["/", "/estudo", "/planejamento", "/offline.html"]),
    );
    expect(
      cacheInspect.entries.some((path) =>
        ["/api/", "/auth", "/sync", "/profile", "/backup", "/share", "/compartilhar"].some((prefix) =>
          path.startsWith(prefix),
        ),
      ),
    ).toBe(false);

    await context.setOffline(true);
    await expect(page.getByText("Sem conexão com a internet.", { exact: true })).toBeVisible();

    // Dynamic query route falls back cleanly to cached /estudo shell and loads theme from IndexedDB
    await page.reload();
    await expect(page.getByRole("heading", { name: "Estruturas de dados" })).toBeVisible();

    const apiOfflineStatus = await page.evaluate(async () => {
      try {
        const res = await fetch("/api/health/live");
        return res.status;
      } catch {
        return "network-error";
      }
    });
    expect([503, "network-error"]).toContain(apiOfflineStatus);

    await context.setOffline(false);
    await expect(page.getByText("Conexão restabelecida.", { exact: true })).toBeVisible();
  });

  test("materiais distinguem disponibilidade real no dispositivo vs somente texto/nuvem offline", async ({
    page,
    context,
  }) => {
    await page.goto("/importar");
    const pdfBuffer = createTextPdf([
      "Capitulo 1",
      "Arvores AVL mantem fator de balanceamento entre -1 e 1.",
    ]);
    await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles({
      name: "avl-local.pdf",
      mimeType: "application/pdf",
      buffer: pdfBuffer,
    });
    await page.getByRole("button", { name: "Importar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Extração concluída" })).toBeVisible();

    await page.goto("/organizar");
    await page.getByRole("button", { name: "Ações para avl-local.pdf" }).click();
    await page.getByRole("menuitem", { name: "Mover" }).click();
    await page.getByRole("textbox", { name: "Curso", exact: true }).fill("Computação");
    await page.getByRole("textbox", { name: "Semestre", exact: true }).fill("2º semestre");
    await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Estruturas");
    await page.getByRole("textbox", { name: "Tema", exact: true }).fill("Árvores AVL");
    await expect(page.getByRole("dialog").getByRole("status")).toHaveText("Alterações salvas automaticamente");
    await page.getByRole("dialog").getByRole("button", { name: "Fechar" }).first().click();

    const docs = await readIndexedDBStore<{ id: string; studyId?: string; binaryStorageId?: string }>(page, "documents");
    const pdfDoc = docs.find((item) => item.studyId);
    expect(pdfDoc?.studyId).toBeTruthy();

    await page.goto("/");
    await ensureControlledByServiceWorker(page);
    await page.goto(`/estudo?tema=${pdfDoc!.studyId}`);
    await expect(page.getByText("Disponível neste dispositivo", { exact: true })).toBeVisible();

    // Go offline with local OPFS file intact -> still available locally
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText("Disponível neste dispositivo", { exact: true })).toBeVisible();

    // Simulate missing OPFS binary (e.g., cloud-synced metadata whose binary wasn't downloaded)
    await page.evaluate(async (binaryId) => {
      const storage = navigator.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
      if (!storage.getDirectory) return;
      const root = await storage.getDirectory();
      const base = await root.getDirectoryHandle("studyai-materials");
      for await (const [name, handle] of (base as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        if (handle.kind === "directory") {
          const dir = handle as FileSystemDirectoryHandle;
          await dir.removeEntry(binaryId).catch(() => undefined);
          if (name) {
            await dir.removeEntry(binaryId).catch(() => undefined);
          }
        }
      }
    }, pdfDoc!.binaryStorageId ?? pdfDoc!.id);

    await page.reload();
    await expect(page.getByText("Somente texto offline", { exact: true })).toBeVisible();
    await expect(page.getByText("Disponível neste dispositivo", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("Sem conexão com a internet e o arquivo original não está salvo neste dispositivo."),
    ).toBeVisible();

    // Extracted text remains accessible offline
    await page.getByRole("button", { name: "Ler texto extraído" }).click();
    await expect(page.getByRole("tabpanel", { name: "Material" }).getByText(/Arvores AVL mantem fator de balanceamento/)).toBeVisible();

    await context.setOffline(false);
  });

  test("notas, busca global e modo foco/metas continuam locais offline e reconectam sem duplicação", async ({
    page,
    context,
  }) => {
    const studyId = await createRealStudy(page);
    await page.goto("/");
    await ensureControlledByServiceWorker(page);
    await page.goto("/planejamento");
    await page.getByRole("button", { name: "Definir meta semanal" }).click();
    await page.getByLabel("Minutos na semana").fill("45");
    await page.getByRole("button", { name: "Salvar meta" }).click();
    await expect(page.getByText("Meta semanal salva.")).toBeVisible();

    await page.goto(`/estudo?tema=${studyId}&aba=notes`);
    await expect(page.getByRole("heading", { name: "Estruturas de dados" })).toBeVisible();
    const notesRegion = page.getByRole("region", { name: "Notas" });
    await expect(notesRegion.getByRole("button", { name: "Nova nota" })).toBeVisible();

    await context.setOffline(true);
    await expect(page.getByText("Sem conexão com a internet.", { exact: true })).toBeVisible();

    // 1. Notes created/edited offline persist cleanly
    await notesRegion.getByRole("button", { name: "Nova nota" }).click();
    await notesRegion.getByLabel("Título da nota").fill("Ponteiros Offline 58B");
    await notesRegion.getByLabel("Conteúdo da nota").fill("Anotação persistida offline sem perda.");
    await expect(notesRegion.getByText("Salvo automaticamente", { exact: true })).toBeVisible();

    // 2. Global search works immediately offline without blocking on remote rooms
    await page.keyboard.press("Control+k");
    await page.getByLabel("Pesquisar páginas").fill("Ponteiros Offline 58B");
    await expect(page.getByText("Ponteiros Offline 58B", { exact: true })).toBeVisible({ timeout: 2500 });
    await page.keyboard.press("Escape");

    // 3. Focus mode starts, runs, and completes offline without duplicates
    await page.getByRole("button", { name: "Modo foco" }).click();
    await expect(page.getByText("Modo foco ativo")).toBeVisible();
    await page.getByRole("button", { name: "Encerrar sessão de estudo" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sessão concluída" })).toBeVisible();

    await page.reload();
    await expect(
      notesRegion.getByLabel("Lista de notas").getByText("Ponteiros Offline 58B", { exact: true }),
    ).toBeVisible();

    const metadata = await readIndexedDBStore<{ key: string; value: { studyId: string; status: string } }>(page, "metadata");
    const completedSessions = metadata.filter(
      (entry) =>
        entry.key.startsWith("workspace-session:") &&
        entry.value.studyId === studyId &&
        entry.value.status === "completed",
    );
    expect(completedSessions).toHaveLength(1);

    await context.setOffline(false);
    await expect(page.getByText("Conexão restabelecida.", { exact: true })).toBeVisible();
  });

  test("Tutor IA e Modo Prova protegido bloqueiam operações remotas offline sem expor gabaritos", async ({
    page,
    context,
  }) => {
    const email = uniqueEmail("offline-guards");
    await register(page, email);
    const studyId = await createRealStudy(page);

    await page.route("**/api/tutor", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          model: "gemini-3.7-flash",
          text: "Resposta online preservada no histórico.",
        }),
      }),
    );

    await page.goto(`/estudo?tema=${studyId}&aba=ia`);
    await page.getByRole("button", { name: "Nova conversa" }).click();
    const composer = page.getByLabel("Mensagem para o Tutor IA");
    await composer.fill("Explique vetores");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(
      page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Resposta online preservada no histórico."),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Quiz", exact: true }).click();
    const quiz = page.getByRole("region", { name: "Simulado & Quiz Explicado" });
    await quiz.getByLabel("Modo do simulado").selectOption("exam");
    await expect(quiz.getByRole("button", { name: "Gerar prova protegida" })).toBeEnabled();

    await context.setOffline(true);

    // Protected Exam blocked offline & zero answer key leakage
    await expect(quiz.getByText(/Modo Prova protegido indisponível sem internet/)).toBeVisible();
    await expect(quiz.getByRole("button", { name: "Gerar prova protegida" })).toBeDisabled();
    const workspaceDump = await page.evaluate((id) => localStorage.getItem(`studyai:workspace:${id}`) ?? "", studyId);
    expect(workspaceDump).not.toContain("correctAnswer");

    // Tutor IA preserves history offline but prevents remote generation cleanly
    await page.getByRole("tab", { name: "IA", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Resposta online preservada no histórico."),
    ).toBeVisible();
    await expect(page.getByText(/A geração de respostas e resumos com IA está indisponível offline/)).toBeVisible();
    await page.getByLabel("Mensagem para o Tutor IA").fill("Nova pergunta offline");
    await expect(page.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Gerar resumo" })).toBeDisabled();

    // Reconnect re-enables actions cleanly
    await context.setOffline(false);
    await expect(page.getByRole("button", { name: "Enviar" })).toBeEnabled();
  });

  test("falha de cota (QuotaExceededError) exibe alerta acessível e diagnóstico mostra status honesto de persistência", async ({
    page,
  }) => {
    await page.goto("/storage");
    await expect(page.getByText(/Persistência do navegador:/)).toBeVisible();

    const studyId = await createRealStudy(page);
    await page.goto(`/estudo?tema=${studyId}&aba=notes`);

    const notesRegion = page.getByRole("region", { name: "Notas" });
    await notesRegion.getByRole("button", { name: "Nova nota" }).click();

    await page.evaluate(() => {
      IDBObjectStore.prototype.put = function () {
        throw new DOMException("Simulated storage quota exceeded", "QuotaExceededError");
      };
    });

    await notesRegion.getByLabel("Título da nota").fill("Nota com cota cheia");

    await expect(page.getByRole("alert").getByText("Espaço de armazenamento local cheio", { exact: true })).toBeVisible();
    await expect(
      notesRegion.getByRole("alert").getByText(/O armazenamento local está cheio/i),
    ).toBeVisible();
    await expect(notesRegion.getByText("Salvo automaticamente", { exact: true })).toHaveCount(0);
  });

  test("isolamento entre contas após ciclo offline/online e layout mobile responsivo (390px)", async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const emailA = uniqueEmail("offline-a");
    const emailB = uniqueEmail("offline-b");
    const secretMarkerA = `segredo-conta-a-${Date.now()}`;

    await register(page, emailA, "Usuário A");
    await page.goto("/estudo");
    await page.evaluate((marker) => {
      localStorage.setItem("studyai:workspace:leak-check", marker);
    }, secretMarkerA);

    await context.setOffline(true);
    await expect(page.getByText("Sem conexão com a internet.", { exact: true })).toBeVisible();
    const overflowOffline = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflowOffline).toBeLessThanOrEqual(2);

    await context.setOffline(false);
    await page.goto("/conta");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Conta StudyAI" })).toBeVisible();

    await register(page, emailB, "Usuário B");
    const leaked = await page.evaluate(
      (marker) => Object.values(localStorage).some((val) => val.includes(marker)),
      secretMarkerA,
    );
    expect(leaked).toBe(false);
  });
});
