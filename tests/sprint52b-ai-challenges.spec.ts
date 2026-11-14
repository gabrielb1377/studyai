import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { STORAGE_DATABASE_VERSION } from "../src/lib/storage/StorageVersion";
import { readIndexedDBStore } from "./helpers/indexed-db";
import {
  isLabChallengeRequest,
  parseGeneratedLabChallenge,
} from "../src/features/lab/validators/lab-validation";
import type { LabProject } from "../src/features/lab/types";

const TEST_PASSWORD = "StudyAI2026secure";

async function putIndexedDBRecord(page: Page, store: string, value: Record<string, unknown>) {
  await page.evaluate(
    async ({ targetStore, record, version }) =>
      new Promise<void>((resolve, reject) => {
        const scope = localStorage.getItem("studyai:storage-scope") || "guest";
        const dbName = scope === "guest" ? "studyai-db" : `studyai-db:${scope}`;
        const request = indexedDB.open(dbName, version);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("IndexedDB blocked during test seed"));
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(targetStore, "readwrite");
          transaction.objectStore(targetStore).put(record);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    { targetStore: store, record: value, version: STORAGE_DATABASE_VERSION },
  );
}

async function seedStudyWithMaterial(
  page: Page,
  options: {
    studyId: string;
    studyTitle: string;
    subject: string;
    materialId: string;
    fileId: string;
    materialName: string;
    extractedText?: string;
    chunkText?: string;
  },
) {
  const now = new Date().toISOString();
  await putIndexedDBRecord(page, "studies", {
    studyId: options.studyId,
    title: options.studyTitle,
    subject: options.subject,
    materialIds: [options.materialId],
    status: "in_progress",
    progress: 35,
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
  });

  await putIndexedDBRecord(page, "documents", {
    id: options.materialId,
    fileId: options.fileId,
    name: options.materialName,
    relativePath: options.materialName,
    fileType: "txt",
    mimeType: "text/plain",
    size: 1024,
    lastModified: Date.now(),
    importedAt: now,
    updatedAt: now,
    progress: 100,
    status: options.extractedText ? "ready" : "pending",
    isFavorite: false,
    studyId: options.studyId,
    subject: options.subject,
    topic: options.studyTitle,
    sourceType: "upload",
    tags: [],
  });

  if (options.extractedText !== undefined && options.extractedText.length > 0) {
    await putIndexedDBRecord(page, "contents", {
      id: `content-${options.fileId}`,
      studyId: options.studyId,
      fileId: options.fileId,
      fileType: "txt",
      extractedText: options.extractedText,
      metadata: {
        name: options.materialName,
        type: "text/plain",
        size: options.extractedText.length,
        subject: options.subject,
        topic: options.studyTitle,
      },
      status: options.extractedText.trim().length >= 10 ? "extracted" : "error",
      createdAt: now,
    });
  }

  if (options.chunkText) {
    await putIndexedDBRecord(page, "chunks", {
      id: `chunk-${options.fileId}-0`,
      studyId: options.studyId,
      fileId: options.fileId,
      chunkIndex: 0,
      text: options.chunkText,
      metadata: {
        extractedContentId: `content-${options.fileId}`,
        sourceName: options.materialName,
        fileType: "txt",
        mimeType: "text/plain",
        size: options.chunkText.length,
        subject: options.subject,
        topic: options.studyTitle,
      },
    });
  }
}

async function registerAccount(page: Page, email: string) {
  await page.goto("/conta");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome").fill("Estudante Teste");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible();
}

test("parseGeneratedLabChallenge e isLabChallengeRequest validam schema, modalidade e rejeitam saída malformada", () => {
  expect(() =>
    parseGeneratedLabChallenge(
      "resposta em texto livre sem json",
      { modality: "code", difficulty: "medium" },
      { provider: "gemini", model: "gemini-2.5-flash" },
    ),
  ).toThrow(/formato JSON/i);

  expect(() =>
    parseGeneratedLabChallenge(
      JSON.stringify({
        title: "Consulta SQL",
        statement: "Liste alunos.",
        modality: "sql",
        language: "sql",
        difficulty: "easy",
        starterCode: "SELECT 1;",
        expectedResult: "1",
        solution: "SELECT 1;",
        explanation: "Usa SELECT.",
      }),
      { modality: "math", difficulty: "easy" },
      { provider: "gemini", model: "gemini-2.5-flash" },
    ),
  ).toThrow(/outra modalidade/i);

  expect(() =>
    parseGeneratedLabChallenge(
      JSON.stringify({
        title: "Script Python",
        statement: "Calcular soma.",
        modality: "code",
        language: "python",
        difficulty: "easy",
        starterCode: "print(1 + 2)",
        expectedResult: "3",
        solution: "print(1 + 2)",
        explanation: "Soma simples.",
      }),
      { modality: "code", difficulty: "easy" },
      { provider: "gemini", model: "gemini-2.5-flash" },
    ),
  ).toThrow(/linguagem incompatível/i);

  expect(() =>
    parseGeneratedLabChallenge(
      JSON.stringify({
        title: "Código perigoso",
        statement: "Buscar rede.",
        modality: "code",
        language: "javascript",
        difficulty: "easy",
        starterCode: "console.log(1);",
        expectedResult: "1",
        solution: "fetch('/api/secret');",
        explanation: "Proibido.",
      }),
      { modality: "code", difficulty: "easy" },
      { provider: "gemini", model: "gemini-2.5-flash" },
    ),
  ).toThrow(/não são permitidos/i);

  expect(() =>
    parseGeneratedLabChallenge(
      JSON.stringify({
        title: "Matemática inválida",
        statement: "Avalie f(x).",
        modality: "math",
        language: "math",
        difficulty: "medium",
        starterCode: "console.log(1);",
        expectedResult: "1",
        solution: "console.log(1);",
        explanation: "JS no simulador matemático.",
      }),
      { modality: "math", difficulty: "medium" },
      { provider: "gemini", model: "gemini-2.5-flash" },
    ),
  ).toThrow(/sintaxe incompatível/i);

  const validMath = parseGeneratedLabChallenge(
    JSON.stringify({
      title: "Raízes da função do material",
      statement: "Calcule o vértice e raízes de f(x) = x^2 - 4*x + 3.",
      modality: "math",
      language: "math",
      difficulty: "medium",
      starterCode: "# Ajuste o intervalo\nx: 0..4\npasso: 1\nf(x) = x^2 - 4*x + 3",
      expectedResult: "Mínimo: -1",
      hints: ["Observe onde f(x) cruza zero."],
      steps: ["Execute o intervalo inicial", "Identifique x = 1 e x = 3"],
      solution: "x: 0..4\npasso: 1\nf(x) = x^2 - 4*x + 3",
      explanation: "O mínimo ocorre no vértice x = 2.",
    }),
    { modality: "math", difficulty: "medium" },
    { provider: "gemini", model: "gemini-2.5-flash" },
  );
  expect(validMath.language).toBe("math");
  expect(validMath.steps).toHaveLength(2);

  expect(
    isLabChallengeRequest({
      materialId: "mat-1",
      materialName: "Texto curto",
      modality: "code",
      language: "javascript",
      difficulty: "easy",
      extractedText: "curto",
      chunks: [],
    }),
  ).toBe(false);

  expect(
    isLabChallengeRequest({
      studyId: "study-a",
      materialId: "mat-1",
      materialFileId: "file-1",
      materialName: "Apostila de Cálculo",
      modality: "math",
      language: "math",
      difficulty: "medium",
      extractedText: "Funções quadráticas possuem vértice em -b/(2a) e raízes reais quando delta >= 0.",
      chunks: [{ fileId: "other-file", studyId: "study-a", sourceName: "Apostila", text: "Trecho" }],
    }),
  ).toBe(false);
});

test("gera desafio baseado no texto extraído, mostra preview, cancela sem salvar, aceita sem sobrescrever e persiste após reload", async ({
  page,
}) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "Novo exercício" }).click();
  await page.getByRole("textbox", { name: "Título do exercício" }).fill("Projeto manual pré-existente");
  await page.getByRole("button", { name: "Criar laboratório" }).click();
  await expect(page.getByRole("heading", { name: "Projeto manual pré-existente" })).toBeVisible();

  await seedStudyWithMaterial(page, {
    studyId: "study-alg",
    studyTitle: "Algoritmos de Ordenação",
    subject: "Estruturas de Dados",
    materialId: "mat-alg-1",
    fileId: "file-alg-1",
    materialName: "Apostila 01 — Material Geral",
    extractedText:
      "Na ordenação por inserção (insertion sort) e na busca binária em vetores ordenados, cada comparação divide o espaço pela metade em O(log n).",
    chunkText:
      "Busca binária exige vetor ordenado e compara o elemento central com o alvo para retornar o índice exato.",
  });

  const capturedBodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/lab/challenge", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    capturedBodies.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        challenge: {
          title: "Busca binária passo a passo",
          statement: "Implemente uma função de busca binária usando o vetor ordenado do material.",
          modality: "code",
          language: "javascript",
          difficulty: "hard",
          starterCode:
            "function binarySearch(arr, target) {\n  return arr.indexOf(target);\n}\nconsole.log(binarySearch([2, 4, 6, 8, 10], 8));",
          expectedResult: "3",
          hints: ["Compare o meio do intervalo com o alvo."],
          steps: [
            { id: "step-1", title: "Definir ponteiros inicio e fim", done: false },
            { id: "step-2", title: "Imprimir o índice encontrado", done: false },
          ],
          solution:
            "function binarySearch(arr, target) {\n  let left = 0, right = arr.length - 1;\n  while (left <= right) {\n    const mid = Math.floor((left + right) / 2);\n    if (arr[mid] === target) return mid;\n    if (arr[mid] < target) left = mid + 1;\n    else right = mid - 1;\n  }\n  return -1;\n}\nconsole.log(binarySearch([2, 4, 6, 8, 10], 8));",
          explanation: "Divide o intervalo pela metade a cada passo.",
          provider: "gemini",
          model: "gemini-2.5-flash",
        },
      }),
    });
  });

  // 1) Abrir dialog, gerar preview e CANCELAR sem persistir
  await page.getByRole("button", { name: "Gerar desafio com IA" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Gerar desafio prático com IA" })).toBeVisible();
  await dialog.getByLabel("Estudo para o desafio").selectOption("study-alg");
  await dialog.getByLabel("Material para o desafio").selectOption("mat-alg-1");
  await dialog.getByLabel("Modalidade do desafio").selectOption("code");
  await dialog.getByLabel("Dificuldade do desafio").selectOption("hard");
  await dialog.getByRole("button", { name: "Gerar desafio" }).click();

  await expect(dialog.getByText("Busca binária passo a passo")).toBeVisible();
  await expect(dialog.getByText("Apostila 01 — Material Geral")).toBeVisible();

  // Antes de aceitar, não deve haver persistência no store lab
  const beforeAccept = await readIndexedDBStore<LabProject>(page, "lab");
  expect(beforeAccept).toHaveLength(1);

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  const afterCancel = await readIndexedDBStore<LabProject>(page, "lab");
  expect(afterCancel).toHaveLength(1);

  // Verifica que enviou texto real extraído e chunks, não apenas o título
  expect(capturedBodies).toHaveLength(1);
  const reqPayload = capturedBodies[0].request as Record<string, unknown>;
  expect(reqPayload.extractedText).toContain("busca binária");
  expect(reqPayload.chunks).toHaveLength(1);

  // 2) Gerar novamente e ACEITAR (preservando o projeto anterior)
  await page.getByRole("button", { name: "Gerar desafio com IA" }).click();
  await dialog.getByLabel("Estudo para o desafio").selectOption("study-alg");
  await dialog.getByLabel("Dificuldade do desafio").selectOption("hard");
  await dialog.getByRole("button", { name: "Gerar desafio" }).click();
  await expect(dialog.getByText("Busca binária passo a passo")).toBeVisible();

  await dialog.getByRole("button", { name: "Aceitar e abrir no Laboratório" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole("heading", { name: "Busca binária passo a passo" })).toBeVisible();
  await expect(page.getByText("Material: Apostila 01 — Material Geral")).toBeVisible();
  await expect(page.getByText("Gerado com IA")).toBeVisible();
  await expect(page.getByText("Projeto manual pré-existente")).toBeVisible();

  // Executa o desafio gerado no sandbox
  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expect(page.getByRole("region", { name: "Preview e resultado" }).getByText("3", { exact: true })).toBeVisible();

  // Marca passo e recarrega para validar persistência e vínculos
  await page.getByRole("checkbox", { name: /Definir ponteiros inicio e fim/i }).check();
  await page.reload();

  await expect(page.getByRole("heading", { name: "Busca binária passo a passo" })).toBeVisible();
  await expect(page.getByText("Material: Apostila 01 — Material Geral")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Definir ponteiros inicio e fim/i })).toBeChecked();

  const stored = await readIndexedDBStore<LabProject>(page, "lab");
  expect(stored).toHaveLength(2);
  const generated = stored.find((item) => item.title === "Busca binária passo a passo");
  expect(generated).toMatchObject({
    studyId: "study-alg",
    sourceMaterialId: "mat-alg-1",
    sourceMaterialName: "Apostila 01 — Material Geral",
    generatedByAI: true,
    language: "javascript",
  });
});

