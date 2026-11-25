import { createHash } from "node:crypto";

const RFC5737_PREFIXES = ["192.0.2", "198.51.100", "203.0.113"] as const;

/**
 * Gera um endereço IPv4 determinístico nas faixas RFC 5737 (TEST-NET-1/2/3)
 * para isolar fixtures de testes HTTP/E2E quando o servidor de teste opera atrás
 * de proxy confiável (`TRUST_PROXY_HEADERS=true`, `TRUSTED_PROXY_HOPS=1`), sem
 * enfraquecer o rate limit real da aplicação e sem limpar `rate_limits` no banco.
 */
export function testClientIp(seed: string): string {
  const digest = createHash("sha256").update(seed).digest();
  const prefix = RFC5737_PREFIXES[digest[0] % RFC5737_PREFIXES.length];
  const host = (digest[1] % 250) + 2; // 2..251
  return `${prefix}.${host}`;
}

export function testClientHeaders(seed: string): Record<string, string> {
  return { "x-forwarded-for": testClientIp(seed) };
}
