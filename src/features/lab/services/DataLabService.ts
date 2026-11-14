import type { LabChartPoint, LabExecutionResult, LabMetricItem } from "../types";

const MAX_ITEMS = 200;
const MAX_COLUMNS = 12;

function formatStat(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function median(sorted: number[]) {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function parseCsvLine(line: string, delimiter: string) {
  return line.split(delimiter).map((part) => part.trim().replace(/^["']|["']$/g, ""));
}

export const DataLabService = {
  execute(source: string): LabExecutionResult {
    const started = performance.now();
    const createdAt = new Date().toISOString();

    if (source.length > 40_000) {
      return { status: "error", output: [], error: "O conjunto de dados excede o limite de 40 mil caracteres.", durationMs: 0, createdAt };
    }

    const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
      return { status: "error", output: [], error: "Cole dados em CSV ou JSON para visualizar gráficos e estatísticas.", durationMs: 0, createdAt };
    }

    let chartKind: "bar" | "line" = "bar";
    let title = "Visualização de Dados";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("#") || line.startsWith("//")) {
        const clean = line.replace(/^(?:#|\/\/)\s*/, "");
        if (/^(?:grafico|tipo)\s*:\s*(?:linha|line)/i.test(clean)) chartKind = "line";
        else if (/^(?:grafico|tipo)\s*:\s*(?:barra|bar)/i.test(clean)) chartKind = "bar";
        else if (/^titulo\s*:/i.test(clean)) title = clean.replace(/^titulo\s*:/i, "").trim() || title;
        else if (title === "Visualização de Dados" && clean) title = clean;
        continue;
      }
      dataLines.push(line);
    }

    const body = dataLines.join("\n").trim();
    if (!body) {
      return { status: "error", output: [], error: "Nenhum dado tabular encontrado após os comentários.", durationMs: 0, createdAt };
    }

    try {
      let columns: string[] = [];
      let rows: Array<Array<string | number | null>> = [];
      let points: LabChartPoint[] = [];

      if (body.startsWith("[")) {
        const parsed = JSON.parse(body) as unknown;
        if (!Array.isArray(parsed) || !parsed.length) {
          throw new Error("O JSON deve ser uma lista não vazia de itens.");
        }
        const limited = parsed.slice(0, MAX_ITEMS);
        if (typeof limited[0] === "number") {
          columns = ["Índice", "Valor"];
          rows = limited.map((value, idx) => {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) throw new Error("Todos os valores numéricos da lista JSON devem ser válidos.");
            points.push({ label: String(idx + 1), x: idx + 1, y: numeric });
            return [idx + 1, numeric];
          });
        } else if (typeof limited[0] === "object" && limited[0] !== null) {
          const objects = limited as Array<Record<string, unknown>>;
          columns = Object.keys(objects[0]).slice(0, MAX_COLUMNS);
          const numericCol = columns.find((col) => objects.every((item) => typeof item[col] === "number" && Number.isFinite(item[col] as number)));
          const labelCol = columns.find((col) => col !== numericCol) ?? columns[0];
          if (!numericCol) throw new Error("Inclua ao menos uma coluna numérica no JSON para gerar o gráfico.");
          rows = objects.map((item) => columns.map((col) => {
            const val = item[col];
            return typeof val === "string" || typeof val === "number" ? val : val === null ? null : JSON.stringify(val);
          }));
          points = objects.map((item, idx) => ({
            label: String(item[labelCol] ?? idx + 1),
            y: Number(item[numericCol]),
          }));
        } else {
          throw new Error("Formato JSON não suportado. Use lista de objetos ou números.");
        }
      } else {
        const delimiter = body.includes(";") && !body.includes(",") ? ";" : ",";
        const rawRows = dataLines.slice(0, MAX_ITEMS + 1).map((line) => parseCsvLine(line, delimiter));
        const first = rawRows[0];
        if (!first || first.length < 2) {
          throw new Error("Informe ao menos duas colunas separadas por vírgula ou ponto e vírgula (ex.: Item,Valor).");
        }
        const firstSecondIsNumber = Number.isFinite(Number(first[1])) && first[1] !== "";
        const bodyRows = firstSecondIsNumber ? rawRows : rawRows.slice(1);
        if (!bodyRows.length) throw new Error("Adicione pelo menos uma linha de dados.");

        columns = (firstSecondIsNumber ? first.map((_, idx) => (idx === 0 ? "Categoria" : `Valor ${idx}`)) : first).slice(0, MAX_COLUMNS);
        const numericColIndex = columns.findIndex((_, idx) =>
          bodyRows.every((row) => row[idx] !== undefined && row[idx] !== "" && Number.isFinite(Number(row[idx]))),
        );
        if (numericColIndex < 0) {
          throw new Error("Nenhuma coluna totalmente numérica encontrada para plotagem.");
        }
        const labelColIndex = numericColIndex === 0 ? 1 : 0;
        rows = bodyRows.map((row) =>
          columns.map((_, idx) => {
            const raw = row[idx] ?? "";
            const num = Number(raw);
            return raw !== "" && Number.isFinite(num) ? num : raw;
          }),
        );
        points = bodyRows.map((row, idx) => ({
          label: row[labelColIndex] || `#${idx + 1}`,
          y: Number(row[numericColIndex]),
        }));
      }

      const values = points.map((point) => point.y);
      const sum = values.reduce((acc, value) => acc + value, 0);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = sum / values.length;
      const med = median([...values].sort((a, b) => a - b));

      const metrics: LabMetricItem[] = [
        { label: "Registros", value: String(values.length) },
        { label: "Média", value: formatStat(avg) },
        { label: "Mediana", value: formatStat(med) },
        { label: "Mín / Máx", value: `${formatStat(min)} / ${formatStat(max)}` },
      ];

      return {
        status: "success",
        output: [
          `${title}: ${values.length} registro(s) analisados`,
          `Soma: ${formatStat(sum)} · Média: ${formatStat(avg)} · Mediana: ${formatStat(med)}`,
          `Mínimo: ${formatStat(min)} · Máximo: ${formatStat(max)}`,
        ],
        columns,
        rows,
        metrics,
        chart: {
          kind: chartKind,
          title,
          xLabel: columns[0],
          yLabel: columns[1] ?? "Valor",
          points,
        },
        durationMs: Math.round(performance.now() - started),
        createdAt,
      };
    } catch (error) {
      return {
        status: "error",
        output: [],
        error: error instanceof Error ? error.message : "Não foi possível analisar os dados informados.",
        durationMs: Math.round(performance.now() - started),
        createdAt,
      };
    }
  },
};
