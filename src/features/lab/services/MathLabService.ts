import type { LabChartPoint, LabExecutionResult, LabMetricItem } from "../types";

type Token =
  | { type: "number"; value: number }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "paren"; value: "(" | ")" }
  | { type: "comma" };

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  tan: (x) => Math.tan(x),
  asin: (x) => Math.asin(x),
  acos: (x) => Math.acos(x),
  atan: (x) => Math.atan(x),
  sqrt: (x) => Math.sqrt(x),
  abs: (x) => Math.abs(x),
  ln: (x) => Math.log(x),
  log: (x) => Math.log10(x),
  log10: (x) => Math.log10(x),
  exp: (x) => Math.exp(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  round: (x) => Math.round(x),
  pow: (a, b) => Math.pow(a, b),
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
};

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

const MAX_POINTS = 120;
const MAX_AST_DEPTH = 64;

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const ch = expression[index];
    if (/\s/.test(ch)) {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let end = index;
      let dots = 0;
      while (end < expression.length && /[0-9.]/.test(expression[end])) {
        if (expression[end] === ".") dots += 1;
        end += 1;
      }
      if (dots > 1) throw new Error(`Número inválido próximo de "${expression.slice(index, end)}".`);
      const parsed = Number(expression.slice(index, end));
      if (!Number.isFinite(parsed)) throw new Error("Número fora do intervalo suportado.");
      tokens.push({ type: "number", value: parsed });
      index = end;
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let end = index;
      while (end < expression.length && /[a-zA-Z0-9_]/.test(expression[end])) end += 1;
      tokens.push({ type: "ident", value: expression.slice(index, end) });
      index = end;
      continue;
    }

    if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", value: ch });
      index += 1;
      continue;
    }

    if (ch === ",") {
      tokens.push({ type: "comma" });
      index += 1;
      continue;
    }

    if ("+-*/^%".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      index += 1;
      continue;
    }

    throw new Error(`Símbolo não suportado na expressão matemática: "${ch}".`);
  }

  // Insert explicit multiplication for cases like 2x, 2(x), (a)(b), x(2).
  const expanded: Token[] = [];
  for (const token of tokens) {
    const prev = expanded.at(-1);
    const prevIsValue = prev && (prev.type === "number" || (prev.type === "ident" && !(prev.value.toLowerCase() in FUNCTIONS)) || (prev.type === "paren" && prev.value === ")"));
    const nextIsFactor = token.type === "ident" || token.type === "number" || (token.type === "paren" && token.value === "(");
    const isFunctionCall = prev?.type === "ident" && prev.value.toLowerCase() in FUNCTIONS && token.type === "paren" && token.value === "(";
    if (prevIsValue && nextIsFactor && !isFunctionCall) {
      expanded.push({ type: "op", value: "*" });
    }
    expanded.push(token);
  }
  return expanded;
}