test("bloqueia geração para material sem texto extraído e funciona dentro do Workspace (/estudo?aba=lab)", async ({
  page,
}) => {
  await page.goto("/lab");
  await expect(page.getByRole("button", { name: "Gerar desafio com IA" })).toBeVisible();
  await seedStudyWithMaterial(page, {
    studyId: "study-calc",
    studyTitle: "Cálculo I",
    subject: "Matemática",
    materialId: "mat-empty",
    fileId: "file-empty",
    materialName: "PDF Escaneado Sem OCR.pdf",
    extractedText: "",
  });

  let apiCalled = false;
  await page.route("**/api/lab/challenge", async (route) => {
    apiCalled = true;
    await route.fulfill({ status: 500, body: "{}" });
  });

  await page.getByRole("button", { name: "Gerar desafio com IA" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/não possui texto extraído/i)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Gerar desafio" })).toBeDisabled();
  expect(apiCalled).toBe(false);
  await dialog.getByRole("button", { name: "Cancelar" }).click();

  // Adiciona material válido com texto matemático e abre via /estudo?tema=study-calc&aba=lab
  await seedStudyWithMaterial(page, {
    studyId: "study-calc",
    studyTitle: "Cálculo I",
    subject: "Matemática",
    materialId: "mat-math-ok",
    fileId: "file-math-ok",
    materialName: "Derivadas e Pontos Críticos.txt",
    extractedText: "Uma função quadrática f(x) = x^2 - 6*x + 8 tem mínimo global no ponto onde f'(x) = 2x - 6 = 0.",
  });

  await page.unroute("**/api/lab/challenge");
  await page.route("**/api/lab/challenge", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        challenge: {
          title: "Ponto de mínimo de f(x)",
          statement: "Analise o gráfico de $f(x) = x^2 - 6x + 8$ entre 0 e 6.",
          modality: "math",
          language: "math",
          difficulty: "medium",
          starterCode: "# Ponto crítico\nx: 0..6\npasso: 1\nf(x) = x^2 - 6*x + 8",
          expectedResult: "Mínimo: -1",
          hints: ["Verifique f(3)."],
          steps: [{ id: "step-1", title: "Plotar a parábola", done: false }],
          solution: "x: 0..6\npasso: 1\nf(x) = x^2 - 6*x + 8",
          explanation: "O vértice ocorre em x = 3.",
          provider: "gemini",
          model: "gemini-2.5-flash",
        },
      }),
    });
  });

  await page.goto("/estudo?tema=study-calc&aba=lab");
  await page.getByRole("button", { name: "Gerar desafio com IA" }).click();
  await dialog.getByLabel("Material para o desafio").selectOption("mat-math-ok");
  await dialog.getByLabel("Modalidade do desafio").selectOption("math");
  await dialog.getByRole("button", { name: "Gerar desafio" }).click();
  await expect(dialog.getByText("Ponto de mínimo de f(x)")).toBeVisible();
  await dialog.getByRole("button", { name: "Aceitar e abrir no Laboratório" }).click();

  await expect(page.getByRole("heading", { name: "Ponto de mínimo de f(x)" })).toBeVisible();
  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expect(page.getByRole("img", { name: /Gráfico/i })).toBeVisible();
});

