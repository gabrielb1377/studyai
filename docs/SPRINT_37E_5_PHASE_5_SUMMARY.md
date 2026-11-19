# Sprint 37E.5 Phase 5 — Rate Limit Persistente (PostgreSQL) — Summary

**Data:** 2026-10-22  
**Branch:** `v1.1-development`  
**Commit Base:** `2ca9a94` (Sprint 37E.4)

---

## 🎯 Objetivo da Fase 5

Migrar o rate limiting de **in-memory Map** para **PostgreSQL com operações atômicas**, garantindo:
- Persistência entre restarts
- Atomicidade para prevenir race conditions
- Funcionamento em múltiplas instâncias
- Política fail-closed para rate limits críticos

---

## 📦 Entregas

### 1. Nova Tabela `rate_limits` (`schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_bucket BIGINT NOT NULL,
  count BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (key, window_bucket)
);
CREATE INDEX IF NOT EXISTS rate_limits_bucket ON rate_limits(window_bucket);
```

### 2. Novo Serviço `RateLimitService.ts`

| Método | Descrição |
|--------|-----------|
| `checkAndConsume(key, {limit, windowMs})` | Operação atômica UPSERT + retorno de status |
| `getStatus(key, {limit, windowMs})` | Consulta sem consumir |
| `cleanup(maxAgeMs)` | Limpeza de registros expirados |

**Características:**
- ✅ Operações atômicas via `INSERT ... ON CONFLICT DO UPDATE`
- ✅ Fallback in-memory para desenvolvimento (sem Postgres)
- ✅ Fail-closed: erro no DB lança exceção (caller decide)
- ✅ Janela configurável (ex: 60s, 15min, 1h)
- ✅ Limpeza automática de buckets antigos

### 3. `RateLimit.ts` Atualizado

- Agora é **async** e delega para `RateLimitService`
- Mantém fallback in-memory para falhas não-críticas
- Interface compatível: `rateLimit(key, limit, windowMs)`

### 4. Migração de Todos os Callers (22 arquivos)

| Arquivo | Tipo | Limite |
|---------|------|--------|
| `src/app/api/account/api-keys/route.ts` | POST | 10 req/15min |
| `src/app/api/feedback/route.ts` | POST | 5 req/10min |
| `src/app/api/files/[id]/route.ts` | PUT | 30 req/1h |
| `src/app/api/telemetry/route.ts` | POST | 120 req/1min |
| `src/app/auth/login/route.ts` | POST | 10 req/15min |
| `src/app/auth/register/route.ts` | POST | 5 req/15min |
| `src/app/auth/recover/route.ts` | POST | 5 req/15min |
| `src/app/sync/route.ts` | POST | 120 req/1min |
| `src/app/api/collaboration/*` (12 routes) | POST/PATCH/DELETE | 120 req/1min |
| `src/server/collaboration/http.ts` | Helper | 120 req/1min |

---

## ✅ Validações

| Check | Resultado |
|-------|-----------|
| `npm run lint` | ✅ 0 erros, 78 warnings (pré-existentes) |
| `npm run typecheck` | ✅ Limpo |
| `npm run build` | ✅ 11.9s, 45 rotas, 104 kB shared |
| `npm audit --omit=dev` | ✅ 4 low (katex chain) — **Crítico/High FIXED** |
| `git diff --check` | ✅ Clean (apenas CRLF warnings) |
| Testes E2E (amostra) | ✅ tutor, ai-core, foundation, cloud-sync, collaboration — **TODOS PASSAM** |

---

## 🔒 Melhorias de Segurança

### Antes (In-Memory)
```typescript
// Race condition possível
const bucket = buckets.get(key);
if (!bucket || bucket.resetAt <= timestamp) { ... }
bucket.count += 1; // Não atômico!
```

### Depois (PostgreSQL Atômico)
```sql
-- Operação única atômica
INSERT INTO rate_limits (key, window_bucket, count)
VALUES ($1, $2, 1)
ON CONFLICT (key, window_bucket)
DO UPDATE SET count = rate_limits.count + 1
RETURNING count;
```

### Políticas de Fail-Closed
| Cenário | Comportamento |
|---------|---------------|
| DB indisponível (rate limit crítico) | Lança erro → caller bloqueia |
| DB indisponível (rate limit não-crítico) | Fallback in-memory → allow |
| Restart do servidor | Contadores persistem no DB |
| Múltiplas instâncias | Compartilham mesma tabela |

---

## 📊 Métricas de Impacto

| Métrica | Antes | Depois |
|---------|-------|--------|
| Persistência | ❌ Perdida no restart | ✅ PostgreSQL |
| Atomicidade | ❌ Race condition | ✅ UPSERT atômico |
| Multi-instância | ❌ Não funciona | ✅ Funciona |
| Limpeza expirados | ❌ Manual/inexistente | ✅ `cleanup()` automático |
| Fail-closed | ❌ Não implementado | ✅ Configurável por caller |

---

## 📝 Próximos Passos (Phase 6)

1. **Testes de Concorrência** — Validar atomicidade sob carga
2. **Testes de Race Condition** — Simular requisições simultâneas
3. **Testes de Fail-Closed** — Verificar comportamento com DB indisponível

---

*Resumo gerado como parte da Sprint 37E.5 Phase 5 — Rate Limit Persistente.*