function evaluateExpression(expression: string, variables: Record<string, number>): number {
  const tokens = tokenize(expression);
  if (!tokens.length) throw new Error("Informe uma expressão matemática para calcular.");
  let cursor = 0;

  function parseAddSub(depth: number): number {
    if (depth > MAX_AST_DEPTH) throw new Error("Expressão matemática muito complexa.");
    let left = parseMulDiv(depth + 1);
    while (tokens[cursor]?.type === "op" && (tokens[cursor] as { value: string }).value.match(/^[+-]$/)) {
      const op = (tokens[cursor] as { value: string }).value;
      cursor += 1;
      const right = parseMulDiv(depth + 1);
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseMulDiv(depth: number): number {
    let left = parsePower(depth + 1);
    while (tokens[cursor]?.type === "op" && (tokens[cursor] as { value: string }).value.match(/^[*\/%]$/)) {
      const op = (tokens[cursor] as { value: string }).value;
      cursor += 1;
      const right = parsePower(depth + 1);
      if ((op === "/" || op === "%") && right === 0) {
        throw new Error("Divisão por zero encontrada durante o cálculo.");
      }
      left = op === "*" ? left * right : op === "/" ? left / right : left % right;
    }
    return left;
  }

  function parsePower(depth: number): number {
    const base = parseUnary(depth + 1);
    if (tokens[cursor]?.type === "op" && (tokens[cursor] as { value: string }).value === "^") {
      cursor += 1;
      const exponent = parsePower(depth + 1);
      return Math.pow(base, exponent);
    }
    return base;
  }

  function parseUnary(depth: number): number {
    if (tokens[cursor]?.type === "op" && ((tokens[cursor] as { value: string }).value === "-" || (tokens[cursor] as { value: string }).value === "+")) {
      const op = (tokens[cursor] as { value: string }).value;
      cursor += 1;
      const value = parseUnary(depth + 1);
      return op === "-" ? -value : value;
    }
    return parsePrimary(depth + 1);
  }

  function parsePrimary(depth: number): number {
    if (depth > MAX_AST_DEPTH) throw new Error("Expressão matemática muito aninhada.");
    const token = tokens[cursor];
    if (!token) throw new Error("Expressão incompleta.");

    if (token.type === "number") {
      cursor += 1;
      return token.value;
    }

    if (token.type === "paren" && token.value === "(") {
      cursor += 1;
      const inside = parseAddSub(depth + 1);
      const closing = tokens[cursor];
      if (!closing || closing.type !== "paren" || closing.value !== ")") {
        throw new Error("Parêntese de fechamento ausente.");
      }
      cursor += 1;
      return inside;
    }

    if (token.type === "ident") {
      const name = token.value;
      const lower = name.toLowerCase();
      cursor += 1;

      if (tokens[cursor]?.type === "paren" && (tokens[cursor] as { value: string }).value === "(") {
        const fn = FUNCTIONS[lower];
        if (!fn) throw new Error(`Função matemática desconhecida: "${name}".`);
        cursor += 1;
        const args: number[] = [];
        if (!(tokens[cursor]?.type === "paren" && (tokens[cursor] as { value: string }).value === ")")) {
          while (true) {
            args.push(parseAddSub(depth + 1));
            if (tokens[cursor]?.type === "comma") {
              cursor += 1;
              continue;
            }
            break;
          }
        }
        const close = tokens[cursor];
        if (!close || close.type !== "paren" || close.value !== ")") {
          throw new Error(`Parêntese ausente ao chamar ${name}(...).`);
        }
        cursor += 1;
        if (args.length === 0) throw new Error(`A função ${name}() exige ao menos um argumento.`);
        return fn(...args);
      }

      if (Object.prototype.hasOwnProperty.call(variables, name)) return variables[name];
      if (Object.prototype.hasOwnProperty.call(variables, lower)) return variables[lower];
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, lower)) return CONSTANTS[lower];
      throw new Error(`Variável não definida: "${name}".`);
    }

    throw new Error("Sintaxe matemática inválida.");
  }

  const value = parseAddSub(0);
  if (cursor < tokens.length) {
    throw new Error("Tokens inesperados ao final da expressão.");
  }
  return value;
}

function formatNumber(value: number) {
  if (Math.abs(value) < 1e-9) return 0;
  return Number(value.toFixed(4));
}