test("trata erro 502, 503, rate limit 429 com cooldown e evita duplicação por cliques repetidos", async ({
  page,
}) => {
  await page.goto("/lab");
  await expect(page.getByRole("button", { name: "Gerar desafio com IA" })).toBeVisible();
  await seedStudyWithMaterial(page, {
    studyId: "study-sql",
    studyTitle: "Banco de Dados",
    subject: "SQL",
    materialId: "mat-sql-1",
    fileId: "file-sql-1",
    materialName: "Modelagem Relacional.txt",
    extractedText: "Consultas SELECT com GROUP BY e COUNT permitem agrupar matrículas por curso.",
  });

  let callCount = 0;
  let scenario: "invalid_ai" | "rate_limit" | "service_down" | "success" = "invalid_ai";

  await page.route("**/api/lab/challenge", async (route) => {
    callCount += 1;
    if (scenario === "invalid_ai") {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          code: "INVALID_AI_RESPONSE",
          error: "A IA retornou um desafio incompatível com o Laboratório.",
        }),
      });
      return;
    }
    if (scenario === "rate_limit") {
      await route.fulfill({
        status: 429,
        headers: { "Retry-After": "2" },
        contentType: "application/json",
        body: JSON.stringify({
          code: "RATE_LIMIT",
          error: "Limite temporário da IA atingido.",
        }),
      });
      return;
    }
    if (scenario === "service_down") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "PROVIDER_UNAVAILABLE",
          error: "Nenhum provedor de IA está disponível no momento.",
        }),
      });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        challenge: {
          title: "Contagem de matrículas SQL",
          statement: "Agrupe matrículas por curso.",
          modality: "sql",
          language: "sql",
          difficulty: "easy",
          starterCode:
            "CREATE TABLE matriculas (curso TEXT);\nINSERT INTO matriculas VALUES ('IA'), ('IA');\nSELECT curso, COUNT(*) FROM matriculas GROUP BY curso;",
          expectedResult: "IA | 2",
          hints: ["Use GROUP BY curso."],
          steps: [{ id: "step-1", title: "Executar consulta agregada", done: false }],
          solution:
            "CREATE TABLE matriculas (curso TEXT);\nINSERT INTO matriculas VALUES ('IA'), ('IA');\nSELECT curso, COUNT(*) FROM matriculas GROUP BY curso;",
          explanation: "GROUP BY agrupa registros idênticos.",
          provider: "gemini",
          model: "gemini-2.5-flash",
        },
      }),
    });
  });

  await page.getByRole("button", { name: "Gerar desafio com IA" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Modalidade do desafio").selectOption("sql");

  // 1) Erro 502 resposta inválida/incompatível
  await dialog.getByRole("button", { name: "Gerar desafio" }).click();
  await expect(dialog.getByRole("alert")).toContainText("incompatível");

  // 2) Erro 503 indisponibilidade recuperável
  scenario = "service_down";
  await dialog.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Nenhum provedor de IA está disponível");

  // 3) Erro 429 rate limit com cooldown de 2s e retry liberado após cooldown
  scenario = "rate_limit";
  await dialog.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Limite temporário");
  await expect(dialog.getByText(/Nova tentativa disponível em/i)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Tentar novamente" })).toBeDisabled();

  // Aguarda fim do cooldown e testa lock contra cliques repetidos durante a geração
  scenario = "success";
  const retryButton = dialog.getByRole("button", { name: "Tentar novamente" });
  await expect(retryButton).toBeEnabled({ timeout: 5_000 });

  const callsBeforeBurst = callCount;
  await retryButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });

  await expect(dialog.getByText("Contagem de matrículas SQL")).toBeVisible();
  expect(callCount - callsBeforeBurst).toBe(1);

  const acceptButton = dialog.getByRole("button", { name: "Aceitar e abrir no Laboratório" });
  await acceptButton.click();
  await expect(dialog).toBeHidden();

  const stored = await readIndexedDBStore<LabProject>(page, "lab");
  expect(stored.filter((item) => item.title === "Contagem de matrículas SQL")).toHaveLength(1);
});

