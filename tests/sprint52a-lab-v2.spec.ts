import { expect, test } from "@playwright/test";
import { DataLabService } from "../src/features/lab/services/DataLabService";
import { MathLabService } from "../src/features/lab/services/MathLabService";

test("MathLabService e DataLabService validam expressões, estatísticas e limites com segurança", () => {
  const quad = MathLabService.execute("a = 1\nb = -4\nc = 3\nx: 0..4\npasso: 1\nf(x) = a*x^2 + b*x + c");
  expect(quad.status).toBe("success");
  expect(quad.metrics).toEqual(
    expect.arrayContaining([
      { label: "Pontos", value: "5" },
      { label: "Mínimo", value: "-1" },
      { label: "Máximo", value: "3" },
    ]),
  );
  expect(quad.chart?.points).toHaveLength(5);
  expect(quad.output.join(" ")).toContain("x = 1");
  expect(quad.output.join(" ")).toContain("x = 3");

  const scalar = MathLabService.execute("2^3^2 + sqrt(144) - 2*5");
  expect(scalar.status).toBe("success");
  expect(scalar.metrics).toEqual([{ label: "Resultado", value: "514" }]);

  const implicit = MathLabService.execute("x: 1..3\npasso: 1\nf(x) = 2x + 1");
  expect(implicit.status).toBe("success");
  expect(implicit.rows).toEqual([
    [1, 3],
    [2, 5],
    [3, 7],
  ]);

  const divZero = MathLabService.execute("10 / 0");
  expect(divZero.status).toBe("error");
  expect(divZero.error).toContain("Divisão por zero");

  const tooMany = MathLabService.execute("x: 0..500\npasso: 1\nf(x) = x");
  expect(tooMany.status).toBe("error");
  expect(tooMany.error).toContain("limite seguro");

  const csvData = DataLabService.execute("# grafico: linha\nItem,Valor\nA,10\nB,20\nC,30\nD,40");
  expect(csvData.status).toBe("success");
  expect(csvData.chart?.kind).toBe("line");
  expect(csvData.metrics).toEqual(
    expect.arrayContaining([
      { label: "Registros", value: "4" },
      { label: "Média", value: "25" },
      { label: "Mediana", value: "25" },
    ]),
  );

  const jsonData = DataLabService.execute('[{"mes":"Jan","nota":7},{"mes":"Fev","nota":9}]');
  expect(jsonData.status).toBe("success");
  expect(jsonData.columns).toEqual(["mes", "nota"]);
  expect(jsonData.chart?.points).toEqual([
    { label: "Jan", y: 7 },
    { label: "Fev", y: 9 },
  ]);

  const invalidData = DataLabService.execute("colunaUnicaSemSeparador");
  expect(invalidData.status).toBe("error");
});

test("Laboratório 2.0 executa prática guiada de matemática com KaTeX, gráfico SVG e persistência", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "Novo exercício" }).click();
  await page.getByLabel("Prática guiada").selectOption("math-function");

  await expect(page.getByRole("textbox", { name: "Título do exercício" })).toHaveValue("Análise de função quadrática");
  await expect(page.getByLabel("Linguagem inicial")).toHaveValue("math");
  await page.getByRole("button", { name: "Criar laboratório" }).click();

  await expect(page.getByText("Passos guiados")).toBeVisible();
  await expect(page.getByText("0/3")).toBeVisible();
  await expect(page.locator(".katex").first()).toBeVisible();

  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expect(page.getByRole("img", { name: /Gráfico de Função quadrática e raízes/i })).toBeVisible();
  await expect(page.getByText("Mínimo", { exact: true })).toBeVisible();
  await expect(page.getByText("-1", { exact: true }).first()).toBeVisible();

  // Alterna visualização gráfica para barras
  await page.getByRole("button", { name: "Barras" }).click();
  await expect(page.getByRole("button", { name: "Barras" })).toHaveAttribute("aria-pressed", "true");

  // Marca primeiro passo guiado e recarrega para validar persistência
  await page.getByRole("checkbox", { name: /Executar a função inicial/i }).check();
  await expect(page.getByText("1/3")).toBeVisible();

  await page.reload();
  await expect(page.getByText("1/3")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Executar a função inicial/i })).toBeChecked();
  await expect(page.getByRole("img", { name: /Gráfico de Função quadrática e raízes/i })).toBeVisible();
});

test("Visualização de dados, Markdown com KaTeX, filtro lateral, restauração e responsividade funcionam", async ({ page }) => {
  await page.goto("/lab");

  // Exercício 1: Dados & Gráficos
  await page.getByRole("button", { name: "Novo exercício" }).click();
  await page.getByRole("textbox", { name: "Título do exercício" }).fill("Série de Estudos");
  await page.getByLabel("Linguagem inicial").selectOption("data");
  await page.getByRole("button", { name: "Criar laboratório" }).click();

  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expect(page.getByRole("img", { name: /Gráfico de Horas de estudo por semana/i })).toBeVisible();
  await expect(page.getByText("Mediana", { exact: true })).toBeVisible();

  // Edita código e executa imediatamente (valida que autosave debounced não sobrescreve execução imediata)
  const editor = page.getByRole("textbox", { name: "Código do exercício" });
  await editor.fill('[{"dia":"Seg","horas":2},{"dia":"Ter","horas":6}]');
  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Ter" })).toBeVisible();

  // Restaura código inicial
  await page.getByRole("button", { name: "Restaurar código inicial" }).click();
  await expect(editor).toHaveValue(/Sem 1,6/);

  // Markdown com KaTeX (e sem vazar tabela do modo anterior)
  await page.getByLabel("Linguagem do Laboratório").selectOption("markdown");
  await expect(page.getByRole("region", { name: "Preview e resultado" }).locator(".katex").first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Ter" })).toBeHidden();

  // Exercício 2: Personalizado para testar filtro lateral e responsividade mobile
  await page.getByRole("button", { name: "Novo exercício" }).click();
  await page.getByRole("textbox", { name: "Título do exercício" }).fill("Desafio JS Personalizado");
  await page.getByText("Personalizar enunciado e critério").click();
  await page.getByRole("textbox", { name: "Enunciado do exercício" }).fill("Calcule o dobro de 21.");
  await page.getByRole("textbox", { name: "Resultado esperado" }).fill("42");
  await page.getByRole("button", { name: "Criar laboratório" }).click();

  await expect(page.getByText("Calcule o dobro de 21.")).toBeVisible();
  await editor.fill("console.log(21 * 2);");
  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expect(page.getByText("42", { exact: true }).first()).toBeVisible();

  const filterInput = page.getByRole("textbox", { name: "Filtrar exercícios" });
  await filterInput.fill("Série");
  await expect(page.getByRole("button", { name: /Série de Estudos/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Desafio JS Personalizado/ })).toBeHidden();
  await filterInput.fill("");

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
