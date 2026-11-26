/**
 * StudyAI — Tool Engine (TE-1)
 * Parser seguro de intenções e validador estrito de esquemas de entrada/saída.
 *
 * - Nunca usa eval ou new Function.
 * - Bloqueia prototype pollution (__proto__, constructor, prototype).
 * - Bloqueia campos extras e tentativas de override de identidade/permissões/confirmação.
 * - Valida tamanho em bytes e profundidade máxima.
 */

import type { ToolIntent, ToolLimitsContract, ToolObjectSchema, ToolPropertySchema } from "./types";

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const OVERRIDE_ATTEMPT_KEYS = new Set([
  "userId",
  "sessionId",
  "turnId",
  "skillId",
  "skillVersion",
  "permissions",
  "grantedPermissions",
  "grantedScopes",
  "scope",
  "limits",
  "class",
  "confirmed",
  "confirmedByUser",
  "confirmation",
  "confirmationId",
  "previewShown",
  "audit",
  "executor",
]);

function byteLengthUtf8(str: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str).length;
  }
  return Buffer.byteLength(str, "utf8");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function hasForbiddenKeyDeep(value: unknown, maxDepth = 12, depth = 0): boolean {
  if (depth > maxDepth) return true;
  if (Array.isArray(value)) {
    return value.some((item) => hasForbiddenKeyDeep(item, maxDepth, depth + 1));
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key)) return true;
      if (hasForbiddenKeyDeep((value as Record<string, unknown>)[key], maxDepth, depth + 1)) {
        return true;
      }
    }
  }
  return false;
}

export function measureDepth(value: unknown, current = 0): number {
  if (value === null || typeof value !== "object") return current;
  if (Array.isArray(value)) {
    if (value.length === 0) return current + 1;
    return Math.max(...value.map((item) => measureDepth(item, current + 1)));
  }
  const entries = Object.values(value as Record<string, unknown>);
  if (entries.length === 0) return current + 1;
  return Math.max(...entries.map((item) => measureDepth(item, current + 1)));
}

/**
 * Canonicaliza deterministicamente (toolId + args) para fingerprint de loop e confirmação.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

export function computeArgsFingerprint(toolId: string, args: Readonly<Record<string, unknown>>): string {
  return `${toolId}::${canonicalize(args)}`;
}

export type ParseIntentResult =
  | { readonly ok: true; readonly intent: ToolIntent }
  | {
      readonly ok: false;
      readonly reason: "invalid_intent_format" | "prototype_pollution_blocked" | "override_attempt_blocked";
      readonly error: string;
    };

/**
 * Interpreta estritamente o protocolo {"tool":"<id>","args":{...}}.
 * Rejeita texto livre, Markdown, blocos cercados, campos extras e prototype pollution.
 */
export function parseToolIntent(raw: unknown, maxBytes = 16_384): ParseIntentResult {
  let candidate: unknown;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
      return {
        ok: false,
        reason: "invalid_intent_format",
        error: "Intenção deve ser estritamente um objeto JSON {\"tool\":\"<id>\",\"args\":{...}}.",
      };
    }
    if (byteLengthUtf8(trimmed) > maxBytes) {
      return {
        ok: false,
        reason: "invalid_intent_format",
        error: "Intenção excede o limite máximo de bytes permitido.",
      };
    }
    // Bloqueia chaves perigosas já no texto bruto antes do JSON.parse
    if (/"(?:__proto__|constructor|prototype)"\s*:/.test(trimmed)) {
      return {
        ok: false,
        reason: "prototype_pollution_blocked",
        error: "Chaves de manipulação de protótipo são bloqueadas.",
      };
    }
    try {
      candidate = JSON.parse(trimmed);
    } catch {
      return {
        ok: false,
        reason: "invalid_intent_format",
        error: "JSON de intenção malformado.",
      };
    }
  } else if (isPlainObject(raw)) {
    candidate = raw;
  } else {
    return {
      ok: false,
      reason: "invalid_intent_format",
      error: "Intenção inválida: esperado objeto JSON ou string JSON estrita.",
    };
  }

  if (!isPlainObject(candidate)) {
    return {
      ok: false,
      reason: "invalid_intent_format",
      error: "Raiz da intenção deve ser um objeto simples.",
    };
  }

  if (hasForbiddenKeyDeep(candidate)) {
    return {
      ok: false,
      reason: "prototype_pollution_blocked",
      error: "Propriedades proibidas de protótipo detectadas na intenção.",
    };
  }

  const rootKeys = Object.keys(candidate);
  for (const key of rootKeys) {
    if (key !== "tool" && key !== "args") {
      if (OVERRIDE_ATTEMPT_KEYS.has(key)) {
        return {
          ok: false,
          reason: "override_attempt_blocked",
          error: `Campo de override não permitido na intenção: "${key}".`,
        };
      }
      return {
        ok: false,
        reason: "invalid_intent_format",
        error: `Campo extra não permitido na raiz da intenção: "${key}".`,
      };
    }
  }

  if (typeof candidate.tool !== "string" || !candidate.tool.trim()) {
    return {
      ok: false,
      reason: "invalid_intent_format",
      error: "Campo 'tool' deve ser uma string não vazia.",
    };
  }

  if (!isPlainObject(candidate.args)) {
    return {
      ok: false,
      reason: "invalid_intent_format",
      error: "Campo 'args' deve ser um objeto JSON simples.",
    };
  }

  // Bloqueia tentativas de override dentro de args (ex.: confirmed=true, userId, permissions)
  for (const argKey of Object.keys(candidate.args)) {
    if (OVERRIDE_ATTEMPT_KEYS.has(argKey)) {
      return {
        ok: false,
        reason: "override_attempt_blocked",
        error: `Argumento de override não permitido: "${argKey}".`,
      };
    }
  }

  return {
    ok: true,
    intent: {
      tool: candidate.tool.trim(),
      args: candidate.args,
    },
  };
}