test("isolamento entre contas e contrato server-side de autenticação, ownership e 502", async ({
  browser,
  context,
  page,
}) => {
  // 1) Contrato HTTP direto sem autenticação / sem CSRF
  const noCsrf = await page.request.post("/api/lab/challenge", { data: {} });
  expect(noCsrf.status()).toBe(403);

  await page.goto("/conta");
  const csrfToken = "test-csrf-unauth-check";
  await context.addCookies([{ name: "studyai_csrf", value: csrfToken, url: page.url() }]);

  const unauthenticated = await page.request.post("/api/lab/challenge", {
    headers: { "x-csrf-token": csrfToken },
    data: { request: {} },
  });
  expect(unauthenticated.status()).toBe(401);
  await context.clearCookies();

  // 2) Isolamento entre Usuário A e Usuário B no navegador e na API
  const emailA = `lab-a-${Date.now()}@example.com`;
  const emailB = `lab-b-${Date.now()}@example.com`;

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await registerAccount(pageA, emailA);
  const sessionInfoA = await (await pageA.request.get("/auth/session")).json() as { user: { id: string } };
  const csrfA = await pageA.evaluate(
    () =>
      document.cookie
        .split(";")
        .map((item) => item.trim())
        .find((item) => item.startsWith("studyai_csrf="))
        ?.split("=")
        .slice(1)
        .join("=") ?? "",
  );

  await pageA.goto("/lab");
  await expect(pageA.getByRole("button", { name: "Gerar desafio com IA" })).toBeVisible();
  await seedStudyWithMaterial(pageA, {
    studyId: "study-priv-a",
    studyTitle: "Estudo Privado A",
    subject: "Privacidade",
    materialId: "mat-priv-a",
    fileId: "file-priv-a",
    materialName: "Segredo A.txt",
    extractedText: "Conteúdo confidencial exclusivo da conta A para testes de isolamento.",
  });

  // Registra sync do material mat-priv-a no servidor para conta A
  const syncA = await pageA.request.post("/sync", {
    headers: { "x-csrf-token": csrfA, "x-studyai-session-user": sessionInfoA.user.id },
    data: {
      mutations: [
        {
          entity: "documents",
          recordId: "mat-priv-a",
          operation: "upsert",
          baseVersion: 0,
          updatedAt: new Date().toISOString(),
          hash: "hash-a-1",
          deviceId: "dev-a",
          data: { id: "mat-priv-a", studyId: "study-priv-a", name: "Segredo A.txt" },
        },
      ],
    },
  });
  expect(syncA.ok()).toBe(true);

  // Usuário B em outro contexto não enxerga material nem desafios da conta A
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await registerAccount(pageB, emailB);
  const sessionInfoB = await (await pageB.request.get("/auth/session")).json() as { user: { id: string } };
  const csrfB = await pageB.evaluate(
    () =>
      document.cookie
        .split(";")
        .map((item) => item.trim())
        .find((item) => item.startsWith("studyai_csrf="))
        ?.split("=")
        .slice(1)
        .join("=") ?? "",
  );

  // Sincroniza material próprio de B para ativar checagem estrita de posse na conta B
  const syncB = await pageB.request.post("/sync", {
    headers: { "x-csrf-token": csrfB, "x-studyai-session-user": sessionInfoB.user.id },
    data: {
      mutations: [
        {
          entity: "documents",
          recordId: "mat-priv-b",
          operation: "upsert",
          baseVersion: 0,
          updatedAt: new Date().toISOString(),
          hash: "hash-b-1",
          deviceId: "dev-b",
          data: { id: "mat-priv-b", studyId: "study-priv-b", name: "Material B.txt" },
        },
      ],
    },
  });
  expect(syncB.ok()).toBe(true);

  // Sessão obsoleta (header da conta A usando cookie da conta B) -> 409 SESSION_CHANGED
  const staleSessionRes = await pageB.request.post("/api/lab/challenge", {
    headers: { "x-csrf-token": csrfB, "x-studyai-session-user": sessionInfoA.user.id },
    data: {},
  });
  expect(staleSessionRes.status()).toBe(409);

  // Usuário B tentando gerar desafio com materialId da conta A -> 403 FORBIDDEN
  const crossTenantRes = await pageB.request.post("/api/lab/challenge", {
    headers: { "x-csrf-token": csrfB, "x-studyai-session-user": sessionInfoB.user.id },
    data: {
      request: {
        studyId: "study-priv-a",
        materialId: "mat-priv-a",
        materialFileId: "file-priv-a",
        materialName: "Segredo A.txt",
        modality: "code",
        language: "javascript",
        difficulty: "easy",
        extractedText: "Texto suficiente para validar payload e testar posse no servidor.",
        chunks: [{ fileId: "file-priv-a", studyId: "study-priv-a", sourceName: "Segredo A.txt", text: "Trecho" }],
      },
    },
  });
  expect(crossTenantRes.status()).toBe(403);

  await pageB.goto("/lab");
  await pageB.getByRole("button", { name: "Gerar desafio com IA" }).click();
  await expect(pageB.getByText("Segredo A.txt")).toHaveCount(0);

  await contextA.close();
  await contextB.close();

  // 3) Contrato da rota: retorna 502 quando IA devolve JSON inválido
  const requireModule = createRequire(__filename);
  const routeSource = readFileSync(path.join(process.cwd(), "src/app/api/lab/challenge/route.ts"), "utf8");
  const serviceSource = readFileSync(path.join(process.cwd(), "src/features/lab/services/LabChallengeService.ts"), "utf8");

  const transpiledService = ts.transpileModule(serviceSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const serviceMod = { exports: {} };
  const serviceDeps: Record<string, unknown> = {
    "server-only": {},
    "@/features/ai/AIService": {
      AIService: { generate: async () => ({ text: "{broken json", provider: "gemini", model: "test" }) },
    },
    "@/features/ai/AIErrors": { AIError: class extends Error {} },
    "@/features/ai/TokenCounter": { TokenCounter: { truncate: (v: string) => v } },
    "@/server/cloud/CloudDatabase": {
      CloudDatabase: { record: async () => undefined, allRecords: async () => [] },
    },
    "@/server/database/Postgres": { hasPostgres: () => false, query: async () => ({ rows: [] }) },
    "../validators/lab-validation": {
      modalityToLabLanguage: () => "javascript",
      parseGeneratedLabChallenge,
    },
  };
  vm.runInContext(
    transpiledService,
    vm.createContext({
      module: serviceMod,
      exports: serviceMod.exports,
      require: (id: string) => (id in serviceDeps ? serviceDeps[id] : requireModule(id)),
      setTimeout,
      clearTimeout,
      AbortController,
    }),
  );

  const transpiledRoute = ts.transpileModule(routeSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const routeMod = { exports: {} };
  const routeDeps: Record<string, unknown> = {
    "next/server": {
      NextResponse: {
        json: (body: unknown, init?: ResponseInit) =>
          new Response(JSON.stringify(body), {
            ...init,
            headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
          }),
      },
    },
    "@/features/ai/AIErrors": { normalizeAIError: () => ({ status: 500, body: { error: "err" } }) },
    "@/features/ai/AIProvider": {
      isAIProviderId: () => true,
      isAISelectionMode: () => true,
      isAIModelPreferences: () => true,
    },
    "@/features/lab/services/LabChallengeService": serviceMod.exports,
    "@/features/lab/validators/lab-validation": { isLabChallengeRequest },
    "@/server/ai/QuotaMiddleware": {
      withAIQuota: async (
        request: Request,
        handler: (req: Request, ai: object) => Promise<Response>,
      ) => handler(request, {}),
    },
    "@/server/auth/http": {
      requireCsrf: () => undefined,
      requireUser: () => ({ sub: "user-1" }),
      requireSessionOwner: () => undefined,
      apiError: (error: unknown) => new Response(String(error), { status: 500 }),
    },
  };
  vm.runInContext(
    transpiledRoute,
    vm.createContext({
      module: routeMod,
      exports: routeMod.exports,
      require: (id: string) => (id in routeDeps ? routeDeps[id] : requireModule(id)),
      Response,
      Request,
    }),
  );
  const post = (routeMod.exports as { POST: (req: Request) => Promise<Response> }).POST;
  const routeResponse = await post(
    new Request("http://localhost/api/lab/challenge", {
      method: "POST",
      body: JSON.stringify({
        request: {
          studyId: "s-1",
          materialId: "m-1",
          materialFileId: "f-1",
          materialName: "Material Válido.txt",
          modality: "code",
          language: "javascript",
          difficulty: "easy",
          extractedText: "Texto suficientemente longo sobre arrays em JavaScript.",
          chunks: [],
        },
      }),
    }),
  );
  expect(routeResponse.status).toBe(502);
  const routeJson = (await routeResponse.json()) as { code?: string };
  expect(routeJson.code).toBe("INVALID_AI_RESPONSE");
});

test("responsividade mobile (390x844) do modal e preview de desafio com IA", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lab");
  await expect(page.getByRole("button", { name: "Gerar desafio com IA" })).toBeVisible();
  await seedStudyWithMaterial(page, {
    studyId: "study-mob",
    studyTitle: "Estatística",
    subject: "Dados",
    materialId: "mat-mob",
    fileId: "file-mob",
    materialName: "Tabelas_e_Distribuicoes_Muito_Longo_Para_Testar_Quebra_Em_Mobile.csv",
    extractedText: "Séries temporais mensais comparam vendas, médias e medianas em tabelas CSV simples.",
  });

  await page.route("**/api/lab/challenge", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        challenge: {
          title: "Análise de vendas mensais",
          statement: "Observe a média e mediana da série CSV abaixo.",
          modality: "data",
          language: "data",
          difficulty: "easy",
          starterCode: "# tipo: bar\nMes,Vendas\nJan,12\nFev,18\nMar,24",
          expectedResult: "Média: 18",
          hints: ["Execute para ver as métricas."],
          steps: [{ id: "step-1", title: "Gerar gráfico de barras", done: false }],
          solution: "# tipo: bar\nMes,Vendas\nJan,12\nFev,18\nMar,24",
          explanation: "Calcula média e mediana automaticamente.",
          provider: "gemini",
          model: "gemini-2.5-flash",
        },
      }),
    });
  });

  await page.getByRole("button", { name: "Gerar desafio com IA" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Modalidade do desafio").selectOption("data");
  await dialog.getByRole("button", { name: "Gerar desafio" }).click();
  await expect(dialog.getByText("Análise de vendas mensais")).toBeVisible();

  const fitsViewport = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1;
  });
  expect(fitsViewport).toBe(true);
});