export const MathLabService = {
  execute(source: string): LabExecutionResult {
    const started = performance.now();
    const createdAt = new Date().toISOString();

    if (source.length > 40_000) {
      return { status: "error", output: [], error: "A especificação excede o limite de 40 mil caracteres.", durationMs: 0, createdAt };
    }

    const rawLines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!rawLines.length) {
      return { status: "error", output: [], error: "Escreva uma função ou expressão matemática para simular.", durationMs: 0, createdAt };
    }

    try {
      let title = "Simulação Matemática";
      let variableName = "x";
      let min = -5;
      let max = 5;
      let step: number | undefined;
      let functionName = "f";
      let expression = "";
      const params: Record<string, number> = {};

      for (const line of rawLines) {
        if (line.startsWith("#") || line.startsWith("//")) {
          const cleanComment = line.replace(/^(?:#|\/\/)\s*/, "");
          if (/^titulo\s*:/i.test(cleanComment)) {
            title = cleanComment.replace(/^titulo\s*:/i, "").trim() || title;
          } else if (title === "Simulação Matemática" && cleanComment) {
            title = cleanComment;
          }
          continue;
        }

        const rangeMatch = line.match(/^(?:([a-zA-Z_][a-zA-Z0-9_]*)|intervalo)\s*:\s*(-?\d+(?:\.\d+)?)\s*(?:\.\.|a|até|,)\s*(-?\d+(?:\.\d+)?)$/i);
        if (rangeMatch) {
          if (rangeMatch[1]) variableName = rangeMatch[1];
          min = Number(rangeMatch[2]);
          max = Number(rangeMatch[3]);
          continue;
        }

        const stepMatch = line.match(/^(?:passo|step)\s*:\s*(\d+(?:\.\d+)?)$/i);
        if (stepMatch) {
          step = Number(stepMatch[1]);
          continue;
        }

        const fnMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)\s*=\s*(.+)$/);
        if (fnMatch) {
          functionName = fnMatch[1];
          variableName = fnMatch[2];
          expression = fnMatch[3].trim();
          continue;
        }

        const assignMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
        if (assignMatch) {
          const lhs = assignMatch[1];
          const rhs = assignMatch[2].trim();
          if (lhs.toLowerCase() === "y") {
            expression = rhs;
          } else {
            const evaluatedParam = evaluateExpression(rhs, params);
            if (!Number.isFinite(evaluatedParam)) throw new Error(`Parâmetro "${lhs}" produziu valor não finito.`);
            params[lhs] = evaluatedParam;
          }
          continue;
        }

        expression = line;
      }

      if (!expression) {
        throw new Error("Defina uma função (ex.: f(x) = x^2 - 4) ou uma expressão numérica.");
      }

      // Check whether the expression references the sweep variable.
      const tokens = tokenize(expression);
      const usesVariable = tokens.some((token) => token.type === "ident" && token.value === variableName);

      if (!usesVariable) {
        const scalar = evaluateExpression(expression, params);
        if (!Number.isFinite(scalar)) throw new Error("A expressão resultou em um valor não numérico ou infinito.");
        const formatted = formatNumber(scalar);
        return {
          status: "success",
          output: [`${expression} = ${formatted}`],
          metrics: [{ label: "Resultado", value: String(formatted) }],
          durationMs: Math.round(performance.now() - started),
          createdAt,
        };
      }

      if (!(max > min)) {
        throw new Error("O intervalo precisa ter limite final maior que o inicial.");
      }

      const span = max - min;
      const effectiveStep = step && step > 0 ? step : Number((span / 20).toFixed(4));
      if (effectiveStep <= 0) throw new Error("O passo da simulação deve ser maior que zero.");

      const count = Math.floor(span / effectiveStep) + 1;
      if (count > MAX_POINTS) {
        throw new Error(`A simulação gera ${count} pontos; o limite seguro é ${MAX_POINTS}. Aumente o passo.`);
      }

      const points: LabChartPoint[] = [];
      const rows: Array<Array<string | number | null>> = [];
      const roots: string[] = [];

      for (let i = 0; i < count; i += 1) {
        const xVal = formatNumber(min + i * effectiveStep);
        const yRaw = evaluateExpression(expression, { ...params, [variableName]: xVal });
        if (!Number.isFinite(yRaw)) continue;
        const yVal = formatNumber(yRaw);
        const prev = points.at(-1);
        if (prev) {
          if (yVal === 0) roots.push(`${variableName} = ${xVal}`);
          else if ((prev.y < 0 && yVal > 0) || (prev.y > 0 && yVal < 0)) {
            roots.push(`entre ${prev.label} e ${xVal}`);
          }
        } else if (yVal === 0) {
          roots.push(`${variableName} = ${xVal}`);
        }
        points.push({ label: String(xVal), x: xVal, y: yVal });
        rows.push([xVal, yVal]);
      }

      if (!points.length) {
        throw new Error("Nenhum ponto finito foi gerado nesse intervalo.");
      }

      const ys = points.map((point) => point.y);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const avgY = formatNumber(ys.reduce((sum, item) => sum + item, 0) / ys.length);
      const fnLabel = `${functionName}(${variableName})`;

      const metrics: LabMetricItem[] = [
        { label: "Pontos", value: String(points.length) },
        { label: "Mínimo", value: String(minY) },
        { label: "Máximo", value: String(maxY) },
        { label: "Média", value: String(avgY) },
      ];

      const output = [
        `${fnLabel} = ${expression} em [${min}, ${max}] (${points.length} pontos)`,
        `Mínimo: ${minY} · Máximo: ${maxY} · Média: ${avgY}`,
        roots.length ? `Raiz(es) / cruzamentos em zero: ${[...new Set(roots)].slice(0, 4).join(", ")}` : "Nenhum cruzamento de zero detectado no intervalo.",
      ];

      return {
        status: "success",
        output,
        columns: [variableName, fnLabel],
        rows,
        metrics,
        chart: {
          kind: "line",
          title,
          xLabel: variableName,
          yLabel: fnLabel,
          points,
        },
        durationMs: Math.round(performance.now() - started),
        createdAt,
      };
    } catch (error) {
      return {
        status: "error",
        output: [],
        error: error instanceof Error ? error.message : "Não foi possível calcular a expressão matemática.",
        durationMs: Math.round(performance.now() - started),
        createdAt,
      };
    }
  },
};
