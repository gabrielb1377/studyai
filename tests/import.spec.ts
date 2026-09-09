import { expect, test } from "@playwright/test";

test("seleciona, remove e processa arquivos localmente", async ({ page }) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH"].includes(request.method())) {
      writes.push(`${request.method()} ${request.url()}`);
    }
  });

  await page.goto("/importar");
  await expect(
    page.getByRole("heading", { name: "Importar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Importar", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  const input = page.getByLabel("Selecionar arquivos do dispositivo");
  await input.setInputFiles([
    {
      name: "algoritmos.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("pdf mock"),
    },
    {
      name: "anotacoes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("texto mock"),
    },
    {
      name: "aula.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("video mock"),
    },
  ]);

  await expect(page.getByRole("listitem")).toHaveCount(3);
  await expect(page.getByText("Arquivo enviado", { exact: true })).toHaveCount(
    3,
  );
  await expect(
    page.getByRole("progressbar", { name: "Progresso geral da importação" }),
  ).toHaveAttribute("aria-valuenow", "0");
  await page.screenshot({
    path: "test-results/import-selected.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "Remover anotacoes.txt" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("anotacoes.txt")).toHaveCount(0);

  await input.setInputFiles({
    name: "imagem.png",
    mimeType: "image/png",
    buffer: Buffer.from("imagem mock"),
  });
  await expect(page.locator('p[role="alert"]')).toContainText(
    "arquivo não compatível foi ignorado",
  );
  await expect(page.getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(
    page.getByText("Processando...", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Processando...", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("Concluído", { exact: true })).toHaveCount(2, {
    timeout: 5_000,
  });
  await expect(
    page.getByRole("progressbar", { name: "Progresso geral da importação" }),
  ).toHaveAttribute("aria-valuenow", "100");
  await expect(
    page.getByRole("button", { name: "Importação concluída" }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/import-complete.png",
    fullPage: true,
  });
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("aceita arquivo por arrastar e soltar e evita duplicatas", async ({
  page,
}) => {
  await page.goto("/importar");
  const dropZone = page.getByRole("region", {
    name: "Arraste seus materiais para cá",
  });
  const dropFile = () =>
    dropZone.evaluate((element) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(["documento mock"], "aula.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          lastModified: 1,
        }),
      );
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: transfer });
      element.dispatchEvent(event);
    });
  await dropFile();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByText("aula.docx", { exact: true })).toBeVisible();
  await dropFile();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.locator('p[role="alert"]')).toContainText(
    "arquivo repetido não foi adicionado",
  );
});

test("lista de arquivos permanece responsiva no celular", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles([
    {
      name: "conteudo-da-aula.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("pdf mock"),
    },
    {
      name: "apresentacao.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: Buffer.from("slides mock"),
    },
  ]);
  await expect(page.getByRole("listitem")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Importar", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/import-mobile-files.png",
    fullPage: true,
  });
});