function validateValue(
  value: unknown,
  schema: ToolPropertySchema,
  path: string,
  limits: ToolLimitsContract,
  errors: string[],
): void {
  if (schema.type === "string") {
    if (typeof value !== "string") {
      errors.push(`${path} deve ser string.`);
      return;
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path} abaixo do tamanho mínimo (${schema.minLength}).`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path} excede o tamanho máximo (${schema.maxLength}).`);
    }
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${path} fora dos valores permitidos.`);
    }
    return;
  }

  if (schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`${path} deve ser número finito.`);
      return;
    }
    if (schema.min !== undefined && value < schema.min) {
      errors.push(`${path} abaixo do mínimo (${schema.min}).`);
    }
    if (schema.max !== undefined && value > schema.max) {
      errors.push(`${path} acima do máximo (${schema.max}).`);
    }
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${path} fora dos valores permitidos.`);
    }
    return;
  }

  if (schema.type === "boolean") {
    if (typeof value !== "boolean") {
      errors.push(`${path} deve ser booleano.`);
      return;
    }
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${path} fora dos valores permitidos.`);
    }
    return;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path} deve ser array.`);
      return;
    }
    const maxItems = Math.min(schema.maxItems ?? limits.maxItems, limits.maxItems);
    if (value.length > maxItems) {
      errors.push(`${path} excede o limite de itens (${maxItems}).`);
      return;
    }
    if (schema.items) {
      value.forEach((item, idx) => validateValue(item, schema.items!, `${path}[${idx}]`, limits, errors));
    }
    return;
  }

  if (schema.type === "object") {
    if (!isPlainObject(value)) {
      errors.push(`${path} deve ser objeto.`);
      return;
    }
    const allowedProps = schema.properties ?? {};
    for (const key of Object.keys(value)) {
      if (!(key in allowedProps)) {
        errors.push(`${path}.${key} é campo extra não autorizado.`);
      }
    }
    for (const reqKey of schema.required ?? []) {
      if (!(reqKey in value) || value[reqKey] === undefined) {
        errors.push(`${path}.${reqKey} é obrigatório.`);
      }
    }
    for (const [key, propSchema] of Object.entries(allowedProps)) {
      if (key in value && value[key] !== undefined) {
        validateValue(value[key], propSchema, `${path}.${key}`, limits, errors);
      }
    }
  }
}

export function validateObjectAgainstSchema(
  value: unknown,
  schema: ToolObjectSchema,
  limits: ToolLimitsContract,
  direction: "input" | "output",
): { readonly valid: boolean; readonly errors: readonly string[] } {
  const errors: string[] = [];

  if (!isPlainObject(value)) {
    return { valid: false, errors: [`Payload de ${direction} deve ser um objeto JSON simples.`] };
  }

  if (hasForbiddenKeyDeep(value, limits.maxDepth)) {
    return { valid: false, errors: [`Payload de ${direction} contém chave proibida ou excede profundidade máxima.`] };
  }

  if (measureDepth(value) > limits.maxDepth) {
    errors.push(`Profundidade de ${direction} excede o limite (${limits.maxDepth}).`);
  }

  const serialized = JSON.stringify(value);
  const maxBytes = direction === "input" ? limits.maxInputBytes : limits.maxOutputBytes;
  if (byteLengthUtf8(serialized) > maxBytes) {
    errors.push(`Tamanho de ${direction} excede o limite (${maxBytes} bytes).`);
  }

  for (const key of Object.keys(value)) {
    if (!(key in schema.properties)) {
      errors.push(`Campo extra não autorizado em ${direction}: "${key}".`);
    }
  }

  for (const reqKey of schema.required ?? []) {
    if (!(reqKey in value) || value[reqKey] === undefined) {
      errors.push(`Campo obrigatório ausente em ${direction}: "${reqKey}".`);
    }
  }

  for (const [key, propSchema] of Object.entries(schema.properties)) {
    if (key in value && value[key] !== undefined) {
      validateValue(value[key], propSchema, `${direction}.${key}`, limits, errors);
    }
  }

  return { valid: errors.length === 0, errors };
}
